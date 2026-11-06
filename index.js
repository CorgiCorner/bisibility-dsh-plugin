import { execFile } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { featuredStep, recentPrompt, RECENT_LIMIT } from './ask.js'
import { registerBundledSkills } from './skills.js'
import { shapeWorkflows, WORKFLOW_CATEGORIES } from './workflows.js'

/**
 * Bisibility OAuth bridge.
 *
 * The shipped MCP client (`@deepseek-ai/dsh-mcp-client`) takes a static
 * `Authorization` header and knows nothing about OAuth, while the hosted
 * Bisibility MCP resource is an OAuth 2.1 protected resource. This Host half
 * closes that gap without forking the client:
 *
 *   1. It owns the browser authorization-code flow (dynamic client
 *      registration, PKCE S256, refresh tokens) and keeps tokens in the
 *      harness credential store, never in a patch file or the environment.
 *   2. It serves a loopback proxy at `/bisibility/mcp` that adds a fresh
 *      Bearer token to every upstream request.
 *   3. It mounts the shipped MCP client on the proxy only once a token
 *      exists, so the client never starts against an unauthenticated
 *      endpoint and never exhausts its reconnect budget.
 *
 * The panel talks to the same routes from the Web page, so it needs no
 * Remote namespace of its own.
 */

/** Where this bundle keeps its routes. */
const BASE = '/bisibility'

/** Defaults for the Bisibility hosted service. */
const DEFAULTS = {
  issuer: 'https://eu.bisibility.com',
  resource: 'https://bisibility.com/api/mcp',
  clientName: 'DeepSeek Harness',
  scope: 'openid email read write offline_access',
  serverName: 'bisibility',
  toolCallTimeoutMs: 300000,
}

/** Credential references that survive restarts. */
const CLIENT_ID_REF = 'BISIBILITY_OAUTH_CLIENT_ID'
const REFRESH_TOKEN_REF = 'BISIBILITY_OAUTH_REFRESH_TOKEN'
const PENDING_REF = 'BISIBILITY_OAUTH_PENDING'

/** Refuse a proxy request body larger than this, in bytes. */
const MAX_BODY_BYTES = 64 * 1024 * 1024

/** A pending authorization is abandoned after this long, in milliseconds. */
const PENDING_TTL_MS = 15 * 60 * 1000

/** How many concurrent sign-in tabs are remembered. */
const MAX_PENDING = 4

/** Refresh the access token this far before it actually expires, in milliseconds. */
const REFRESH_SKEW_MS = 60 * 1000

/** Deadline for dynamic client registration, in milliseconds. */
const DCR_TIMEOUT_MS = 30000

/** Deadline for one token request, in milliseconds. */
const TOKEN_TIMEOUT_MS = 30000

/** Deadline for the optional account lookup, in milliseconds. */
const USERINFO_TIMEOUT_MS = 10000

/**
 * The proxy waits longer than the MCP client's own tool deadline, so the client
 * reports its timeout instead of being preempted by this bridge.
 */
const PROXY_GRACE_MS = 30000

/** Plugin market index that lists the published versions of this plugin. */
const MARKET_INDEX_URL = 'https://corgicorner.github.io/bisibility-dsh-plugin/index.json'

/** How often the Host asks the market index for a newer version, in milliseconds. */
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

/** Deadline for one market index read, in milliseconds. */
const UPDATE_CHECK_TIMEOUT_MS = 10000

/** How long a status read waits for a reconnect attempt before answering. */
const STATUS_RECONNECT_WAIT_MS = 5000

/** Request header that tells the MCP server which client and version calls it. */
const CLIENT_HEADER = 'x-bisibility-client'

/** Response header that repeats the minimum version of a `426` answer. */
const MIN_VERSION_HEADER = 'x-bisibility-min-version'

/** A version the bridge accepts from the server. */
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/**
 * Read the deployment overrides this bundle accepts from its patch row.
 * @param config - the row config, or undefined when the row declares none.
 * @returns resolved service settings.
 */
function resolveSettings(config) {
  const source = config !== null && typeof config === 'object' ? config : {}
  const text = (value, fallback) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback)
  return {
    issuer: text(source.issuer, DEFAULTS.issuer).replace(/\/$/, ''),
    resource: text(source.resource, DEFAULTS.resource),
    clientName: text(source.clientName, DEFAULTS.clientName),
    scope: text(source.scope, DEFAULTS.scope),
    serverName: text(source.serverName, DEFAULTS.serverName),
    toolCallTimeoutMs: Number.isFinite(source.toolCallTimeoutMs) ? source.toolCallTimeoutMs : DEFAULTS.toolCallTimeoutMs,
  }
}

/**
 * Normalize an unknown thrown value for logs and status payloads.
 * @param error - anything thrown.
 * @returns a short message.
 */
function messageOf(error) {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * Turn a failed fetch into a message that names the operation and its deadline.
 * @param label - the operation that failed.
 * @param timeoutMs - deadline applied to that request.
 * @param error - the thrown value.
 * @returns an operator-readable message.
 */
function fetchFailure(label, timeoutMs, error) {
  const seconds = Math.round(timeoutMs / 1000)
  const text = messageOf(error)
  if ((error instanceof Error && error.name === 'TimeoutError') || /aborted due to timeout/i.test(text)) {
    return `${label} did not answer within ${seconds}s`
  }
  // Node reports every network failure as a bare "fetch failed"; the cause names it.
  const code = error instanceof Error && typeof error.cause?.code === 'string' ? error.cause.code : null
  return `${label} failed: ${text}${code === null ? '' : ` (${code})`}`
}

/**
 * A failed host-side tool call. `kind` tells the caller which recovery applies:
 * `auth`, `network`, `jsonrpc`, or `protocol`.
 */
export class ToolCallError extends Error {
  /**
   * @param kind - which failure this is.
   * @param message - operator-readable message.
   * @param details - optional JSON-RPC code, data, HTTP status, and cause.
   */
  constructor(kind, message, details = {}) {
    super(message, details.cause !== undefined ? { cause: details.cause } : undefined)
    this.name = 'ToolCallError'
    this.kind = kind
    if (details.code !== undefined) this.code = details.code
    if (details.data !== undefined) this.data = details.data
    if (details.status !== undefined) this.status = details.status
    if (typeof details.tool === 'string') this.tool = details.tool
    if (typeof details.contentType === 'string') this.contentType = details.contentType
    if (details.nonJson === true) this.nonJson = true
  }
}

/**
 * Whether `text` already contains one complete SSE event with a `data:` field.
 * A trailing partial line does not count, so a chunk boundary cannot close the frame early.
 * @param text - the bytes read so far, decoded.
 * @returns true once a blank line has closed that event.
 */
function sseFrameClosed(text) {
  let sawData = false
  const parts = String(text).split(/\r?\n/)
  for (const line of parts.slice(0, -1)) {
    if (line === '') {
      if (sawData) return true
      continue
    }
    if (line.startsWith('data:')) sawData = true
  }
  return false
}

/**
 * Read the first SSE `data:` frame. Later events in the same body are ignored.
 * @param text - the response body.
 * @returns the data payload.
 */
function firstSseData(text) {
  const data = []
  for (const line of String(text).split(/\r?\n/)) {
    if (line === '') {
      if (data.length > 0) break
      continue
    }
    if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
  }
  if (data.length === 0) throw new SyntaxError('event stream has no data')
  return data.join('\n')
}

/**
 * Read a JSON body, or only the first SSE event when the server streams.
 * Cancelling the remainder keeps a session stream from holding the call open.
 * @param response - the upstream response.
 * @returns the text to parse.
 */
async function readUpstreamBody(response) {
  const type = (response.headers.get('content-type') ?? '').toLowerCase()
  if (!type.includes('text/event-stream') || response.body === null || typeof response.body.getReader !== 'function') {
    return response.text()
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
      if (sseFrameClosed(text)) break
    }
    text += decoder.decode()
  } finally {
    await reader.cancel().catch(() => {})
  }
  return text
}

/**
 * Release a response this helper will not parse.
 * @param response - an unused upstream response.
 */
async function discardResponse(response) {
  try {
    await response.body?.cancel?.()
  } catch (error) {
    /* the rejected response is unused */
  }
}

/**
 * Parse a JSON-RPC body, or the first SSE `data:` frame when the server streams.
 * @param text - the response body.
 * @param contentType - the response content type, if any.
 * @returns the parsed JSON-RPC object.
 */
function decodeToolPayload(text, contentType) {
  const type = typeof contentType === 'string' ? contentType.toLowerCase() : ''
  const trimmed = text.trim()
  const stream =
    type.includes('text/event-stream') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('event:') ||
    trimmed.startsWith(':')
  return stream ? JSON.parse(firstSseData(text)) : JSON.parse(trimmed)
}

/**
 * Join the text blocks of a tool result. Non-text blocks are skipped.
 * @param content - the MCP `content` array.
 * @returns the combined text.
 */
function textFromToolContent(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
}

/**
 * Turn one tools/call response into structured content or text, plus `isError`.
 * @param response - the upstream response.
 * @returns the tool result.
 */
function argShape(args) {
  if (args === null || args === undefined || typeof args !== 'object' || Array.isArray(args)) return {}
  const shape = {}
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) shape[key] = value
    else if (typeof value === 'string' && (/^(?:prj_|agr_|kw_|lmn_)[a-z0-9]+$/i.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value))) shape[key] = value
    else if (typeof value === 'string') shape[key] = `string(${value.length})`
    else shape[key] = typeof value
  }
  return shape
}

function formatArgShape(args) {
  const shape = argShape(args)
  const parts = Object.entries(shape).map(([key, value]) => `${key}=${value}`)
  return parts.length === 0 ? '{}' : parts.join(',')
}

function noteToolFailure(logger, name, args, response, nonJson) {
  const status = typeof response?.status === 'number' ? response.status : 'none'
  if (nonJson !== true && !(typeof status === 'number' && status >= 500)) return
  const type = response?.headers?.get?.('content-type') || 'none'
  logger?.warn?.(`bisibility: tool ${name} status ${status} type ${type} nonjson ${nonJson === true} args ${formatArgShape(args)}`)
}

async function readToolResult(response, meta = {}) {
  const text = await readUpstreamBody(response)
  const contentType = response.headers.get('content-type') || ''
  let payload
  try {
    payload = decodeToolPayload(text, contentType)
  } catch (error) {
    noteToolFailure(meta.logger, meta.name, meta.args, response, true)
    throw new ToolCallError('protocol', `the bisibility tool call returned an unreadable response (HTTP ${response.status})`, {
      status: response.status,
      cause: error,
      tool: meta.name,
      contentType,
      nonJson: true,
    })
  }
  if (payload !== null && typeof payload === 'object' && payload.error !== undefined && payload.error !== null) {
    const rpc = typeof payload.error === 'object' ? payload.error : {}
    const message = typeof rpc.message === 'string' ? rpc.message : 'the bisibility tool call was rejected'
    throw new ToolCallError('jsonrpc', message, { code: rpc.code, data: rpc.data, status: response.status, tool: meta.name })
  }
  if (!response.ok) {
    noteToolFailure(meta.logger, meta.name, meta.args, response, false)
    throw new ToolCallError('protocol', `the bisibility tool call failed with HTTP ${response.status}`, {
      status: response.status,
      tool: meta.name,
      contentType,
    })
  }
  const result = payload !== null && typeof payload === 'object' ? payload.result : undefined
  if (result === null || typeof result !== 'object') {
    throw new ToolCallError('protocol', 'the bisibility tool call returned no result', { status: response.status, tool: meta.name })
  }
  const isError = result.isError === true
  if ('structuredContent' in result) return { structuredContent: result.structuredContent, isError }
  return { text: textFromToolContent(result.content), isError }
}

