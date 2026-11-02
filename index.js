import { execFile } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'

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
  scope: 'read write offline_access',
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
  return `${label} failed: ${text}`
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

export const inject = ['webServer']

/**
 * Register the OAuth routes, the MCP proxy, and the MCP client they feed.
 * @param ctx - the host plugin context.
 * @param config - optional deployment overrides from the patch row.
 */
export function apply(ctx, config) {
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
  const codeFiles = ['index.js', 'client.js', 'cordis.patch.yml']
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
   */
  const writeCredential = async (ref, value) => {
    const store = credentials()
    if (store === undefined || store === null) return
    try {
      await store.set(ref, value)
    } catch (error) {
      ctx.logger?.warn?.(`bisibility: could not store ${ref}: ${messageOf(error)}`)
    }
  }

  /**
   * Remove one stored credential value.
   * @param ref - credential reference name.
   */
  const clearCredential = async (ref) => {
    const store = credentials()
    if (store === undefined || store === null) return
    try {
      await store.unset(ref)
    } catch (error) {
      /* an absent value is already cleared */
    }
  }

  /** Drop in-memory authorization and unmount the MCP client. */
  const resetAuth = () => {
    state.accessToken = null
    state.refreshToken = null
    state.expiresAt = 0
    state.account = null
    state.error = null
    unmountMcp()
  }

  /** Unmount the shipped MCP client, if this bridge mounted one. */
  const unmountMcp = () => {
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
    if (state.fiber !== null || state.mcp === 'mounting') return
    state.mcp = 'mounting'
    state.error = null
    try {
      const loader = ctx.loader ?? optionalService('loader')
      if (loader === undefined || loader === null || typeof loader.import !== 'function') {
        throw new Error('the Cordis Loader is not available in this profile')
      }
      const namespace = await loader.import('@deepseek-ai/dsh-mcp-client')
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
      state.mcp = 'failed'
      state.error = messageOf(error)
      ctx.logger?.warn?.(`bisibility: could not mount the MCP client: ${state.error}`)
    }
  }

  /**
   * Register a dynamic OAuth client for this callback address, reusing the
   * stored registration while the callback address is unchanged.
   * @returns the client identifier.
   */
  const ensureClientId = async () => {
    const stored = await readCredential(CLIENT_ID_REF)
    if (stored !== null) {
      try {
        const parsed = JSON.parse(stored)
        if (parsed !== null && parsed.redirectUri === redirectUri && typeof parsed.clientId === 'string') {
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
    await writeCredential(CLIENT_ID_REF, JSON.stringify({ redirectUri, clientId: payload.client_id }))
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
      throw new Error(fetchFailure('the Bisibility token endpoint', TOKEN_TIMEOUT_MS, error))
    }
    const payload = await response.json().catch(() => null)
    if (!response.ok || payload === null || typeof payload.access_token !== 'string') {
      throw new Error(`token exchange failed with HTTP ${response.status}`)
    }
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
    if (state.refreshing !== null) return state.refreshing
    const run = (async () => {
      const clientId = await ensureClientId()
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: state.refreshToken,
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
      if (!response.ok || payload === null || typeof payload.access_token !== 'string') {
        throw new Error(`token refresh failed with HTTP ${response.status}`)
      }
      state.accessToken = payload.access_token
      state.expiresAt = Date.now() + (Number.isFinite(payload.expires_in) ? payload.expires_in : 3600) * 1000
      state.error = null
      if (typeof payload.refresh_token === 'string') {
        state.refreshToken = payload.refresh_token
        await writeCredential(REFRESH_TOKEN_REF, payload.refresh_token)
      }
      return true
    })()
    state.refreshing = run
    try {
      return await run
    } finally {
      state.refreshing = null
    }
  }

  /**
   * Ensure the proxy holds a usable access token, refreshing when it is close
   * to expiry.
   * @returns whether a token is available.
   */
  const ensureAccessToken = async () => {
    if (state.accessToken !== null && state.expiresAt - REFRESH_SKEW_MS > Date.now()) return true
    if (state.refreshToken === null) return false
    try {
      const refreshed = await refreshAccessToken()
      if (refreshed && state.mcp !== 'mounted') await mountMcp()
      return true
    } catch (error) {
      const reason = messageOf(error)
      resetAuth()
      state.error = reason
      await clearCredential(REFRESH_TOKEN_REF)
      return false
    }
  }

  /**
   * Restore a previous authorization from the credential store at boot.
   */
  const restore = async () => {
    const stored = await readCredential(REFRESH_TOKEN_REF)
    if (stored === null) return
    state.refreshToken = stored
    await ensureAccessToken()
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
    error: state.error,
  })

  /**
   * Start one authorization flow and return its authorization URL.
   * @param external - whether the sign-in happens in the user's own browser.
   * @returns the authorization URL.
   */
  const beginFlow = async (external) => {
    const clientId = await ensureClientId()
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
              title: error === 'access_denied' ? 'Sign-in was cancelled' : 'Bisibility reported an error',
              detail:
                error === 'access_denied'
                  ? 'Nothing changed in DeepSeek Harness. You can start again from the Bisibility panel.'
                  : `${description}. You can start again from the Bisibility panel.`,
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
                'It expires after 15 minutes, and it also stops working if DeepSeek Harness restarts while you are signing in. Return to the Bisibility panel and press Connect account again.',
              returnTo: '/',
            })
            return
          }
          const external = pending.external === true
          try {
            await completeAuthorization(code, pending.verifier)
            sendPage(res, 200, {
              title: 'Bisibility is connected',
              detail: external
                ? 'You can close this browser tab and return to DeepSeek Harness.'
                : 'Returning to DeepSeek Harness...',
              ...(external ? {} : { returnTo: '/', autoReturn: true }),
            })
          } catch (failure) {
            state.error = messageOf(failure)
            ctx.logger?.warn?.(`bisibility: token exchange failed: ${state.error}`)
            sendPage(res, 502, {
              title: 'Bisibility could not finish the sign-in',
              detail: `${state.error}. You can start again from the Bisibility panel.`,
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
          if (!(await ensureAccessToken())) {
            sendJson(res, 401, { error: 'Bisibility is not connected' })
            return
          }
          try {
            const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req)
            const headers = { authorization: `Bearer ${state.accessToken}`, accept: req.headers.accept ?? 'application/json, text/event-stream' }
            if (typeof req.headers['content-type'] === 'string') headers['content-type'] = req.headers['content-type']
            if (typeof req.headers['mcp-protocol-version'] === 'string') headers['mcp-protocol-version'] = req.headers['mcp-protocol-version']
            if (typeof req.headers['mcp-session-id'] === 'string') headers['mcp-session-id'] = req.headers['mcp-session-id']
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
              state.error = `the Bisibility MCP endpoint did not answer within ${deadline}s`
              sendJson(res, 504, { error: state.error })
              return
            }
            if (cancelled) {
              sendJson(res, 502, { error: 'the MCP call was cancelled' })
              return
            }
            state.error = text
            sendJson(res, 502, { error: state.error })
          }
        },
      }),
    'bisibility: MCP proxy',
  )

  // Restore a previous authorization, and own the mounted client's disposal.
  void restore().catch((error) => {
    state.error = messageOf(error)
  })
  ctx.effect(() => () => unmountMcp(), 'bisibility: MCP client')
}
