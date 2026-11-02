window.__ModuleLoader__.load({
  id: '@bisibility/dsh-plugin',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this bundle. */
    const NS = 'bisibility.panel';
    /** Sidebar entry id; the same id is the keyed `main` panel. */
    const PANEL_ID = 'bisibility';
    /** Agent preset declared by this bundle's patch. */
    const PRESET_ID = 'bisibility';
    /** Host routes served by this bundle's Host half. */
    const STATUS_URL = '/bisibility/oauth/status';
    const OPEN_URL = '/bisibility/oauth/open';
    const DISCONNECT_URL = '/bisibility/oauth/disconnect';
    /** The plugin's page on the product site. */
    const DOCS_URL = 'https://bisibility.com/integrations/deepseek-harness';
    /** Troubleshooting section of the public README. */
    const TROUBLESHOOTING_URL = 'https://github.com/CorgiCorner/bisibility-dsh-plugin#troubleshooting';
    /** Product site. */
    const SITE_URL = 'https://bisibility.com';
    /** How often the panel re-reads status while a sign-in is in flight. */
    const PENDING_POLL_MS = 1500;
    /** Stop polling after this long, in milliseconds. */
    const PENDING_LIMIT_MS = 5 * 60 * 1000;

    const en = {
      panel: 'bisibility',
      title: 'bisibility',
      subtitle: 'Rank tracking, keyword research, backlinks, and AI visibility inside DeepSeek Harness.',
      refresh: 'Refresh',
      'status.checking': 'Checking the connection...',
      'status.unreachable': 'The bisibility plugin is not responding',
      'status.unreachableDetail': 'The Host routes of this bundle did not answer. Reinstall the bundle or restart DSH.',
      'status.idle': 'Not connected',
      'status.idleDetail': 'Sign in once; bisibility tools then appear in this harness without an API key.',
      'status.pending': 'Waiting for sign-in',
      'status.pendingDetail': 'Finish the sign-in in your browser. If bisibility showed its dashboard, press Connect account again to finish.',
      'status.connected': 'Connected',
      'status.connectedDetail': 'The agent can call bisibility tools, named mcp__bisibility__<tool>.',
      'status.failed': 'Not connected',
      'status.failedDetail': 'The last attempt did not finish. The detail below comes from the harness; press Connect account to try again.',
      'status.mcpFailed': 'Connected, but the MCP client did not start',
      'status.mcpFailedDetail': 'The Host reported a mount failure; the detail below comes from the harness.',
      'connect.title': 'Sign in with bisibility',
      'connect.body': 'Connect opens bisibility in your browser. If it shows its dashboard after you sign in, you are signed in now: press Connect account once more to finish. Tokens stay in the harness credential store, never in a config file or an environment variable.',
      'connect.action': 'Connect account',
      'connect.working': 'Opening bisibility...',
      'connected.account': 'Signed in as {account}',
      'connected.renews': 'Access renews automatically on use.',
      'connected.expires': 'Access expires {when}; connect again to renew.',
      'connected.disconnect': 'Disconnect',
      'conversation.new': 'New bisibility conversation',
      'update.stale': 'New plugin code is on disk. Reinstall the bundle to load it.',
      'update.openPlugins': 'Open Plugins',
      'update.reload': 'Reload page',
      'update.required': 'Update required',
      'update.requiredVersion': 'bisibility now needs version {version} or newer of this plugin. Update it on the Plugins page, then quit and reopen DeepSeek Harness.',
      'update.requiredDetail': 'bisibility no longer accepts this version of the plugin. Update it on the Plugins page, then quit and reopen DeepSeek Harness.',
      'connected.disconnecting': 'Disconnecting...',
      'tools.title': 'What the agent gets',
      'tools.projects': 'Projects, keywords, and rank checks for every tracked project.',
      'tools.analytics': 'Backlink profiles, traffic snapshots, and Domain Overview estimates.',
      'tools.visibility': 'AI visibility and prompt research across answer engines.',
      'tools.scope': 'Read-only access unless the authorization grants writes.',
      'update.available': 'bisibility {version} is available. Install it from Discover on the Plugins page, then quit and reopen DeepSeek Harness.',
      docs: 'Plugin guide',
      troubleshooting: 'Troubleshooting',
      site: 'bisibility.com',
    };

    const zh = {
      panel: 'bisibility',
      title: 'bisibility',
      subtitle: '在 DeepSeek Harness 内进行排名跟踪、关键词研究、外链分析和 AI 可见度检查。',
      refresh: '刷新',
      'status.checking': '正在检查连接…',
      'status.unreachable': 'bisibility 插件无响应',
      'status.unreachableDetail': '此捆绑包的 Host 路由没有响应。请重新安装捆绑包或重启 DSH。',
      'status.idle': '未连接',
      'status.idleDetail': '登录一次即可使用 bisibility 工具，无需 API 密钥。',
      'status.pending': '等待登录',
      'status.pendingDetail': '请在浏览器中完成登录。如果 bisibility 显示了仪表板，请再次点击“连接账户”以完成连接。',
      'status.connected': '已连接',
      'status.connectedDetail': '智能体可以调用名为 mcp__bisibility__<tool> 的 bisibility 工具。',
      'status.failed': '未连接',
      'status.failedDetail': '上一次尝试没有完成。下面的详细信息来自 harness；请再次点击“连接账户”。',
      'status.mcpFailed': '已连接，但 MCP 客户端未能启动',
      'status.mcpFailedDetail': 'Host 报告了挂载失败；下面的详细信息来自 harness。',
      'connect.title': '使用 bisibility 登录',
      'connect.body': '连接会在浏览器中打开 bisibility。如果登录后显示的是仪表板，说明你已登录：再次点击“连接账户”即可完成。令牌只保存在 harness 凭据存储中，不会写入配置文件或环境变量。',
      'connect.action': '连接账户',
      'connect.working': '正在打开 bisibility…',
      'connected.account': '已登录：{account}',
      'connected.renews': '访问令牌会在使用时自动续期。',
      'connected.expires': '访问令牌将于 {when} 到期；请重新连接以续期。',
      'connected.disconnect': '断开连接',
      'conversation.new': '新建 bisibility 对话',
      'update.stale': '磁盘上有新的插件代码，请重新安装捆绑包以加载它。',
      'update.openPlugins': '打开插件页',
      'update.reload': '刷新页面',
      'update.required': '需要更新',
      'update.requiredVersion': 'bisibility 现在需要此插件 {version} 或更高版本。请在插件页更新，然后退出并重新打开 DeepSeek Harness。',
      'update.requiredDetail': 'bisibility 不再接受此插件版本。请在插件页更新，然后退出并重新打开 DeepSeek Harness。',
      'connected.disconnecting': '正在断开…',
      'tools.title': '智能体可以使用',
      'tools.projects': '所有跟踪项目的项目、关键词和排名检查。',
      'tools.analytics': '外链概况、流量快照和 Domain Overview 估算。',
      'tools.visibility': '跨答案引擎的 AI 可见度和提示词研究。',
      'tools.scope': '除非授权包含写入，否则仅提供只读访问。',
      'update.available': 'bisibility {version} 已发布。请在插件页的 Discover 中安装，然后退出并重新打开 DeepSeek Harness。',
      docs: '插件指南',
      troubleshooting: '故障排除',
      site: 'bisibility.com',
    };

    /** Panel styles. Colors come only from theme tokens; class names stay prefixed. */
    const styles = `
.bis-page{box-sizing:border-box;width:100%;min-width:0;height:100%;min-height:0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:14px;line-height:1.6;display:flex;overflow:hidden}
.bis-scroll{scrollbar-gutter:stable;flex:1;min-width:0;min-height:0;overflow-y:auto}
.bis-content{max-width:760px;margin:0 auto;padding:0 clamp(24px,4vw,48px) 56px}
.bis-head{display:flex;align-items:center;gap:14px;padding:26px 0 20px}
[data-platform=darwin] .bis-head{padding-top:calc(26px + var(--dsh-frame-top-clearance,0px))}
.bis-mark{width:40px;height:40px;color:var(--dsw-alias-label-primary);border-radius:12px;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);flex:none;justify-content:center;align-items:center;display:inline-flex}
.bis-titles{flex-direction:column;min-width:0;display:flex}
.bis-title{margin:0;font-size:20px;font-weight:500;line-height:28px}
.bis-version{color:var(--dsw-alias-label-tertiary);margin-left:6px;font-size:11px;font-weight:400}
.bis-subtitle{color:var(--dsw-alias-label-secondary);text-wrap:pretty;margin:2px 0 0;font-size:13px;line-height:20px}
.bis-card{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1);padding:14px 16px}
.bis-status{display:flex;align-items:flex-start;gap:10px}
.bis-dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);flex:none;margin-top:7px}
.bis-dot[data-state=ok]{background:var(--dsw-alias-state-success-primary)}
.bis-dot[data-state=warn]{background:var(--dsw-alias-state-warn-primary)}
.bis-dot[data-state=error]{background:var(--dsw-alias-state-error-primary)}
.bis-statusBody{flex:1;min-width:0}
.bis-statusTitle{font-size:13px;font-weight:500;line-height:20px;margin:0}
.bis-statusDetail{color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;margin:2px 0 0;font-size:12px;line-height:18px}
.bis-meta{color:var(--dsw-alias-label-tertiary);flex-wrap:wrap;align-items:center;gap:4px 12px;margin:8px 0 0;font-size:12px;line-height:18px;display:flex}
.bis-error{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-2);border-radius:8px;overflow-wrap:anywhere;white-space:pre-wrap;margin:10px 0 0;padding:8px 10px;font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11px;line-height:17px}
.bis-actions{flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px;display:flex}
.bis-button{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l2);border-radius:14px;height:28px;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:0 0;flex:none;align-items:center;padding:0 12px;font-size:12px;line-height:20px;display:inline-flex}
.bis-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.bis-button:disabled{cursor:default;opacity:.55}
.bis-button:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:2px}
.bis-primary{border-color:transparent;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-label-primary-inverted,var(--dsw-alias-bg-base));height:30px;padding:0 14px;font-size:13px}
.bis-primary:hover:not(:disabled){background:var(--dsw-alias-label-primary);color:var(--dsw-alias-label-primary-inverted,var(--dsw-alias-bg-base));opacity:.9}
.bis-section{margin-top:28px}
.bis-h2{color:var(--dsw-alias-label-tertiary);letter-spacing:.04em;text-transform:uppercase;margin:0 0 10px;font-size:11px;font-weight:500;line-height:16px}
.bis-copy{color:var(--dsw-alias-label-secondary);text-wrap:pretty;margin:0;font-size:13px;line-height:21px}
.bis-list{color:var(--dsw-alias-label-primary);flex-direction:column;gap:6px;margin:0;padding:0;font-size:13px;line-height:21px;list-style:none;display:flex}
.bis-list li{padding-left:16px;position:relative}
.bis-list li:before{content:"";background:var(--dsw-alias-label-tertiary);border-radius:1px;width:4px;height:4px;position:absolute;top:8.5px;left:2px}
.bis-notice{box-sizing:border-box;border:.5px solid var(--dsw-alias-state-warn-primary);border-radius:14px;background:var(--dsw-alias-bg-layer-1);margin-top:10px;padding:12px 16px}
.bis-footer{display:flex;flex-wrap:wrap;align-items:center;gap:6px 18px;border-top:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);margin-top:32px;padding-top:14px;font-size:12px;line-height:18px}
.bis-link{color:var(--dsw-alias-brand-primary);font:inherit;cursor:pointer;background:0 0;border:0;padding:0;font-size:12px;text-decoration:none}
.bis-link:hover{text-decoration:underline}
.bis-link:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:2px;border-radius:2px}
.bis-visuallyHidden{clip:rect(0 0 0 0);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}
.bis-page :focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:2px}
`;

    /**
     * The Bisibility mark: a rounded square with a circular aperture, drawn in
     * the host's own icon color so it follows rail and row states.
     * @param props - the sidebar's square edge, or a decorative size.
     * @returns decorative SVG glyph.
     */
    function BisibilityMark({ size }) {
      const edge = typeof size === 'number' && size > 0 ? size : 16;
      return h(
        'svg',
        {
          width: edge,
          height: edge,
          viewBox: '0 0 24 24',
          fill: 'none',
          'aria-hidden': 'true',
          focusable: 'false',
          style: { display: 'block' },
        },
        h('path', {
          fill: 'currentColor',
          fillRule: 'evenodd',
          clipRule: 'evenodd',
          d: 'M7.7 3h8.6A4.7 4.7 0 0 1 21 7.7v8.6a4.7 4.7 0 0 1-4.7 4.7H7.7A4.7 4.7 0 0 1 3 16.3V7.7A4.7 4.7 0 0 1 7.7 3Zm4.3 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z',
        }),
      );
    }

    /**
     * Sidebar occupant: the sidebar owns the button, tooltip, and label, so the
     * entry renders only the glyph at the requested edge.
     * @param props - the sidebar's icon share.
     * @returns the glyph.
     */
    function BisibilityIcon({ size }) {
      return h(BisibilityMark, { size });
    }

    /**
     * Read the bridge status from the bundle's Host half.
     * @returns the status payload.
     */
    async function readStatus() {
      const response = await fetch(STATUS_URL, {
        method: 'GET',
        headers: { accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error(`status request failed with HTTP ${response.status}`);
      return response.json();
    }

    /**
     * Format an absolute timestamp as local wall-clock time.
     * @param value - epoch milliseconds.
     * @returns display text.
     */
    function formatTime(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '';
      try {
        return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
      } catch (error) {
        return new Date(value).toISOString();
      }
    }

    /**
     * Map the bridge status onto the card's status line.
     * @param snapshot - the latest status payload.
     * @param t - panel translator.
     * @returns status state, title, and optional detail.
     */
    function describeStatus(snapshot, t) {
      if (snapshot === null) {
        return { state: 'warn', title: t('status.checking'), detail: null };
      }
      if (snapshot.connected === true) {
        if (snapshot.updateRequired === true) {
          return { state: 'error', title: t('update.required'), detail: null };
        }
        if (snapshot.mcp === 'failed') {
          return { state: 'error', title: t('status.mcpFailed'), detail: t('status.mcpFailedDetail') };
        }
        return { state: 'ok', title: t('status.connected'), detail: t('status.connectedDetail') };
      }
      if (snapshot.pending === true) {
        return { state: 'warn', title: t('status.pending'), detail: t('status.pendingDetail') };
      }
      if (snapshot.error !== null && snapshot.error !== undefined && String(snapshot.error).length > 0) {
        return { state: 'error', title: t('status.failed'), detail: t('status.failedDetail') };
      }
      return { state: 'warn', title: t('status.idle'), detail: t('status.idleDetail') };
    }

    /**
     * The Bisibility page behind the left-sidebar entry.
     * @param props - panel translator and standard slot props.
     * @returns the panel element tree.
     */
    function BisibilityPanel(props) {
      const { t, startBisibilitySession, openPluginsPanel } = props;
      const [snapshot, setSnapshot] = React.useState(null);
      const [unreachable, setUnreachable] = React.useState(false);
      const [busy, setBusy] = React.useState(null);
      const [localError, setLocalError] = React.useState(null);
      const alive = React.useRef(true);

      const load = React.useCallback(async () => {
        try {
          const next = await readStatus();
          if (!alive.current) return;
          setSnapshot(next);
          setUnreachable(false);
        } catch (error) {
          if (!alive.current) return;
          setUnreachable(true);
        }
      }, []);

      React.useEffect(() => {
        alive.current = true;
        void load();
        return () => {
          alive.current = false;
        };
      }, [load]);

      // Re-read whenever the window regains focus: the user comes back from the
      // authorization tab, and the callback may have finished just before that.
      React.useEffect(() => {
        const onFocus = () => {
          void load();
        };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
      }, [load]);

      // While a sign-in is in flight, poll briefly instead of asking the user to
      // press Refresh. Bounded so an abandoned tab cannot poll forever.
      React.useEffect(() => {
        if (snapshot === null || snapshot.pending !== true || snapshot.connected === true) return undefined;
        const startedAt = Date.now();
        const timer = setInterval(() => {
          if (Date.now() - startedAt > PENDING_LIMIT_MS) {
            clearInterval(timer);
            return;
          }
          void load();
        }, PENDING_POLL_MS);
        return () => clearInterval(timer);
      }, [snapshot, load]);

      const connect = async () => {
        setBusy('connect');
        setLocalError(null);
        try {
          const response = await fetch(OPEN_URL, {
            method: 'POST',
            headers: { accept: 'application/json' },
            cache: 'no-store',
            credentials: 'same-origin',
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || payload === null) {
            const detail = payload !== null && typeof payload.error === 'string' ? `: ${payload.error}` : '';
            throw new Error(`the sign-in could not be started (HTTP ${response.status})${detail}`);
          }
          if (payload.opened !== true) {
            if (typeof payload.authorizeUrl !== 'string') throw new Error('the authorization URL was not available');
            // No system browser: carry the sign-in in this tab instead.
            window.location.assign(payload.authorizeUrl);
            return;
          }
          void load();
        } catch (error) {
          setLocalError(error.message);
        } finally {
          setBusy(null);
        }
      };

      const disconnect = async () => {
        setBusy('disconnect');
        setLocalError(null);
        try {
          const response = await fetch(DISCONNECT_URL, {
            method: 'POST',
            headers: { accept: 'application/json' },
            cache: 'no-store',
            credentials: 'same-origin',
          });
          if (!response.ok) throw new Error(`disconnect failed with HTTP ${response.status}`);
          const next = await response.json();
          setSnapshot(next);
          setUnreachable(false);
        } catch (error) {
          setLocalError(error.message);
        } finally {
          setBusy(null);
        }
      };

      const openPlugins = () => {
        setLocalError(null);
        try {
          openPluginsPanel();
        } catch (error) {
          setLocalError(error.message);
        }
      };

      const startConversation = () => {
        setLocalError(null);
        try {
          startBisibilitySession();
        } catch (error) {
          setLocalError(error.message);
        }
      };

      const status = unreachable
        ? { state: 'error', title: t('status.unreachable'), detail: t('status.unreachableDetail') }
        : describeStatus(snapshot, t);
      const connected = snapshot !== null && snapshot.connected === true;
      const refreshable = snapshot !== null && snapshot.refreshable === true;
      const account = snapshot !== null && typeof snapshot.account === 'string' ? snapshot.account : null;
      const expires = snapshot !== null ? formatTime(snapshot.expiresAt) : '';
      const expiryNote =
        !connected
          ? null
          : refreshable
            ? t('connected.renews')
            : expires === ''
              ? null
              : t('connected.expires', { when: expires });
      const hostError = snapshot !== null && typeof snapshot.error === 'string' ? snapshot.error : null;
      const version = snapshot !== null && typeof snapshot.version === 'string' ? snapshot.version : null;
      const stale = snapshot !== null && snapshot.stale === true;
      const updateRequired = snapshot !== null && snapshot.updateRequired === true;
      const minVersion = snapshot !== null && typeof snapshot.minVersion === 'string' ? snapshot.minVersion : null;
      const updateAvailable =
        snapshot !== null && typeof snapshot.updateAvailable === 'string' ? snapshot.updateAvailable : null;

      return h(
        'section',
        { className: 'bis-page', 'aria-label': t('title') },
        h('style', { key: 'bisibility-panel-styles' }, styles),
        h(
          'div',
          { className: 'bis-scroll' },
          h(
            'div',
            { className: 'bis-content' },
            h(
              'header',
              { className: 'bis-head' },
              h('span', { className: 'bis-mark' }, h(BisibilityMark, { size: 22 })),
              h(
                'div',
                { className: 'bis-titles' },
                h(
                  'h1',
                  { className: 'bis-title' },
                  t('title'),
                  version === null ? null : h('span', { className: 'bis-version' }, `v${version}`),
                ),
                h('p', { className: 'bis-subtitle' }, t('subtitle')),
              ),
            ),
            h(
              'div',
              { className: 'bis-card' },
              h(
                'div',
                { className: 'bis-status' },
                h('span', { className: 'bis-dot', 'data-state': status.state, 'aria-hidden': 'true' }),
                h(
                  'div',
                  { className: 'bis-statusBody' },
                  h('p', { className: 'bis-statusTitle' }, status.title),
                  status.detail === null ? null : h('p', { className: 'bis-statusDetail' }, status.detail),
                ),
              ),
              connected && (account !== null || expiryNote !== null)
                ? h(
                    'p',
                    { className: 'bis-meta' },
                    account === null ? null : h('span', null, t('connected.account', { account })),
                    expiryNote === null ? null : h('span', null, expiryNote),
                  )
                : null,
              hostError !== null ? h('pre', { className: 'bis-error' }, hostError) : null,
              localError !== null ? h('pre', { className: 'bis-error' }, localError) : null,
              h(
                'div',
                { className: 'bis-actions' },
                connected
                  ? h(
                      'button',
                      {
                        type: 'button',
                        className: 'bis-button bis-primary',
                        onClick: startConversation,
                        disabled: busy !== null,
                      },
                      t('conversation.new'),
                    )
                  : h(
                      'button',
                      {
                        type: 'button',
                        className: 'bis-button bis-primary',
                        onClick: connect,
                        disabled: busy !== null || unreachable,
                      },
                      busy === 'connect' ? t('connect.working') : t('connect.action'),
                    ),
                connected
                  ? h(
                      'button',
                      {
                        type: 'button',
                        className: 'bis-button',
                        onClick: disconnect,
                        disabled: busy !== null,
                      },
                      busy === 'disconnect' ? t('connected.disconnecting') : t('connected.disconnect'),
                    )
                  : null,
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'bis-button',
                    onClick: () => void load(),
                    disabled: busy !== null,
                  },
                  t('refresh'),
                ),
              ),
            ),
            updateRequired
              ? h(
                  'div',
                  { className: 'bis-notice', role: 'alert' },
                  h(
                    'p',
                    { className: 'bis-statusDetail' },
                    minVersion === null
                      ? t('update.requiredDetail')
                      : t('update.requiredVersion', { version: minVersion }),
                  ),
                  h(
                    'div',
                    { className: 'bis-actions' },
                    h(
                      'button',
                      { type: 'button', className: 'bis-button bis-primary', onClick: openPlugins },
                      t('update.openPlugins'),
                    ),
                  ),
                )
              : null,
            !updateRequired && updateAvailable !== null
              ? h(
                  'div',
                  { className: 'bis-notice' },
                  h('p', { className: 'bis-statusDetail' }, t('update.available', { version: updateAvailable })),
                  h(
                    'div',
                    { className: 'bis-actions' },
                    h(
                      'button',
                      { type: 'button', className: 'bis-button bis-primary', onClick: openPlugins },
                      t('update.openPlugins'),
                    ),
                  ),
                )
              : null,
            stale
              ? h(
                  'div',
                  { className: 'bis-notice' },
                  h('p', { className: 'bis-statusDetail' }, t('update.stale')),
                  h(
                    'div',
                    { className: 'bis-actions' },
                    h(
                      'button',
                      { type: 'button', className: 'bis-button bis-primary', onClick: openPlugins },
                      t('update.openPlugins'),
                    ),
                    h(
                      'button',
                      { type: 'button', className: 'bis-button', onClick: () => window.location.reload() },
                      t('update.reload'),
                    ),
                  ),
                )
              : null,
            connected
              ? null
              : h(
                  'section',
                  { className: 'bis-section' },
                  h('h2', { className: 'bis-h2' }, t('connect.title')),
                  h('p', { className: 'bis-copy' }, t('connect.body')),
                ),
            h(
              'section',
              { className: 'bis-section' },
              h('h2', { className: 'bis-h2' }, t('tools.title')),
              h(
                'ul',
                { className: 'bis-list' },
                h('li', null, t('tools.projects')),
                h('li', null, t('tools.analytics')),
                h('li', null, t('tools.visibility')),
                h('li', null, t('tools.scope')),
              ),
            ),
            h(
              'footer',
              { className: 'bis-footer' },
              h(
                'a',
                { className: 'bis-link', href: DOCS_URL, target: '_blank', rel: 'noreferrer noopener' },
                t('docs'),
              ),
              h(
                'a',
                { className: 'bis-link', href: TROUBLESHOOTING_URL, target: '_blank', rel: 'noreferrer noopener' },
                t('troubleshooting'),
              ),
              h(
                'a',
                { className: 'bis-link', href: SITE_URL, target: '_blank', rel: 'noreferrer noopener' },
                t('site'),
              ),
            ),
          ),
        ),
      );
    }

    /** Services the panel needs: slot seats and dictionaries. */
    const inject = ['slots', 'locale'];

    /**
     * Register the left-sidebar entry and its page.
     * @param ctx - browser services used by these contributions.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'bisibility: dictionaries');
      const t = ctx.locale.bind(NS);

      /**
       * Open a new conversation under this bundle's preset, so the chat is marked
       * "Bisibility" in the preset control and its session log.
       */
      /**
       * Jump to the Plugins page, where a bundle is reinstalled by removing and
       * adding it. The panel cannot reinstall itself: removing this bundle
       * unloads the plugin that would be serving the request.
       */
      const openPluginsPanel = () => {
        let layout
        try {
          layout = ctx.get('layout')
        } catch (error) {
          layout = undefined
        }
        if (layout === undefined || layout === null || typeof layout.selectPanel !== 'function') {
          throw new Error('the layout service is not available in this build')
        }
        layout.selectPanel('plugins')
      };

      const startBisibilitySession = () => {
        let workspace
        try {
          workspace = ctx.get('uiWorkspace')
        } catch (error) {
          workspace = undefined
        }
        if (workspace === undefined || workspace === null || typeof workspace.startSession !== 'function') {
          throw new Error('the workspace service is not available in this build')
        }
        workspace.startSession(undefined, { agentPreset: PRESET_ID })
      };

      ctx.slots.inject('main', () =>
        ctx.slots.register(
          {
            name: 'main',
            key: PANEL_ID,
            locale: NS,
            inject: () => ({ startBisibilitySession, openPluginsPanel }),
          },
          BisibilityPanel,
        ),
      );

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 20,
            locale: NS,
            label: () => t('panel'),
          },
          BisibilityIcon,
        ),
      );
    }

    return { inject, apply };
  },
});