/**
 * Encode bytes as an unpadded base64url string, as PKCE and state values require.
 * @param buffer - bytes to encode.
 * @returns base64url text.
 */
function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Send a JSON response with no caching.
 * @param res - the HTTP response.
 * @param status - HTTP status code.
 * @param payload - JSON-serializable body.
 */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(body)
}

/**
 * Escape text interpolated into the callback page.
 * @param value - untrusted text such as an authorization-server error description.
 * @returns HTML-safe text.
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Send the small page the OAuth callback shows in the browser.
 * @param res - the HTTP response.
 * @param status - HTTP status code.
 * @param page - headline, detail, the way back, and whether to return automatically.
 */
function sendPage(res, status, page) {
  const { title, detail, returnTo = null, autoReturn = false } = page
  const back =
    returnTo === null
      ? ''
      : `<p class="back"><a href="${escapeHtml(returnTo)}">Back to DeepSeek Harness</a></p>`
  const redirect =
    returnTo !== null && autoReturn
      ? `<script>setTimeout(function(){location.href=${JSON.stringify(returnTo).replace(/</g, '\\u003c')}},2400)</script>`
      : ''
  const html = [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    '<style>body{margin:0;padding:48px 24px;font:16px/1.6 system-ui,sans-serif;background:#f6f5f2;color:#1b1b1b}',
    'main{max-width:480px;margin:0 auto}h1{margin:0 0 10px;font-size:20px;font-weight:600;line-height:1.3}',
    'p{margin:0 0 14px;color:#5c5c5c}p.back{margin:22px 0 0}',
    'a{color:#1b6fb3;text-decoration:none}a:hover{text-decoration:underline}',
    '@media (prefers-color-scheme:dark){body{background:#171717;color:#f2f2f2}p{color:#a8a8a8}a{color:#7cb8ea}}</style>',
    `</head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p>${back}</main>${redirect}</body></html>`,
  ].join('')
  res.statusCode = status
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(html)
}

/**
 * Read the minimum plugin version from an upstream `426` answer.
 * @param text - the response body.
 * @param headers - the response headers.
 * @returns the version, or null when the answer names none.
 */
function minVersionOf(text, headers) {
  try {
    const payload = JSON.parse(text)
    const value = payload?.error?.data?.minVersion ?? payload?.minVersion
    if (typeof value === 'string' && VERSION_PATTERN.test(value)) return value
  } catch (error) {
    /* a body that is not JSON may still carry the header */
  }
  const header = headers.get(MIN_VERSION_HEADER)
  return header !== null && VERSION_PATTERN.test(header) ? header : null
}

/**
 * Read a bounded request body.
 * @param req - the HTTP request.
 * @returns the body bytes.
 */
async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('request body exceeds the proxy limit')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/**
 * Describe an OAuth error answer, such as `invalid_grant: refresh token expired`.
 * @param payload - the parsed error body, or null.
 * @returns the description, or an empty string when the body names no error.
 */
function oauthErrorDetail(payload) {
  if (payload === null || typeof payload !== 'object' || typeof payload.error !== 'string') return ''
  const description = typeof payload.error_description === 'string' ? `: ${payload.error_description}` : ''
  return ` (${payload.error}${description})`
}

/**
 * Compare two release versions `X.Y.Z`; prereleases are not compared.
 * @param left - a version.
 * @param right - another version.
 * @returns a positive number when left is newer, negative when older, 0 when equal or not comparable.
 */
export function compareVersions(left, right) {
  const parse = (value) => (typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value) ? value.split('.').map(Number) : null)
  const a = parse(left)
  const b = parse(right)
  if (a === null || b === null) return 0
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

/**
 * Pick the newest release of this plugin from a plugin market index.
 * @param index - the parsed index (format 1).
 * @param name - the package name.
 * @returns the newest `X.Y.Z` version, or null.
 */
export function latestMarketVersion(index, name) {
  const plugin = Array.isArray(index?.plugins) ? index.plugins.find((entry) => entry?.name === name) : undefined
  if (plugin === undefined || !Array.isArray(plugin.versions)) return null
  let latest = null
  for (const entry of plugin.versions) {
    const version = entry?.version
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) continue
    if (latest === null || compareVersions(version, latest) > 0) latest = version
  }
  return latest
}

/**
 * Whether a failed token refresh means the grant itself was rejected. Only
 * then is the stored refresh token useless; a timeout, a network failure or a
 * 5xx keeps it for the next attempt.
 * @param status - HTTP status of the token endpoint, or undefined without a response.
 * @returns true for 400 (invalid_grant) and 401 (invalid_client).
 */
export function refreshRejected(status) {
  return status === 400 || status === 401
}

/** Public project and saved-audit ids, the same shape the MCP tools require. */
const PROJECT_ID = /^prj_[a-z][a-z0-9]{23}$/
const REPORT_ID = /^agr_[a-z][a-z0-9]{23}$/
const SEVERITY_RANK = { error: 0, warning: 1, info: 2 }

/**
 * A route failure that already has an HTTP status and a stable kind.
 * @param status - HTTP status.
 * @param kind - machine-readable kind.
 * @param message - operator-readable message.
 * @returns the error.
 */
function httpError(status, kind, message) {
  const error = new Error(message)
  error.httpStatus = status
  error.kind = kind
  return error
}

/**
 * Read a JSON object body. An empty body is an empty object.
 * @param req - the HTTP request.
 * @returns the object.
 */
async function readJsonObject(req) {
  let bytes
  try {
    bytes = await readBody(req)
  } catch (error) {
    throw httpError(400, 'request', messageOf(error))
  }
  if (bytes.length === 0) return {}
  let parsed
  try {
    parsed = JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    throw httpError(400, 'request', 'the request body is not JSON')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw httpError(400, 'request', 'the request body must be a JSON object')
  }
  return parsed
}

/**
 * Read one query parameter.
 * @param req - the HTTP request.
 * @param name - the parameter name.
 * @returns the value, or null.
 */
function queryValue(req, name) {
  return new URL(String(req.url ?? '/'), 'http://127.0.0.1').searchParams.get(name)
}

/**
 * A finite number, or zero when the value is missing.
 * @param value - an unknown field.
 * @returns the number.
 */
function numberOrZero(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * UTC calendar day as `YYYY-MM-DD`.
 * @param date - the instant.
 * @returns the day.
 */
function isoDay(date) {
  return date.toISOString().slice(0, 10)
}

/**
 * The last `days` UTC dates ending yesterday. Search Console omits the current day.
 * @param days - the length of the window.
 * @returns inclusive start and end.
 */
function rangeEndingYesterday(days) {
  const end = new Date()
  end.setUTCHours(0, 0, 0, 0)
  end.setUTCDate(end.getUTCDate() - 1)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - (days - 1))
  return { start: isoDay(start), end: isoDay(end) }
}

/**
 * The detail a failed tool wants the panel to show. Problem `detail` wins over the generic MCP message.
 * @param result - a tool result with `isError`.
 * @returns message, HTTP status, and optional code.
 */
function problemFromTool(result) {
  const error = result?.structuredContent?.error
  const payload = error !== null && typeof error === 'object' ? error.payload : undefined
  const subscriptionRequired = (value) => value !== null && typeof value === 'object' && (
    value.code === 'subscription_required' || value.subscriptionRequired === true ||
    (typeof value.type === 'string' && value.type.endsWith('/problems/subscription-required'))
  )
  const detail = payload !== null && typeof payload === 'object' && typeof payload.detail === 'string' ? payload.detail.trim() : ''
  const message =
    detail !== ''
      ? detail
      : error !== null && typeof error === 'object' && typeof error.message === 'string' && error.message.trim() !== ''
        ? error.message
        : typeof result?.text === 'string' && result.text.trim() !== ''
          ? result.text
          : 'the bisibility tool reported an error'
  const status =
    error !== null && typeof error === 'object' && typeof error.status === 'number'
      ? error.status
      : payload !== null && typeof payload === 'object' && typeof payload.status === 'number'
        ? payload.status
        : 502
  return {
    message,
    status,
    ...(error?.code === 'subscription_required' || subscriptionRequired(payload)
      ? { code: 'subscription_required' }
      : error !== null && typeof error === 'object' && error.code !== undefined
        ? { code: error.code }
        : payload !== null && typeof payload === 'object' && payload.code !== undefined ? { code: payload.code } : {}),
  }
}

/**
 * The JSON body for a failed route.
 * @param error - a thrown value.
 * @returns HTTP status and body. Auth that survives refresh sets `signIn`.
 */
function describeFailure(error) {
  if (error instanceof ToolCallError) {
    return {
      status: error.kind === 'auth' ? 401 : 502,
      body: {
        error: {
          kind: error.kind,
          message: error.message,
          ...(error.kind === 'auth' ? { signIn: true } : {}),
          ...(error.code !== undefined ? { code: error.code } : {}),
          ...(error.status !== undefined ? { status: error.status } : {}),
          ...(typeof error.tool === 'string' ? { tool: error.tool } : {}),
          ...(typeof error.contentType === 'string' && error.contentType !== '' ? { contentType: error.contentType } : {}),
          ...(error.nonJson === true ? { nonJson: true } : {}),
        },
      },
    }
  }
  if (error !== null && typeof error === 'object' && error.toolProblem !== undefined) {
    const problem = error.toolProblem
    const status = Number.isInteger(problem.status) && problem.status >= 400 && problem.status <= 599 ? problem.status : 502
    return {
      status,
      body: {
        error: {
          kind: 'tool',
          message: problem.message,
          status: problem.status,
          ...(problem.code !== undefined ? { code: problem.code } : {}),
        },
      },
    }
  }
  if (error !== null && typeof error === 'object' && Number.isInteger(error.httpStatus)) {
    return { status: error.httpStatus, body: { error: { kind: error.kind || 'request', message: error.message } } }
  }
  return { status: 500, body: { error: { kind: 'request', message: messageOf(error) } } }
}

/**
 * The public error object stored on a card when one optional read fails.
 * @param error - a tool or transport failure.
 * @returns the error object.
 */
function publicError(error) {
  if (error instanceof ToolCallError) {
    return {
      kind: error.kind,
      message: error.message,
      ...(error.kind === 'auth' ? { signIn: true } : {}),
      ...(error.code !== undefined ? { code: error.code } : {}),
      ...(error.status !== undefined ? { status: error.status } : {}),
      ...(typeof error.tool === 'string' ? { tool: error.tool } : {}),
      ...(typeof error.contentType === 'string' && error.contentType !== '' ? { contentType: error.contentType } : {}),
      ...(error.nonJson === true ? { nonJson: true } : {}),
    }
  }
  const problem = error.toolProblem
  return {
    kind: 'tool',
    message: problem.message,
    status: problem.status,
    ...(problem.code !== undefined ? { code: problem.code } : {}),
    ...(typeof problem.tool === 'string' ? { tool: problem.tool } : {}),
  }
}

/**
 * Call one tool. `isError` becomes a typed failure. Transport errors propagate.
 * @param ctx - the host context.
 * @param name - the tool name.
 * @param args - the tool arguments.
 * @returns structured content.
 */
async function callChecked(ctx, name, args) {
  const result = await ctx._callTool(name, args)
  if (result !== null && typeof result === 'object' && result.isError === true) {
    const problem = problemFromTool(result)
    const error = new Error(problem.message)
    error.toolProblem = { ...problem, tool: name }
    throw error
  }
  return result !== null && typeof result === 'object' && result.structuredContent !== undefined ? result.structuredContent : {}
}

/**
 * Read one optional card. An auth failure still signs the panel out. Other failures stay on the card.
 * @param ctx - the host context.
 * @param name - the tool name.
 * @param args - the tool arguments.
 * @returns content or a card error.
 */
async function callOptional(ctx, name, args) {
  return readOptional((tool, toolArgs) => callChecked(ctx, tool, toolArgs), name, args)
}

/**
 * Read one optional card through a caller. An auth failure still signs the panel out.
 * @param read - cached or direct tool caller.
 * @param name - the tool name.
 * @param args - the tool arguments.
 * @returns content or a card error.
 */
async function readOptional(read, name, args) {
  try {
    return { content: await read(name, args), error: null }
  } catch (error) {
    if (error instanceof ToolCallError && error.kind === 'auth') throw error
    if (error instanceof ToolCallError || (error !== null && typeof error === 'object' && error.toolProblem !== undefined)) {
      return { content: null, error: publicError(error) }
    }
    throw error
  }
}

/**
 * Share read-only tool calls that the panel fans out together.
 * `list_projects` is reused for a few seconds. Project reads last a minute, until a write.
 * Failures are not kept. Nothing here polls.
 * @returns a caller and an invalidator.
 */
function createReadCache() {
  /** @type {Map<string, { at: number, promise: Promise<unknown> }>} */
  const entries = new Map()
  const ttl = (name) => (name === 'list_projects' ? 5000 : 60000)
  return {
    /**
     * @param ctx - the host context.
     * @param name - the tool name.
     * @param args - the tool arguments.
     * @returns structured content.
     */
    call(ctx, name, args) {
      const key = `${name}:${JSON.stringify(args ?? {})}`
      const now = Date.now()
      const hit = entries.get(key)
      if (hit !== undefined && now - hit.at < ttl(name)) return hit.promise
      const promise = callChecked(ctx, name, args)
      entries.set(key, { at: now, promise })
      promise.catch(() => {
        if (entries.get(key)?.promise === promise) entries.delete(key)
      })
      return promise
    },
    /**
     * @param projectId - drop this project's reads, and the shared project list.
     */
    invalidate(projectId) {
      for (const key of [...entries.keys()]) {
        if (projectId === undefined || key.includes(projectId) || key.startsWith('list_projects:')) entries.delete(key)
      }
    },
  }
}

/**
 * Send a caught route failure.
 * @param res - the HTTP response.
 * @param error - the thrown value.
 */
function sendFailure(res, error) {
  const described = describeFailure(error)
  sendJson(res, described.status, described.body)
}

/**
 * A project row the panel can render.
 * @param row - one API project.
 * @returns the row, or null when it has no id.
 */
function shapeProject(row) {
  if (row === null || typeof row !== 'object' || typeof row.id !== 'string' || row.id.length === 0) return null
  const domain = typeof row.domain === 'string' ? row.domain : ''
  const name = typeof row.name === 'string' && row.name.trim() !== '' ? row.name : domain !== '' ? domain : row.id
  return { id: row.id, name, domain }
}

/**
 * Projects from a list envelope.
 * @param content - structured content.
 * @returns project rows.
 */
function projectRows(content) {
  const data = Array.isArray(content?.data) ? content.data : Array.isArray(content) ? content : []
  return data.map((row) => shapeProject(row)).filter((row) => row !== null)
}

/**
 * A domain the create-project tool accepts, or null.
 * @param value - the field from the panel.
 * @returns the domain.
 */
function normalizeDomain(value) {
  if (typeof value !== 'string') return null
  const domain = value.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase()
  if (domain.length < 1 || domain.length > 253) return null
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null
  return domain
}

/**
 * The project name, defaulting to the domain.
 * @param body - the request body.
 * @param domain - the normalized domain.
 * @returns the name, or null when the supplied name is the wrong length.
 */
function projectName(body, domain) {
  if (typeof body.name !== 'string') return domain
  const name = body.name.trim()
  if (name.length < 1 || name.length > 120) return null
  return name
}

/**
 * Page cap for a fresh audit. Omitted means 15. Above 15 is refused.
 * @param body - the request body.
 * @returns the cap, or null when it is out of range.
 */
function requestedMaxPages(body) {
  const hasCamel = Object.prototype.hasOwnProperty.call(body, 'maxPages')
  const hasSnake = Object.prototype.hasOwnProperty.call(body, 'max_pages')
  if (!hasCamel && !hasSnake) return 15
  const raw = hasCamel ? body.maxPages : body.max_pages
  if (!Number.isInteger(raw) || raw < 1 || raw > 15) return null
  return raw
}

/**
 * Connection state for one provider id.
 * @param rows - provider rows.
 * @param id - `gsc` or `ga4`.
 * @returns connected, needs-reauth, and the raw status.
 */
function providerState(rows, id) {
  const row = rows.find((item) => item !== null && typeof item === 'object' && (item.id === id || item.provider === id))
  const status = row !== undefined && typeof row.connection_status === 'string' ? row.connection_status : 'not_connected'
  return { connected: status === 'connected', needsReauth: status === 'needs_reauth', status }
}

/**
 * Connection state per provider for the catalog filter chips.
 * `connected` with `enabled: false` is reported as its own state.
 * @param rows - `list_providers` rows.
 * @returns `{ id, status }` rows, status one of connected, disabled, needs_reauth, not_connected.
 */
function providerStates(rows) {
  const out = []
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue
    const id = typeof row.id === 'string' ? row.id : typeof row.provider === 'string' ? row.provider : null
    if (id === null || out.some((item) => item.id === id)) continue
    const raw = typeof row.connection_status === 'string' ? row.connection_status : 'not_connected'
    const status = raw === 'connected' ? (row.enabled === false ? 'disabled' : 'connected') : raw === 'needs_reauth' ? 'needs_reauth' : 'not_connected'
    out.push({ id, status })
  }
  return out
}

/**
 * Totals and the top queries for one search window.
 * @param content - query-stat structured content.
 * @returns partial clicks, impressions, and up to ten queries.
 */
function sumQueryStats(content) {
  const rows = Array.isArray(content?.rows) ? content.rows : []
  let clicks = 0
  let impressions = 0
  const queries = []
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue
    const rowClicks = numberOrZero(row.clicks)
    const rowImpressions = numberOrZero(row.impressions)
    clicks += rowClicks
    impressions += rowImpressions
    if (typeof row.query === 'string' && row.query.trim() !== '') {
      queries.push({
        query: row.query,
        clicks: rowClicks,
        impressions: rowImpressions,
        position: typeof row.position === 'number' && Number.isFinite(row.position) ? row.position : null,
      })
    }
  }
  queries.sort((left, right) => right.clicks - left.clicks || left.query.localeCompare(right.query))
  return {
    clicks,
    impressions,
    truncated: content?.result?.truncated === true,
    queries: queries.slice(0, 10),
  }
}

/**
 * Older MCP servers reject an unknown tool at the JSON-RPC or tool-result layer. Provider,
 * validation, network and HTTP failures must remain visible on the card.
 * @param error - a public tool error.
 * @returns whether the aggregate tool is absent.
 */
function totalsToolMissing(error) {
  if (error?.kind === 'tool' && error.tool === 'get_search_performance_totals' && error.message === 'Unknown MCP tool: get_search_performance_totals') return true
  return error?.kind === 'jsonrpc' && (error.code === -32601 ||
    (error.code === -32602 && /^(?:unknown tool|tool not found)(?:\s*[:.]|\s*$)|^tool\s+['"]?get_search_performance_totals['"]?\s+(?:was\s+)?not found\b/i.test(error.message)))
}

/** Page snapshots are 28-day totals (`lib/traffic/snapshots.ts` DEFAULT_WINDOW_DAYS). */
const PAGE_WINDOW_DAYS = 28

/**
 * The newest GA4 page snapshot.
 * Each row is a 28-day total for one keyword path as of that date, so older
 * dates are earlier windows, not extra sessions. Paths on the newest date are
 * added together. A 1-day row is not a series this server writes.
 * @param content - traffic snapshot structured content.
 * @returns one point, or none.
 */
function sessionSeries(content) {
  const rows = Array.isArray(content?.rows) ? content.rows : []
  const ga4 = rows.filter(
    (row) =>
      row !== null &&
      typeof row === 'object' &&
      row.provider === 'ga4' &&
      row.window_days === PAGE_WINDOW_DAYS &&
      typeof row.date === 'string',
  )
  if (ga4.length === 0) return []
  let newest = ga4[0].date
  for (const row of ga4) if (row.date > newest) newest = row.date
  let sessions = 0
  for (const row of ga4) if (row.date === newest) sessions += numberOrZero(row.sessions)
  return [{ date: newest, sessions }]
}

/**
 * Pages in the not-indexed group.
 * @param content - the indexing report.
 * @returns the total, or zero.
 */
function notIndexedCount(content) {
  const groups = Array.isArray(content?.groups) ? content.groups : []
  const group = groups.find((item) => item !== null && typeof item === 'object' && item.group === 'not_indexed')
  return group !== undefined && typeof group.total === 'number' && Number.isFinite(group.total) ? group.total : 0
}

/**
 * Stored URLs from a page-indexing list.
 * @param content - the list envelope.
 * @returns up to ten URLs.
 */
function indexingUrls(content) {
  const data = Array.isArray(content?.data) ? content.data : []
  return data.flatMap((row) => (row !== null && typeof row === 'object' && typeof row.url === 'string' && row.url.trim() !== '' ? [row.url] : [])).slice(0, 10)
}

/**
 * Issues grouped by severity, then by how often they repeat.
 * @param result - the audit result.
 * @returns up to eight issues.
 */
function topIssues(result) {
  const pages = Array.isArray(result?.pages) ? result.pages : []
  const grouped = new Map()
  for (const page of pages) {
    const issues = Array.isArray(page?.issues) ? page.issues : []
    for (const issue of issues) {
      if (issue === null || typeof issue !== 'object' || !Object.prototype.hasOwnProperty.call(SEVERITY_RANK, issue.severity)) continue
      const code = typeof issue.code === 'string' ? issue.code : ''
      const message = typeof issue.message === 'string' ? issue.message : ''
      const key = `${issue.severity}\0${code}\0${message}`
      const current = grouped.get(key) ?? {
        severity: issue.severity,
        code,
        message,
        count: 0,
        url: typeof page.url === 'string' ? page.url : null,
        urls: [],
      }
      current.count += 1
      if (typeof page.url === 'string' && page.url !== '' && !current.urls.includes(page.url)) current.urls.push(page.url)
      grouped.set(key, current)
    }
  }
  return [...grouped.values()]
    .sort((left, right) => SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] || right.count - left.count)
    .slice(0, 8)
}

/**
 * The audit card: pages crawled, why the crawl stopped, and the top issues.
 * @param content - a saved audit envelope.
 * @returns the summary. An empty body has no id.
 */
function summarizeAudit(content) {
  const data = content !== null && typeof content === 'object' && content.data !== null && typeof content.data === 'object' && !Array.isArray(content.data)
    ? content.data
    : content
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { id: null, createdAt: null, cached: false, pagesCrawled: 0, stopReason: null, topIssues: [], pages: [], summary: {}, requests: null, state: null, limits: null, limitations: [] }
  }
  const result = data.result !== null && typeof data.result === 'object' ? data.result : {}
  const summary = result.summary !== null && typeof result.summary === 'object' ? result.summary : {}
  const pages = Array.isArray(result.pages) ? result.pages : []
  const stop = typeof result.stop_reason === 'string' ? result.stop_reason : typeof result.stopReason === 'string' ? result.stopReason : null
  const summaryOut = {}
  for (const key of ['pages', 'errors', 'warnings', 'indexable']) {
    if (typeof summary[key] === 'number') summaryOut[key] = summary[key]
  }
  const limitsIn = result.limits !== null && typeof result.limits === 'object' ? result.limits : null
  const limits = limitsIn === null ? null : {}
  if (limits !== null) {
    for (const key of ['maxPages', 'max_pages', 'maxRequests', 'max_requests', 'maxDurationMs', 'max_duration_ms', 'maxPageBytes', 'max_page_bytes']) {
      if (typeof limitsIn[key] === 'number') limits[key] = limitsIn[key]
    }
  }
  return {
    id: typeof data.id === 'string' && data.id.length > 0 ? data.id : null,
    createdAt: typeof data.created_at === 'string' ? data.created_at : typeof data.createdAt === 'string' ? data.createdAt : null,
    cached: data.cached === true,
    pagesCrawled: typeof summary.pages === 'number' ? summary.pages : pages.length,
    stopReason: stop,
    topIssues: topIssues(result),
    pages: pages.flatMap((page) => {
      if (page === null || typeof page !== 'object' || typeof page.url !== 'string' || page.url === '') return []
      const issues = Array.isArray(page.issues) ? page.issues : []
      return [{
        url: page.url,
        status: typeof page.status === 'number' ? page.status : null,
        issues: issues.flatMap((issue) => {
          if (issue === null || typeof issue !== 'object') return []
          return [{
            code: typeof issue.code === 'string' ? issue.code : '',
            severity: typeof issue.severity === 'string' ? issue.severity : '',
            message: typeof issue.message === 'string' ? issue.message : '',
          }]
        }),
      }]
    }),
    summary: summaryOut,
    requests: typeof result.requests === 'number' ? result.requests : null,
    state: typeof result.state === 'string' ? result.state : null,
    limits: limits !== null && Object.keys(limits).length > 0 ? limits : null,
    limitations: Array.isArray(result.limitations) ? result.limitations.filter((item) => typeof item === 'string') : [],
  }
}

/**
 * Which audit views the saved fields can fill.
 * A view is omitted when its fields are absent. Counts are not renamed here.
 * @param audit - the summary from `summarizeAudit`.
 * @returns view ids in display order.
 */
export function auditViews(audit) {
  if (audit === null || typeof audit !== 'object' || Array.isArray(audit)) throw new Error('audit summary must be an object')
  const views = []
  if (Array.isArray(audit.topIssues) && audit.topIssues.length > 0) views.push('findings')
  if (Array.isArray(audit.pages) && audit.pages.some((page) => page !== null && typeof page === 'object' && typeof page.url === 'string' && page.url !== '')) views.push('pages')
  const summary = audit.summary !== null && typeof audit.summary === 'object' ? audit.summary : {}
  const hasCount = ['pages', 'errors', 'warnings', 'indexable'].some((key) => typeof summary[key] === 'number')
  if (typeof audit.stopReason === 'string' || typeof audit.requests === 'number' || typeof audit.state === 'string' || hasCount || (audit.limits !== null && audit.limits !== undefined)) views.push('details')
  return views
}

/**
 * Whether the first keyword page has a row.
 * @param content - the keyword list envelope.
 * @returns true when the project has a keyword.
 */
function hasKeywords(content) {
  return Array.isArray(content?.data) && content.data.length > 0
}

/**
 * A traffic sync the panel can show without reading provider internals.
 * @param content - the sync payload.
 * @returns counts and the skip flags.
 */
function shapeSync(content) {
  const source = Array.isArray(content?.skipped) ? content.skipped : []
  const skipped = source
    .filter((row) => row !== null && typeof row === 'object')
    .map((row) => ({
      provider: typeof row.provider === 'string' ? row.provider : '',
      reason: typeof row.reason === 'string' ? row.reason : '',
    }))
  return {
    connections: numberOrZero(content?.connections),
    pageSnapshots: numberOrZero(content?.page_snapshots ?? content?.pageSnapshots),
    keywordSnapshots: numberOrZero(content?.keyword_snapshots ?? content?.keywordSnapshots),
    skipped,
    rateLimited: skipped.some((row) => row.reason === 'rate_limited'),
    needsReauth: skipped.some((row) => row.reason === 'needs_reauth'),
  }
}

/**
 * Refuse a project id this account cannot see. The id is checked against `list_projects` before any project tool runs.
 * @param ctx - the host context.
 * @param id - the requested project id.
 * @returns the project row.
 */
async function requireKnownProject(ctx, id, read = (name, args) => callChecked(ctx, name, args)) {
  if (typeof id !== 'string' || !PROJECT_ID.test(id)) throw httpError(404, 'unknown_project', 'unknown project')
  const rows = projectRows(await read('list_projects', {}))
  const project = rows.find((row) => row.id === id)
  if (project === undefined) throw httpError(404, 'unknown_project', 'unknown project')
  return project
}

/**
 * The newest saved audit row, if the list has one.
 * `list_site_audits` returns `{ id, kind, title, created_at }` and no summary, so this is
 * all the start screen knows about the audit until the audit modal opens.
 * @param content - the audit list envelope.
 * @returns `{ id, createdAt }`, or null.
 */
function savedAuditStub(content) {
  const data = Array.isArray(content?.data) ? content.data : []
  const first = data.find((row) => row !== null && typeof row === 'object' && typeof row.id === 'string' && REPORT_ID.test(row.id))
  if (first === undefined) return null
  const created = typeof first.created_at === 'string' ? first.created_at : typeof first.createdAt === 'string' ? first.createdAt : null
  return { id: first.id, createdAt: created }
}

/**
 * Query rows are only a top list when aggregate totals are available. Older MCP
 * servers retain the previous capped sums, explicitly marked partial.
 */
const TOP_QUERIES_LIMIT = 10
const LEGACY_QUERY_STATS_LIMIT = 1000

/**
 * The first-paint read: checklist, saved audit id, connections, and the featured step.
 * It issues `list_site_audits`, `list_providers` and `list_keywords` in parallel and nothing
 * else. Search Console numbers, indexing, traffic, and the audit document come later from
 * `buildProjectData` and `GET /audit`.
 * @param ctx - the host context.
 * @param project - the project row.
 * @returns the overview payload without the origin.
 */
async function buildOverview(ctx, project, read = (name, args) => callChecked(ctx, name, args)) {
  const range = rangeEndingYesterday(28)
  const [audits, providersRead, keywordsRead] = await Promise.all([
    readOptional(read, 'list_site_audits', { project_id: project.id }),
    readOptional(read, 'list_providers', { project_id: project.id }),
    readOptional(read, 'list_keywords', { project_id: project.id, limit: 1 }),
  ])
  const providerList = Array.isArray(providersRead.content?.data) ? providersRead.content.data : []
  const unknown = { connected: false, needsReauth: false, status: 'unknown' }
  const search = providersRead.error === null ? providerState(providerList, 'gsc') : unknown
  const analytics = providersRead.error === null ? providerState(providerList, 'ga4') : unknown
  const saved = audits.error === null ? savedAuditStub(audits.content) : null
  const checklist = {
    audit: audits.error !== null ? null : saved !== null,
    searchConsole: providersRead.error !== null ? null : search.connected,
    analytics: providersRead.error !== null ? null : analytics.connected,
    keywords: keywordsRead.error !== null ? null : hasKeywords(keywordsRead.content),
  }
  return {
    project,
    checklist,
    next: featuredStep(checklist),
    audit: saved,
    ...(audits.error !== null ? { auditError: audits.error } : {}),
    ...(keywordsRead.error !== null ? { keywordsError: keywordsRead.error } : {}),
    searchConsole: {
      connected: search.connected,
      needsReauth: search.needsReauth,
      status: search.status,
      clicks: null,
      impressions: null,
      previous: null,
      queries: [],
      truncated: false,
      indexing: null,
      error: providersRead.error,
    },
    analytics: {
      connected: analytics.connected,
      needsReauth: analytics.needsReauth,
      status: analytics.status,
      sessions: [],
      error: providersRead.error,
    },
    providers: providersRead.error !== null ? null : providerStates(providerList),
    window: range,
  }
}

/**
 * Provider-only first-paint response. All callers share the short tool cache.
 * @param ctx - host context.
 * @param project - verified project row.
 * @param read - cached tool reader.
 * @returns connection states without waiting on audit or keyword reads.
 */
async function buildConnections(ctx, project, read) {
  const result = await readOptional(read, 'list_providers', { project_id: project.id })
  const rows = Array.isArray(result.content?.data) ? result.content.data : []
  const state = (id) => ({
    ...(result.error === null ? providerState(rows, id) : { connected: false, needsReauth: false, status: 'unknown' }),
    error: result.error,
  })
  return { searchConsole: state('gsc'), analytics: state('ga4'), providers: result.error === null ? providerStates(rows) : null }
}

/**
 * Independent lazy sources. The mounted panel asks for each source separately so a slow
 * or failed sibling cannot block healthy values. The unscoped route remains compatible.
 * Aggregate totals carry their requested/actual dates and freshness. Query sums
 * are used only when an older MCP server reports the aggregate tool missing.
 * @param ctx - host context.
 * @param project - verified project row.
 * @param read - cached tool reader.
 * @param source - search, indexing, analytics, or all.
 * @returns the requested source and its own date window.
 */
async function buildProjectData(ctx, project, read, source = 'all') {
  if (!['search', 'indexing', 'analytics', 'all'].includes(source)) throw httpError(400, 'source', 'unknown project data source')
  const range = rangeEndingYesterday(28)
  const connections = await buildConnections(ctx, project, read)
  const readSearch = async () => {
    const card = { ...connections.searchConsole, clicks: null, impressions: null, previous: null, queries: [], truncated: false, indexing: null }
    if (!card.connected) return card
    const args = { project_id: project.id, start_date: range.start, end_date: range.end }
    const totals = await readOptional(read, 'get_search_performance_totals', args)
    const partial = totalsToolMissing(totals.error)
    if (totals.error !== null && !partial) return { ...card, error: totals.error }
    const current = totals.content?.current
    if (!partial && (!current || !['clicks', 'impressions', 'ctr', 'position'].every((key) => typeof current[key] === 'number' && Number.isFinite(current[key])) ||
      typeof current.start_date !== 'string' || typeof current.end_date !== 'string' || !current.freshness)) {
      return { ...card, error: { kind: 'protocol', tool: 'get_search_performance_totals', message: 'Invalid search performance totals response' } }
    }
    const listed = await readOptional(read, 'list_search_performance_query_stats', {
      ...args, limit: partial ? LEGACY_QUERY_STATS_LIMIT : TOP_QUERIES_LIMIT,
    })
    const stats = listed.content === null ? null : sumQueryStats(listed.content)
    if (partial) return { ...card, ...(stats || {}), partial: true, error: listed.error }
    return {
      ...card, clicks: current.clicks, impressions: current.impressions, ctr: current.ctr, position: current.position,
      window: { start: current.start_date, end: current.end_date },
      dataWindow: { start: current.data_start_date, end: current.data_end_date },
      freshness: current.freshness, partial: false,
      queries: stats?.queries || [], error: listed.error,
    }
  }
  const readIndexing = async () => {
    const card = { notIndexed: null, urls: [], error: connections.searchConsole.error }
    if (!connections.searchConsole.connected) return card
    const report = await readOptional(read, 'get_page_indexing_report', { project_id: project.id })
    if (report.content === null) return { ...card, error: report.error }
    const notIndexed = notIndexedCount(report.content)
    if (notIndexed === 0) return { ...card, notIndexed }
    const listed = await readOptional(read, 'list_page_indexing_urls', { project_id: project.id, group: 'not_indexed', limit: 10 })
    return { notIndexed, urls: listed.content === null ? [] : indexingUrls(listed.content), error: listed.error }
  }
  const readAnalytics = async () => {
    const card = { ...connections.analytics, sessions: [] }
    if (!card.connected) return card
    const snapshots = await readOptional(read, 'list_traffic_snapshots', {
      project_id: project.id, start_date: range.start, end_date: range.end, limit: 200,
    })
    return { ...card, sessions: snapshots.content === null ? [] : sessionSeries(snapshots.content), error: snapshots.error }
  }
  const body = { project, window: range }
  if (source === 'search') return { ...body, searchConsole: await readSearch() }
  if (source === 'indexing') return { ...body, indexing: await readIndexing() }
  if (source === 'analytics') return { ...body, analytics: await readAnalytics() }
  const [searchConsole, indexing, analytics] = await Promise.all([readSearch(), readIndexing(), readAnalytics()])
  return { ...body, searchConsole: { ...searchConsole, indexing }, indexing, analytics }
}

/**
 * Saved rows the recent list can open. Ids that are not reports are dropped.
 * @param content - a list tool envelope.
 * @param limit - how many rows to keep.
 * @returns plain rows.
 */
function recentRows(content, limit) {
  const data = Array.isArray(content?.data) ? content.data : []
  const rows = []
  for (const row of data) {
    if (rows.length >= limit) break
    if (row === null || typeof row !== 'object' || typeof row.id !== 'string' || !REPORT_ID.test(row.id)) continue
    rows.push(row)
  }
  return rows
}

/**
 * One recent row for the panel.
 * @param kind - `audit` or `report`.
 * @param row - a saved row.
 * @param domain - project domain.
 * @returns the panel item.
 */
function shapeRecentItem(kind, row, domain) {
  const title = typeof row.title === 'string' && row.title.trim() !== '' ? row.title.trim() : row.id
  const created = typeof row.created_at === 'string' ? row.created_at : typeof row.createdAt === 'string' ? row.createdAt : null
  return {
    id: row.id,
    title,
    ...(kind === 'report' && typeof row.kind === 'string' ? { kind: row.kind } : {}),
    ...(created !== null ? { createdAt: created } : {}),
    prompt: recentPrompt(kind, row, domain),
  }
}

/**
 * Register the panel's read routes. Each handler calls `ctx._callTool`.
 * Existing OAuth and MCP routes are not replaced.
 * @param ctx - the host context.
 * @param settings - resolved service settings.
 * @param rejected - answers an untrusted browser request.
 * @param read - authenticated cached tool reader.
 * @param cache - shared read cache invalidated by writes and authentication changes.
 */
function mountGrowthRoutes(ctx, settings, rejected, read, cache) {
  const origin = settings.issuer

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: `${BASE}/projects`,
        handler: async (req, res) => {
          if (rejected(req, res)) return
          try {
            if (req.method === 'GET') {
              sendJson(res, 200, { origin, projects: projectRows(await read('list_projects', {})) })
              return
            }
            if (req.method !== 'POST') {
              sendJson(res, 405, { error: 'method not allowed' })
              return
            }
            const body = await readJsonObject(req)
            if (body.confirm !== true) throw httpError(400, 'confirm', 'Confirm the new project before creating it.')
            const domain = normalizeDomain(body.domain)
            if (domain === null) throw httpError(400, 'domain', 'Enter a domain such as example.com.')
            const name = projectName(body, domain)
            if (name === null) throw httpError(400, 'domain', 'Enter a project name up to 120 characters.')
            const project = shapeProject(await callChecked(ctx, 'create_project', { domain, name }))
            cache.invalidate()
            sendJson(res, project === null ? 200 : 201, { origin, project })
          } catch (error) {
            sendFailure(res, error)
          }
        },
      }),
    'bisibility: /projects',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: `${BASE}/overview`,
        handler: async (req, res) => {
          if (rejected(req, res)) return
          if (req.method !== 'GET') {
            sendJson(res, 405, { error: 'method not allowed' })
            return
          }
          try {
            const project = await requireKnownProject(ctx, queryValue(req, 'project'), read)
            sendJson(res, 200, { origin, ...(await buildOverview(ctx, project, read)) })
          } catch (error) {
            sendFailure(res, error)
          }
        },
      }),
    'bisibility: GET /overview',
  )

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: `${BASE}/connections`,
      handler: async (req, res) => {
        if (rejected(req, res)) return
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' })
        try {
          const project = await requireKnownProject(ctx, queryValue(req, 'project'), read)
          sendJson(res, 200, { origin, ...(await buildConnections(ctx, project, read)) })
        } catch (error) {
          sendFailure(res, error)
        }
      },
    }),
    'bisibility: GET /connections',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: `${BASE}/project-data`,
        handler: async (req, res) => {
          if (rejected(req, res)) return
          if (req.method !== 'GET') {
            sendJson(res, 405, { error: 'method not allowed' })
            return
          }
          try {
            const project = await requireKnownProject(ctx, queryValue(req, 'project'), read)
            sendJson(res, 200, { origin, ...(await buildProjectData(ctx, project, read, queryValue(req, 'source') || 'all')) })
          } catch (error) {
            sendFailure(res, error)
          }
        },
      }),
    'bisibility: GET /project-data',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: `${BASE}/audit`,
        handler: async (req, res) => {
          if (rejected(req, res)) return
          try {
            if (req.method === 'GET') {
              const project = await requireKnownProject(ctx, queryValue(req, 'project'), read)
              const id = queryValue(req, 'id')
              if (typeof id !== 'string' || !REPORT_ID.test(id)) throw httpError(400, 'request', 'unknown audit')
              const audit = summarizeAudit(await read('get_site_audit', { project_id: project.id, report_id: id }))
              sendJson(res, 200, { origin, audit })
              return
            }
            if (req.method !== 'POST') {
              sendJson(res, 405, { error: 'method not allowed' })
              return
            }
            const body = await readJsonObject(req)
            const maxPages = requestedMaxPages(body)
            if (maxPages === null) throw httpError(400, 'max_pages', 'A site audit crawls at most 15 pages.')
            const project = await requireKnownProject(ctx, typeof body.project === 'string' ? body.project : body.project_id, read)
            const audit = summarizeAudit(await callChecked(ctx, 'run_site_audit', { project_id: project.id, max_pages: maxPages }))
            cache.invalidate(project.id)
            sendJson(res, 200, { origin, audit })
          } catch (error) {
            sendFailure(res, error)
          }
        },
      }),
    'bisibility: /audit',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: `${BASE}/workflows`,
        handler: async (req, res) => {
          if (rejected(req, res)) return
          if (req.method !== 'GET') {
            sendJson(res, 405, { error: 'method not allowed' })
            return
          }
          try {
            const requested = queryValue(req, 'project')
            const project = requested === null || requested === '' ? null : await requireKnownProject(ctx, requested, read)
            const domain = project !== null && project.domain.trim() !== '' ? project.domain : null
            sendJson(res, 200, {
              origin,
              project,
              domain,
              categories: WORKFLOW_CATEGORIES,
              workflows: shapeWorkflows(domain, queryValue(req, 'locale')),
            })
          } catch (error) {
            sendFailure(res, error)
          }
        },
      }),
    'bisibility: GET /workflows',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: `${BASE}/recent`,
        handler: async (req, res) => {
          if (rejected(req, res)) return
          if (req.method !== 'GET') {
            sendJson(res, 405, { error: 'method not allowed' })
            return
          }
          try {
            const project = await requireKnownProject(ctx, queryValue(req, 'project'), read)
            const domain = project.domain.trim()
            const [audits, reports] = await Promise.all([
              read('list_site_audits', { project_id: project.id }),
              read('list_agent_reports', { project_id: project.id, limit: RECENT_LIMIT }),
            ])
            const reportRows = Array.isArray(reports?.data) ? reports.data.filter((row) => row === null || typeof row !== 'object' || row.kind !== 'site_audit') : []
            sendJson(res, 200, {
              origin,
              project,
              audits: recentRows(audits, RECENT_LIMIT).map((row) => shapeRecentItem('audit', row, domain)),
              reports: recentRows({ data: reportRows }, RECENT_LIMIT).map((row) => shapeRecentItem('report', row, domain)),
            })
          } catch (error) {
            sendFailure(res, error)
          }
        },
      }),
    'bisibility: GET /recent',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: `${BASE}/traffic`,
        handler: async (req, res) => {
          if (rejected(req, res)) return
          if (req.method !== 'POST') {
            sendJson(res, 405, { error: 'method not allowed' })
            return
          }
          try {
            const body = await readJsonObject(req)
            const project = await requireKnownProject(ctx, typeof body.project === 'string' ? body.project : body.project_id, read)
            const sync = shapeSync(await callChecked(ctx, 'sync_project_traffic', { project_id: project.id }))
            cache.invalidate(project.id)
            sendJson(res, 200, { origin, projectId: project.id, ...sync })
          } catch (error) {
            sendFailure(res, error)
          }
        },
      }),
    'bisibility: POST /traffic',
  )
}

export const inject = ['webServer', 'skills']

/**
 * Register the OAuth routes, the MCP proxy, and the MCP client they feed.
 * @param ctx - the host plugin context.
 * @param config - optional deployment overrides from the patch row.
 */
export function apply(ctx, config) {
  // Global layer: this row is the host plugin, not a preset composition mount.
  registerBundledSkills(ctx)
  const settings = resolveSettings(config)
  const proxyUrl = `${ctx.webServer.getOrigin()}${BASE}/mcp`
  const redirectUri = `${ctx.webServer.getOrigin()}${BASE}/oauth/callback`

  // This bundle's own version and the code fingerprint it loaded with. A file
  // that changed on disk after load means the running Host half is older than
  // the checkout, which the panel reports so the user can reinstall.
  const manifest = (() => {
    try {
      return JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
    } catch (error) {
      return null
    }
  })()
  const version = manifest !== null && typeof manifest.version === 'string' ? manifest.version : null
  const clientHeader = version === null ? null : `bisibility-dsh-plugin/${version}`
  const codeFiles = ['index.js', 'client.js', 'workflows.js', 'skills.js', 'ask.js', 'skills/source.json', 'cordis.patch.yml']
  const fingerprint = () =>
    codeFiles
      .map((name) => {
        try {
          const info = statSync(new URL(`./${name}`, import.meta.url))
          return `${name}:${info.mtimeMs}:${info.size}`
        } catch (error) {
          return `${name}:missing`
        }
      })
      .join('|')
  const loadedFingerprint = fingerprint()

  const state = {
    accessToken: null,
    refreshToken: null,
    expiresAt: 0,
    account: null,
    pending: new Map(),
    fiber: null,
    mcp: 'none',
    error: null,
    refreshing: null,
    updateRequired: false,
    latestVersion: null,
    minVersion: null,
  }
  const growthCache = createReadCache()
  let authGeneration = 0
  let mounting = null
  const invalidateAuthReads = () => {
    authGeneration += 1
    growthCache.invalidate()
  }

  /**
   * Resolve an optional service without failing activation when absent.
   * @param name - the service name.
   * @returns the service, or undefined.
   */
  const optionalService = (name) => {
    try {
      return ctx.get(name)
    } catch (error) {
      return undefined
    }
  }

  /** Resolve the optional credential store; the bridge degrades to memory without it. */
  const credentials = () => optionalService('credentials')
  /** Serialize refresh-token writes and clears across disconnect and account changes. */
  let refreshCredentialWrites = Promise.resolve()
  const updateCredential = (ref, update) => {
    if (ref !== REFRESH_TOKEN_REF) return update()
    const pending = refreshCredentialWrites.then(update)
    refreshCredentialWrites = pending.catch(() => {})
    return pending
  }

  /**
   * Read one stored credential value.
   * @param ref - credential reference name.
   * @returns the stored value, or null.
   */
  const readCredential = async (ref) => {
    const store = credentials()
    if (store === undefined || store === null) return null
    try {
      const resolved = await store.resolve(ref)
      return resolved !== null && resolved !== undefined && typeof resolved.value === 'string' ? resolved.value : null
    } catch (error) {
      return null
    }
  }

  /**
   * Persist one credential value, ignoring an unavailable store.
   * @param ref - credential reference name.
   * @param value - secret text.
   * @param generation - the authentication that owns this write.
   */
  const writeCredential = (ref, value, generation = authGeneration) => updateCredential(ref, async () => {
    if (ref === REFRESH_TOKEN_REF && generation !== authGeneration) return
    const store = credentials()
    if (store === undefined || store === null) return
    try {
      await store.set(ref, value)
    } catch (error) {
      ctx.logger?.warn?.(`bisibility: could not store ${ref}: ${messageOf(error)}`)
    }
  })

  /**
   * Remove one stored credential value.
   * @param ref - credential reference name.
   */
  const clearCredential = (ref) => updateCredential(ref, async () => {
    const store = credentials()
    if (store === undefined || store === null) return
    try {
      await store.unset(ref)
    } catch (error) {
      /* an absent value is already cleared */
    }
  })

  /** Drop in-memory authorization and unmount the MCP client. */
  const resetAuth = () => {
    invalidateAuthReads()
    restored = true
    state.accessToken = null
    state.refreshToken = null
    state.expiresAt = 0
    state.account = null
    state.error = null
    unmountMcp()
  }

  /** Unmount the shipped MCP client, if this bridge mounted one. */
  const unmountMcp = () => {
    mounting = null
    if (state.fiber !== null) {
      try {
        state.fiber.dispose()
      } catch (error) {
        ctx.logger?.warn?.(`bisibility: could not dispose the MCP client: ${messageOf(error)}`)
      }
    }
    state.fiber = null
    state.mcp = 'none'
  }

  /**
   * Mount the shipped MCP client against the authenticated loopback proxy.
   *
   * The client is mounted through the Loader's own import so the package
   * resolves from the dsh installation, and through `ctx.plugin` so nothing is
   * persisted into the profile patch.
   */
  const mountMcp = async () => {
    const generation = authGeneration
    if (state.fiber !== null || mounting?.generation === generation) return
    const operation = { generation }
    mounting = operation
    state.mcp = 'mounting'
    state.error = null
    try {
      const loader = ctx.loader ?? optionalService('loader')
      if (loader === undefined || loader === null || typeof loader.import !== 'function') {
        throw new Error('the Cordis Loader is not available in this profile')
      }
      const namespace = await loader.import('@deepseek-ai/dsh-mcp-client')
      if (generation !== authGeneration || mounting !== operation) return
      const plugin = namespace !== null && typeof namespace === 'object' && typeof namespace.apply === 'function'
        ? namespace
        : namespace?.default
      if (plugin === undefined || plugin === null) {
        throw new Error('@deepseek-ai/dsh-mcp-client exports no plugin')
      }
      state.fiber = ctx.plugin(plugin, {
        serverName: settings.serverName,
        transport: 'streamable-http',
        url: proxyUrl,
        toolCallTimeoutMs: settings.toolCallTimeoutMs,
        failOnStartupError: false,
      })
      state.mcp = 'mounted'
    } catch (error) {
      if (generation !== authGeneration || mounting !== operation) return
      state.mcp = 'failed'
      state.error = messageOf(error)
      ctx.logger?.warn?.(`bisibility: could not mount the MCP client: ${state.error}`)
    } finally {
      if (mounting === operation) {
        mounting = null
        if (state.mcp === 'mounting') state.mcp = 'none'
      }
    }
  }

  /**
   * Register a dynamic OAuth client for this callback address, reusing the
   * stored registration while the callback address is unchanged.
   * @returns the client identifier.
   */
  const ensureClientId = async (forAuthorization = false) => {
    const stored = await readCredential(CLIENT_ID_REF)
    if (stored !== null) {
      try {
        const parsed = JSON.parse(stored)
        // A refresh token belongs to the client it was issued to: the server
        // answers 400 invalid_client for any other client_id. Refreshes and the
        // code exchange therefore always keep the stored client, even when the
        // harness started on another port. Only a new sign-in registers again,
        // because the server checks its redirect URI and scopes.
        const reusable =
          !forAuthorization || (parsed?.redirectUri === redirectUri && parsed?.scope === settings.scope)
        if (parsed !== null && typeof parsed.clientId === 'string' && reusable) {
          return parsed.clientId
        }
      } catch (error) {
        /* a malformed record is replaced below */
      }
    }
    let response
    try {
      response = await fetch(`${settings.issuer}/api/auth/oauth2/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          client_name: settings.clientName,
          redirect_uris: [redirectUri],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
          scope: settings.scope,
        }),
        signal: AbortSignal.timeout(DCR_TIMEOUT_MS),
      })
    } catch (error) {
      throw new Error(fetchFailure('dynamic client registration', DCR_TIMEOUT_MS, error))
    }
    const payload = await response.json().catch(() => null)
    if (!response.ok || payload === null || typeof payload.client_id !== 'string') {
      throw new Error(`dynamic client registration failed with HTTP ${response.status}`)
    }
    await writeCredential(CLIENT_ID_REF, JSON.stringify({ redirectUri, clientId: payload.client_id, scope: settings.scope }))
    return payload.client_id
  }

  /**
   * Exchange one authorization code for tokens and mount the MCP client.
   * @param code - the authorization code.
   * @param verifier - the PKCE verifier bound to this flow.
   */
  const completeAuthorization = async (code, verifier) => {
    const clientId = await ensureClientId()
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
      resource: settings.resource,
    })
    let response
    try {
      response = await fetch(`${settings.issuer}/api/auth/oauth2/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body,
        signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
      })
    } catch (error) {
      throw new Error(fetchFailure('the bisibility token endpoint', TOKEN_TIMEOUT_MS, error))
    }
    const payload = await response.json().catch(() => null)
    if (!response.ok || payload === null || typeof payload.access_token !== 'string') {
      throw new Error(`token exchange failed with HTTP ${response.status}${oauthErrorDetail(payload)}`)
    }
    invalidateAuthReads()
    state.accessToken = payload.access_token
    state.expiresAt = Date.now() + (Number.isFinite(payload.expires_in) ? payload.expires_in : 3600) * 1000
    state.error = null
    if (typeof payload.refresh_token === 'string') {
      state.refreshToken = payload.refresh_token
      await writeCredential(REFRESH_TOKEN_REF, payload.refresh_token)
    }
    state.account = await readAccount(state.accessToken)
    await mountMcp()
  }

  /**
   * Read the signed-in account for display; failure is not an authorization failure.
   * @param token - the access token.
   * @returns the account label, or null.
   */
  const readAccount = async (token) => {
    try {
      const response = await fetch(`${settings.issuer}/api/auth/oauth2/userinfo`, {
        headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
        signal: AbortSignal.timeout(USERINFO_TIMEOUT_MS),
      })
      if (!response.ok) return null
      const payload = await response.json()
      if (payload === null || typeof payload !== 'object') return null
      return typeof payload.email === 'string' ? payload.email : typeof payload.name === 'string' ? payload.name : null
    } catch (error) {
      return null
    }
  }

  /**
   * Exchange the stored refresh token for a fresh access token.
   * @returns whether the bridge now holds a usable access token.
   */
  const refreshAccessToken = async () => {
    const generation = authGeneration
    if (state.refreshing !== null && state.refreshing.generation === generation) return state.refreshing.promise
    const refreshToken = state.refreshToken
    const run = (async () => {
      const clientId = await ensureClientId()
      if (generation !== authGeneration) return false
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        resource: settings.resource,
      })
      let response
      try {
        response = await fetch(`${settings.issuer}/api/auth/oauth2/token`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
          body,
          signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
        })
      } catch (error) {
        throw new Error(fetchFailure('token refresh', TOKEN_TIMEOUT_MS, error))
      }
      const payload = await response.json().catch(() => null)
      if (generation !== authGeneration) return false
      if (!response.ok || payload === null || typeof payload.access_token !== 'string') {
        const failure = new Error(`token refresh failed with HTTP ${response.status}${oauthErrorDetail(payload)}`)
        failure.status = response.status
        throw failure
      }
      state.accessToken = payload.access_token
      state.expiresAt = Date.now() + (Number.isFinite(payload.expires_in) ? payload.expires_in : 3600) * 1000
      state.error = null
      if (typeof payload.refresh_token === 'string') {
        state.refreshToken = payload.refresh_token
        await writeCredential(REFRESH_TOKEN_REF, payload.refresh_token, generation)
      }
      return generation === authGeneration
    })()
    const owned = { generation, promise: run }
    state.refreshing = owned
    try {
      return await run
    } finally {
      if (state.refreshing === owned) state.refreshing = null
    }
  }

  /**
   * Ensure the proxy holds a usable access token, refreshing when it is close
   * to expiry.
   * @returns whether a token is available.
   */
  const ensureAccessToken = async () => {
    const generation = authGeneration
    if (state.accessToken !== null && state.expiresAt - REFRESH_SKEW_MS > Date.now()) return true
    if (state.refreshToken === null) return false
    try {
      const refreshed = await refreshAccessToken()
      if (!refreshed || generation !== authGeneration) return false
      if (refreshed && state.mcp !== 'mounted') await mountMcp()
      return generation === authGeneration && state.accessToken !== null
    } catch (error) {
      if (generation !== authGeneration) return false
      const reason = messageOf(error)
      if (refreshRejected(error?.status)) {
        ctx.logger?.warn?.(`bisibility: ${reason}; the refresh token was rejected`)
        resetAuth()
        await clearCredential(REFRESH_TOKEN_REF)
      } else {
        ctx.logger?.warn?.(`bisibility: ${reason}; keeping the refresh token for the next request`)
        state.accessToken = null
        state.expiresAt = 0
      }
      state.error = reason
      return false
    }
  }

  /** JSON-RPC ids for host-side tool calls from this plugin. */
  let rpcId = 0

  /**
   * Call one Bisibility MCP tool with the stored access token.
   *
   * A 401 refreshes once and retries a single time. The request is never sent
   * without a token. Network failures and JSON-RPC errors throw
   * {@link ToolCallError}. A tool result with `isError` resolves, so the
   * caller can show it.
   * @param name - the tool name.
   * @param args - the tool arguments.
   * @returns structured content when the tool sent it, otherwise its text, plus `isError`.
   */
  const callTool = async (name, args) => {
    const generation = authGeneration
    const timeoutMs = settings.toolCallTimeoutMs + PROXY_GRACE_MS
    const post = async () => {
      if (generation !== authGeneration) throw new ToolCallError('auth', 'bisibility is not connected')
      if (typeof state.accessToken !== 'string' || state.accessToken.length === 0) {
        throw new ToolCallError('auth', 'bisibility is not connected')
      }
      const headers = {
        authorization: `Bearer ${state.accessToken}`,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      }
      if (clientHeader !== null) headers[CLIENT_HEADER] = clientHeader
      try {
        return await fetch(settings.resource, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: (rpcId += 1),
            method: 'tools/call',
            params: { name, arguments: args === undefined || args === null ? {} : args },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch (error) {
        throw new ToolCallError('network', fetchFailure('the bisibility tool call', timeoutMs, error), { cause: error })
      }
    }

    const ready = await ensureAccessToken()
    if (generation !== authGeneration) throw new ToolCallError('auth', 'bisibility is not connected')
    if (!ready || typeof state.accessToken !== 'string' || state.accessToken.length === 0) {
      if (state.refreshToken !== null) throw new ToolCallError('network', state.error ?? 'bisibility could not refresh the connection')
      throw new ToolCallError('auth', state.error ?? 'bisibility is not connected')
    }
    let response = await post()
    if (response.status === 401) {
      await discardResponse(response)
      if (generation !== authGeneration) throw new ToolCallError('auth', 'bisibility is not connected')
      state.accessToken = null
      state.expiresAt = 0
      const refreshed = await ensureAccessToken()
      if (!refreshed || typeof state.accessToken !== 'string' || state.accessToken.length === 0) {
        if (state.refreshToken !== null) throw new ToolCallError('network', state.error ?? 'bisibility could not refresh the connection')
        throw new ToolCallError('auth', state.error ?? 'bisibility is not connected')
      }
      response = await post()
      if (response.status === 401) {
        await discardResponse(response)
        throw new ToolCallError('auth', 'bisibility rejected the access token', { status: 401 })
      }
    }
    try {
      const result = await readToolResult(response, { name, args, logger: ctx.logger })
      if (generation !== authGeneration) throw new ToolCallError('auth', 'bisibility is not connected')
      return result
    } catch (error) {
      if (error instanceof ToolCallError) throw error
      throw new ToolCallError('network', fetchFailure('the bisibility tool call', timeoutMs, error), { cause: error })
    }
  }

  // Later host code and the tests reach the helper here. A leading underscore
  // is a Cordis special property, so this does not register a service.
  ctx._callTool = callTool

  /** Cached reads require current authentication and cannot outlive an account change. */
  const read = async (name, args) => {
    const generation = authGeneration
    const ready = await ensureAccessToken()
    if (generation !== authGeneration) throw new ToolCallError('auth', 'bisibility is not connected')
    if (!ready) {
      if (state.refreshToken !== null) throw new ToolCallError('network', state.error ?? 'bisibility could not refresh the connection')
      throw new ToolCallError('auth', state.error ?? 'bisibility is not connected')
    }
    const result = await growthCache.call(ctx, name, args)
    if (generation !== authGeneration) throw new ToolCallError('auth', 'bisibility is not connected')
    if (state.accessToken === null && !(await ensureAccessToken())) {
      if (generation !== authGeneration) throw new ToolCallError('auth', 'bisibility is not connected')
      if (state.refreshToken !== null) throw new ToolCallError('network', state.error ?? 'bisibility could not refresh the connection')
      throw new ToolCallError('auth', state.error ?? 'bisibility is not connected')
    }
    if (generation !== authGeneration) throw new ToolCallError('auth', 'bisibility is not connected')
    return result
  }

  /** When the market index was last read, in epoch milliseconds. */
  let updateCheckedAt = 0

  /**
   * Read the plugin market index for a newer release, at most every few
   * hours. A failure stays silent: the panel simply shows no update.
   */
  const checkForUpdate = async () => {
    if (manifest === null || typeof manifest.name !== 'string' || Date.now() - updateCheckedAt < UPDATE_CHECK_INTERVAL_MS) return
    updateCheckedAt = Date.now()
    try {
      const response = await fetch(MARKET_INDEX_URL, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(UPDATE_CHECK_TIMEOUT_MS),
      })
      if (!response.ok) return
      state.latestVersion = latestMarketVersion(await response.json(), manifest.name)
    } catch (error) {
      /* offline or unpublished: no update notice */
    }
  }

  /** Whether the credential store has been read; it can become available after this plugin starts. */
  let restored = false

  /**
   * Restore a previous authorization from the credential store. Without an
   * available store this leaves `restored` false, so a later call retries.
   */
  const restore = async () => {
    const generation = authGeneration
    const store = credentials()
    if (store === undefined || store === null) return
    let resolved
    try {
      resolved = await store.resolve(REFRESH_TOKEN_REF)
    } catch (error) {
      return
    }
    if (generation !== authGeneration) return
    restored = true
    if (resolved === null || resolved === undefined || typeof resolved.value !== 'string') return
    state.refreshToken = resolved.value
    await ensureAccessToken()
  }

  /** The reconnect attempt in flight, shared by concurrent callers. */
  let reconnecting = null

  /**
   * Finish what boot could not: read the stored authorization once the
   * credential store is available, or refresh a kept token after a transient
   * failure. Without this, a restart that races the store, or a refresh that
   * fails while offline, leaves the panel signed out until a new sign-in.
   * @returns the attempt, or null when there is nothing to do.
   */
  const reconnect = () => {
    if (reconnecting !== null) return reconnecting
    if (state.accessToken !== null || (restored && state.refreshToken === null)) return null
    reconnecting = (restored ? ensureAccessToken() : restore())
      .catch((error) => {
        state.error = messageOf(error)
      })
      .finally(() => {
        reconnecting = null
      })
    return reconnecting
  }

  /**
   * Drop the trust rejection the browser carrier applies to browser requests.
   * @param req - the HTTP request.
   * @param res - the HTTP response.
   * @returns true when the request was answered as untrusted.
   */
  const rejected = (req, res) => {
    let connection
    try {
      connection = ctx.get('connection')
    } catch (error) {
      connection = undefined
    }
    if (connection === undefined || connection === null || typeof connection.requestRejection !== 'function') return false
    let rejection
    try {
      rejection = connection.requestRejection(req)
    } catch (error) {
      rejection = undefined
    }
    if (rejection === undefined) return false
    sendJson(res, rejection, { error: 'untrusted request' })
    return true
  }

  /**
   * Whether a started flow is still waiting for its callback.
   * @returns true while a non-expired flow is pending.
   */
  const hasPendingFlow = () => {
    const now = Date.now()
    for (const [key, pending] of state.pending) {
      if (now - pending.createdAt > PENDING_TTL_MS) state.pending.delete(key)
    }
    return state.pending.size > 0
  }

  /**
   * Persist the in-memory flows so a Host remount or restart between opening
   * the sign-in tab and its callback does not invalidate the state value.
   */
  const persistPending = async () => {
    const flows = [...state.pending.entries()].map(([flow, pending]) => ({
      state: flow,
      verifier: pending.verifier,
      createdAt: pending.createdAt,
      redirectUri,
      external: pending.external === true,
    }))
    await writeCredential(PENDING_REF, JSON.stringify(flows))
  }

  /**
   * Take one pending flow from memory or from the stored copy, removing it.
   *
   * When the authorization server omits `state`, a single live flow is used
   * instead: the PKCE verifier still binds the code to this client, so the
   * exchange cannot be completed with somebody else's code.
   * @param flow - the `state` parameter of the callback, or null.
   * @returns the flow, or undefined when no live flow matches.
   */
  const takePending = async (flow) => {
    const local = flow === null ? undefined : state.pending.get(flow)
    if (local !== undefined) {
      state.pending.delete(flow)
      await persistPending()
      return local
    }
    const stored = await readCredential(PENDING_REF)
    let flows = []
    if (stored !== null) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) flows = parsed
      } catch (error) {
        flows = []
      }
    }
    const live = flows.filter(
      (entry) =>
        entry !== null &&
        typeof entry === 'object' &&
        entry.redirectUri === redirectUri &&
        typeof entry.verifier === 'string' &&
        Number.isFinite(entry.createdAt) &&
        Date.now() - entry.createdAt <= PENDING_TTL_MS,
    )
    let match
    if (flow !== null) {
      match = live.find((entry) => entry.state === flow)
    } else if (live.length === 1) {
      match = live[0]
      ctx.logger?.info?.('bisibility: accepting a callback without state for the single live flow')
    } else if (live.length === 0 && state.pending.size === 1) {
      const [onlyFlow] = [...state.pending.entries()]
      state.pending.delete(onlyFlow[0])
      return onlyFlow[1]
    }
    if (match === undefined) return undefined
    await writeCredential(
      PENDING_REF,
      JSON.stringify(flows.filter((entry) => entry !== match)),
    )
    return { verifier: match.verifier, createdAt: match.createdAt, external: match.external === true }
  }

  /** The status payload shared by the panel and its refresh loop. */
  const status = () => ({
    connected: state.accessToken !== null,
    pending: hasPendingFlow(),
    expiresAt: state.expiresAt > 0 ? state.expiresAt : null,
    refreshable: state.refreshToken !== null,
    account: state.account,
    mcp: state.mcp,
    version,
    stale: fingerprint() !== loadedFingerprint,
    updateRequired: state.updateRequired,
    minVersion: state.minVersion,
    updateAvailable: version !== null && compareVersions(state.latestVersion, version) > 0 ? state.latestVersion : null,
    error: state.error,
  })

  /**
   * Start one authorization flow and return its authorization URL.
   * @param external - whether the sign-in happens in the user's own browser.
   * @returns the authorization URL.
   */
  const beginFlow = async (external) => {
    const clientId = await ensureClientId(true)
    state.error = null
    const verifier = base64url(randomBytes(32))
    const challenge = base64url(createHash('sha256').update(verifier).digest())
    const flow = base64url(randomBytes(16))
    const now = Date.now()
    for (const [key, pending] of state.pending) {
      if (now - pending.createdAt > PENDING_TTL_MS) state.pending.delete(key)
    }
    state.pending.set(flow, { verifier, createdAt: now, external })
    while (state.pending.size > MAX_PENDING) {
      const oldest = [...state.pending.entries()].sort((left, right) => left[1].createdAt - right[1].createdAt)[0]
      state.pending.delete(oldest[0])
    }
    await persistPending()
    const authorize = new URL(`${settings.issuer}/api/auth/oauth2/authorize`)
    authorize.searchParams.set('response_type', 'code')
    authorize.searchParams.set('client_id', clientId)
    authorize.searchParams.set('redirect_uri', redirectUri)
    authorize.searchParams.set('code_challenge', challenge)
    authorize.searchParams.set('code_challenge_method', 'S256')
    authorize.searchParams.set('state', flow)
    authorize.searchParams.set('scope', settings.scope)
    authorize.searchParams.set('resource', settings.resource)
    return authorize.toString()
  }

  /**
   * Open a URL in the user's default browser, where an existing Bisibility
   * session lives and where the loopback callback is reachable. The DeepSeek
   * Harness page is left untouched.
   * @param url - the authorization URL.
   * @returns whether the browser was launched.
   */
  const openExternal = (url) =>
    new Promise((resolve) => {
      const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
      const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
      try {
        execFile(command, args, { timeout: 5000 }, (error) => resolve(error === null || error === undefined))
      } catch (error) {
        resolve(false)
      }
    })

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: `${BASE}/oauth/start`,
        handler: async (req, res) => {
          if (rejected(req, res)) return
          if (req.method !== 'GET') {
            sendJson(res, 405, { error: 'method not allowed' })
            return
          }
          try {
            sendJson(res, 200, { authorizeUrl: await beginFlow(false) })
          } catch (error) {
            state.error = messageOf(error)
            sendJson(res, 502, { error: state.error })
          }
        },
      }),
    'bisibility: GET /oauth/start',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: `${BASE}/oauth/open`,
        handler: async (req, res) => {
          if (rejected(req, res)) return
          if (req.method !== 'POST') {
            sendJson(res, 405, { error: 'method not allowed' })
            return
          }
          try {
            const authorizeUrl = await beginFlow(true)
            const opened = await openExternal(authorizeUrl)
            sendJson(res, 200, { opened, authorizeUrl })
          } catch (error) {
            state.error = messageOf(error)
            sendJson(res, 502, { error: state.error })
          }
        },
      }),
    'bisibility: POST /oauth/open',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: `${BASE}/oauth/callback`,
        handler: async (req, res) => {
          if (req.method !== 'GET') {
            sendJson(res, 405, { error: 'method not allowed' })
            return
          }
          const url = new URL(String(req.url), 'http://127.0.0.1')
          const flow = url.searchParams.get('state')
          const error = url.searchParams.get('error')
          if (error !== null) {
            const description = url.searchParams.get('error_description') ?? error
            const ended = await takePending(flow)
            const external = ended !== undefined && ended.external === true
            state.error = description
            ctx.logger?.info?.(`bisibility: sign-in ended with ${error}`)
            sendPage(res, 400, {
              title: error === 'access_denied' ? 'Sign-in was cancelled' : 'bisibility reported an error',
              detail:
                error === 'access_denied'
                  ? 'Nothing changed in DeepSeek Harness. You can start again from the bisibility panel.'
                  : `${description}. You can start again from the bisibility panel.`,
              ...(external ? {} : { returnTo: '/' }),
            })
            return
          }
          const code = url.searchParams.get('code')
          const pending = await takePending(flow)
          if (code === null || pending === undefined) {
            state.error = 'the sign-in link expired or DeepSeek Harness restarted before it was used'
            ctx.logger?.info?.(
              `bisibility: callback without a live request (state ${flow === null ? 'absent' : 'unknown'})`,
            )
            sendPage(res, 400, {
              title: 'This sign-in link is no longer valid',
              detail:
                'It expires after 15 minutes, and it also stops working if DeepSeek Harness restarts while you are signing in. Return to the bisibility panel and press Connect account again.',
              returnTo: '/',
            })
            return
          }
          const external = pending.external === true
          try {
            await completeAuthorization(code, pending.verifier)
            sendPage(res, 200, {
              title: 'bisibility is connected',
              detail: external
                ? 'You can close this browser tab and return to DeepSeek Harness.'
                : 'Returning to DeepSeek Harness...',
              ...(external ? {} : { returnTo: '/', autoReturn: true }),
            })
          } catch (failure) {
            state.error = messageOf(failure)
            ctx.logger?.warn?.(`bisibility: token exchange failed: ${state.error}`)
            sendPage(res, 502, {
              title: 'bisibility could not finish the sign-in',
              detail: `${state.error}. You can start again from the bisibility panel.`,
              ...(external ? {} : { returnTo: '/' }),
            })
          }
        },
      }),
    'bisibility: GET /oauth/callback',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: `${BASE}/oauth/status`,
        handler: async (req, res) => {
          if (rejected(req, res)) return
          if (req.method !== 'GET') {
            sendJson(res, 405, { error: 'method not allowed' })
            return
          }
          // Opening the panel or pressing Refresh retries a reconnect and the
          // update check, waiting briefly so a quick answer shows at once.
          const work = [reconnect(), checkForUpdate()].filter((attempt) => attempt !== null)
          let timer
          await Promise.race([Promise.all(work), new Promise((resolve) => (timer = setTimeout(resolve, STATUS_RECONNECT_WAIT_MS)))])
          clearTimeout(timer)
          sendJson(res, 200, status())
        },
      }),
    'bisibility: GET /oauth/status',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: `${BASE}/oauth/disconnect`,
        handler: async (req, res) => {
          if (rejected(req, res)) return
          if (req.method !== 'POST') {
            sendJson(res, 405, { error: 'method not allowed' })
            return
          }
          resetAuth()
          await clearCredential(REFRESH_TOKEN_REF)
          sendJson(res, 200, status())
        },
      }),
    'bisibility: POST /oauth/disconnect',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: `${BASE}/mcp`,
        handler: async (req, res) => {
          // The MCP client is a Node fetch with no Origin and no browser
          // cookie. Refuse anything a browser sent, so a page on another site
          // cannot drive paid tools through this loopback proxy.
          if (req.headers.origin !== undefined || req.headers['sec-fetch-site'] !== undefined) {
            sendJson(res, 403, { error: 'browser requests are not accepted by the MCP proxy' })
            return
          }
          if (!restored) await reconnect()
          if (!(await ensureAccessToken())) {
            sendJson(res, 401, { error: 'bisibility is not connected' })
            return
          }
          try {
            const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req)
            const headers = { authorization: `Bearer ${state.accessToken}`, accept: req.headers.accept ?? 'application/json, text/event-stream' }
            if (typeof req.headers['content-type'] === 'string') headers['content-type'] = req.headers['content-type']
            if (typeof req.headers['mcp-protocol-version'] === 'string') headers['mcp-protocol-version'] = req.headers['mcp-protocol-version']
            if (typeof req.headers['mcp-session-id'] === 'string') headers['mcp-session-id'] = req.headers['mcp-session-id']
            if (clientHeader !== null) headers[CLIENT_HEADER] = clientHeader
            const upstream = await fetch(settings.resource, {
              method: req.method,
              headers,
              body,
              signal: AbortSignal.timeout(settings.toolCallTimeoutMs + PROXY_GRACE_MS),
            })
            state.error = null
            res.statusCode = upstream.status
            for (const name of ['content-type', 'cache-control', 'mcp-session-id']) {
              const value = upstream.headers.get(name)
              if (value !== null) res.setHeader(name, value)
            }
            // The server refuses this version until the user updates. Remember
            // the floor for the panel and pass the answer on unchanged, so the
            // MCP client reports the same message.
            if (upstream.status === 426) {
              const text = await upstream.text()
              state.updateRequired = true
              state.minVersion = minVersionOf(text, upstream.headers)
              res.end(text)
              return
            }
            state.updateRequired = false
            state.minVersion = null
            if (upstream.body !== null) {
              res.flushHeaders?.()
              for await (const chunk of upstream.body) res.write(chunk)
            }
            res.end()
          } catch (error) {
            const text = messageOf(error)
            const cancelled = error instanceof Error && error.name === 'AbortError'
            const timedOut = (error instanceof Error && error.name === 'TimeoutError') || /aborted due to timeout/i.test(text)
            if (timedOut) {
              const deadline = Math.round((settings.toolCallTimeoutMs + PROXY_GRACE_MS) / 1000)
              state.error = `the bisibility MCP endpoint did not answer within ${deadline}s`
              sendJson(res, 504, { error: state.error })
              return
            }
            if (cancelled) {
              sendJson(res, 502, { error: 'the MCP call was cancelled' })
              return
            }
            state.error = fetchFailure('the bisibility MCP request', settings.toolCallTimeoutMs + PROXY_GRACE_MS, error)
            sendJson(res, 502, { error: state.error })
          }
        },
      }),
    'bisibility: MCP proxy',
  )

  // Panel reads. These paths are new; the OAuth and MCP routes above stay as they are.
  mountGrowthRoutes(ctx, settings, rejected, read, growthCache)

  // Restore a previous authorization, and own the mounted client's disposal.
  void reconnect()
  ctx.effect(() => () => unmountMcp(), 'bisibility: MCP client')
}
