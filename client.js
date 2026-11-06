window.__ModuleLoader__.load({
  id: '@bisibility/dsh-plugin',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives');
    const { Button, Input, Pill, Checkbox, Tag, Menu, MenuItemButton, Modal, Tooltip, StateDot, Toast, writeClipboard } = primitives;

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
      'status.connectedDetail': 'The agent can call bisibility tools.',
      'status.failed': 'Not connected',
      'status.failedDetail': 'The last attempt did not finish. The detail below comes from the harness; press Connect account to try again.',
      'status.mcpFailed': 'Connected, but the MCP client did not start',
      'status.mcpFailedDetail': 'The Host reported a mount failure; the detail below comes from the harness.',
      'connect.title': 'Sign in with bisibility',
      'connect.body': 'Connect opens bisibility in your browser. If it shows its dashboard after you sign in, you are signed in now: press Connect account once more to finish. Tokens stay in the harness credential store, never in a config file or an environment variable.',
      'connect.action': 'Connect account',
      'connect.working': 'Opening bisibility...',
      'connected.account': 'Signed in as {account}',
      'connected.renews': 'Session token renews when you use bisibility. This is not a subscription.',
      'header.settings': 'Settings',
      'header.noProject': 'No project',
      'header.version': 'Version {version}',
      'header.session': 'Session token',
      'header.provider': 'Provider setup',
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
      loading: 'Loading',
      'error.signIn': 'Sign in again to continue.',
      'project.label': 'Project',
      'project.empty': 'No project yet. Add the domain you want to track.',
      'project.domain': 'Domain',
      'project.create': 'Create project',
      'project.confirm': 'Create {domain} as a project on this account?',
      'project.cancel': 'Cancel',
      'project.creating': 'Creating project...',
      'project.invalid': 'Enter a domain such as example.com.',
      'checklist.audit': 'Site audit',
      'checklist.auditDone': 'Audit saved',
      'checklist.search': 'Search Console',
      'checklist.searchDone': 'Search Console connected',
      'checklist.analytics': 'Analytics',
      'checklist.analyticsDone': 'Analytics connected',
      'checklist.keywords': 'Keywords',
      'checklist.keywordsDone': 'Keywords added',
      'connect.gscOn': 'Search Console connected',
      'connect.gscOff': 'Search Console not connected',
      'connect.gaOn': 'Analytics connected',
      'connect.gaOff': 'Analytics not connected',
      'connect.optional': 'Optional',
      'data.title': 'Project data',
      'data.range': '{start} to {end}',
      'data.partial': 'Partial sums of up to 1,000 query rows.',
      'data.actual': 'Data: {start} to {end} (Pacific dates)',
      'data.window': 'Window: {start} to {end} (Pacific dates)',
      'data.noDates': 'No data returned for this window.',
      'data.provisional': 'May include provisional data.',
      'data.final': 'Finalized data.',
      'data.fetched': 'Fetched: {date}',
      'data.finalized': 'Finalized through: {date}',
      'data.incomplete': 'First incomplete date: {date}',
      'data.unknown': 'unknown',
      'failure.indexing': 'Indexing data could not load.',
      'search.indexingDraft': '{count} pages are not indexed for {domain}.',
      'data.empty': 'Numbers show up here after Search Console or Analytics has a saved window.',
      'data.notIndexed': 'not indexed in the not_indexed group',
      'data.sessionDate': '{count} on {date}',
      'audit.title': 'Site audit',
      'audit.limit': 'Up to 15 pages',
      'audit.prep.domain': 'Domain',
      'audit.prep.scope': 'Scope',
      'audit.prep.access': 'Access',
      'audit.running': 'Crawling up to 15 pages.',
      'audit.again': 'Run again',
      'audit.explain': 'Review with agent',
      'audit.review': 'Review audit {id} for {domain}.',
      'audit.findingLine': 'Finding: {message} ({code}, {severity}).',
      'audit.urlsLead': 'Affected URLs:',
      'audit.viewFindings': 'View findings',
      'audit.tab.findings': 'Findings',
      'audit.tab.pages': 'Pages',
      'audit.tab.details': 'Run details',
      'audit.gate': 'Site audits are included during the trial. After the trial, paid access is required to run a new audit. Saved audits remain readable.',
      'audit.denied': 'Paid access is required to run a new site audit after the trial.',
      'audit.billing': 'View plans and billing',
      'audit.empty': 'No audit yet.',
      'audit.pages': '{count} pages crawled',
      'audit.last': 'Last audit {date}',
      'audit.titleDomain': 'Site audit · {domain}',
      'audit.completed': 'Completed',
      'audit.historyFallback': 'Saved audit',
      'audit.showMore': 'Show {count} more',
      'audit.runAudit': 'Run audit',
      'audit.viewLatest': 'View latest',
      'audit.viewProgress': 'View progress',
      'audit.close': 'Close',
      'audit.start': 'Start audit',
      'audit.tab.history': 'History',
      'audit.ready': 'Audit ready. Saved in Results.',
      'audit.openReport': 'Open report',
      'results.title': 'Results',
      'results.recent': 'Recent results',
      'results.viewAll': 'View all →',
      'results.openRow': 'Open',
      'audit.issues': 'Top issues',
      'audit.stop.finished': 'Finished',
      'audit.stop.page_limit': 'Page limit',
      'audit.stop.time_limit': 'Time limit',
      'audit.stop.request_limit': 'Request limit',
      'search.title': 'Search Console',
      'search.connect': 'Connect Search Console',
      'search.hint': 'Pick the property there.',
      'search.reauth': 'Search Console needs a new sign-in.',
      'search.clicks': 'Clicks',
      'search.impressions': 'Impressions',
      'search.ctr': 'CTR',
      'search.position': 'Average position',
      'search.queries': 'Top queries',
      'search.queriesEmpty': 'No queries in this window.',
      'search.indexing': '{count} pages not indexed',
      'search.indexingAction': 'Ask about these pages',
      'search.trend': 'Clicks {current}, previous 28 days {previous}',
      'analytics.title': 'Analytics',
      'analytics.connect': 'Connect Analytics',
      'analytics.refresh': 'Refresh',
      'analytics.refreshing': 'Refreshing...',
      'analytics.sessions': 'Keyword page sessions',
      'analytics.empty': 'No keyword-page sessions in this window.',
      'analytics.rateLimited': 'Refresh was rate limited. Wait a minute and try again.',
      'analytics.reauth': 'Analytics needs a new sign-in.',
      'analytics.trend': 'Latest 28-day total for pages tied to keywords.',
      'session.workspaceRequired': 'Choose a workspace to start a conversation.',
      'session.copied': 'Prompt copied. Create a workspace in DSH so bisibility can prefill prompts, or open a new conversation and paste it.',
      'session.openConversation': 'Open new conversation',
      'session.dismiss': 'Dismiss',
      'session.failed': 'The prompt could not be put in the composer. Please try again.',
      'session.copyFailed': 'The prompt could not be copied. Choose a workspace in DSH and try again.',
      'session.ready': 'The prompt is in the composer. Press Enter to send it.',
      'discover.title': 'Start with a skill',
      'discover.search': 'Search skills',
      'discover.clear': 'Clear search',
      'discover.empty': 'No skill matches.',
      'discover.try': 'Try this workflow',
      'discover.filter': 'Skill categories',
      'provider.filter': 'Data providers',
      'provider.summary': 'Providers: {value}',
      'provider.any': 'All',
      'provider.state.notConnected': 'Not connected',
      'provider.state.reauth': 'Needs reauth',
      'provider.state.disabled': 'Disabled',
      'provider.all': 'All providers',
      'provider.dataforseo': 'DataForSEO',
      'provider.gsc': 'Search Console',
      'provider.serpapi': 'SerpAPI',
      'provider.ga4': 'Google Analytics 4',
      'provider.plausible': 'Plausible',
      'provider.ahrefs': 'Ahrefs',
      'provider.local-sequence': 'Local sequence',
      'provider.note.reauth': '{provider} needs to be reconnected.',
      'provider.note.notConnected': '{provider} is not connected.',
      'provider.note.disabled': '{provider} is connected but turned off.',
      'provider.reconnect': 'Reconnect',
      'provider.open': 'Open providers',
      'discover.more': 'All skills',
      'skill.tab.all': 'All',
      'skill.tab.seo': 'SEO',
      'skill.tab.ai-search': 'AI visibility',
      'skill.tab.site': 'Site health',
      'skill.tab.data': 'Data & reports',
      'skill.tab.social': 'Social',
      'skill.tab.project': 'Project',
      'skill.label.saved': 'Saved results',
      'skill.label.search-console': 'Search Console',
      'skill.label.analysis': 'New analysis',
      'skill.label.estimate': 'Estimate first',
      'skill.label.connect-search': 'Connect Search Console',
      'skill.label.add-keywords': 'Add keywords',
      'skill.label.no-alerts': 'No alerts yet',
      'skill.label.no-audit': 'No saved audit',
      'failure.project': 'Project data could not load.',
      'failure.keywords': 'Keywords could not load.',
      'failure.audit': 'The site audit could not load.',
      'failure.connections': 'Connections could not load.',
      'failure.search': 'Search Console data could not load.',
      'failure.analytics': 'Analytics could not load.',
      'failure.projects': 'Projects could not load.',
      'failure.skills': 'Skills could not load.',
      'failure.recent': 'Recent results could not load.',
      'failure.retry': 'Retry',
      'failure.details': 'Details',
      'badge.free': 'Free',
      'badge.searchConsole': 'Needs Search Console',
      'badge.analytics': 'Needs Analytics',
      'badge.credits': 'Uses credits',
      'category.all': 'All',
      'category.audit': 'Audit',
      'category.searchConsole': 'Search Console',
      'category.keywords': 'Keywords',
      'category.competitors': 'Competitors',
      'category.ai': 'AI visibility',
      'category.local': 'Local',
      'category.reports': 'Reports',
      'category.setup': 'Setup',
      'pack.router': 'Router pack',
      'pack.projectOnboarding': 'Project onboarding pack',
      'pack.instanceDiagnosis': 'Instance diagnosis pack',
      'ask.label': 'What would you like to improve?',
      'ask.send': 'Ask bisibility',
      'ask.placeholder': 'Ask about {domain}…',
      'ask.placeholderNoDomain': 'Ask about this project…',
      'ask.issues': 'Review site issues',
      'ask.audit': 'Preview a first audit',
      'ask.queries': 'Show my search queries',
      'ask.traffic': 'Why did my traffic drop?',
      'ask.compare': 'Compare a competitor',
      'ask.mentions': 'Review mentions',
      'next.create.title': 'Create a project',
      'next.create.body': 'Start with the domain you want to follow.',
      'next.create.action': 'Create project',
      'next.audit.title': 'Run a site audit',
      'next.audit.body': 'Crawl up to 15 pages. Included during the trial; paid access is required after the trial.',
      'next.audit.action': 'Audit up to 15 pages',
      'next.search.title': 'Connect Search Console',
      'next.search.body': 'Pick the property in Bisibility. Then this panel can read queries.',
      'next.search.action': 'Connect Search Console',
      'next.keywords.title': 'Track the first keywords',
      'next.keywords.body': 'Propose the first keywords. This does not run a rank check.',
      'next.keywords.action': 'Track keywords',
      'next.keywords.prompt': 'Read {domain} and propose the first keywords. Do not connect a provider and do not run a rank check.',
      'next.keywords.promptNoDomain': 'Read the selected project and propose the first keywords. Do not connect a provider and do not run a rank check.',
      'next.weekly.title': 'Weekly rank report',
      'next.weekly.body': 'Report saved gains and losses. Competitors are the step after that.',
      'next.weekly.action': 'Open the weekly report',
      'next.weekly.prompt': 'Report saved rank gains and losses for {domain}. Do not run a new check.',
      'next.weekly.promptNoDomain': 'Report saved rank gains and losses for the selected project. Do not run a new check.',
      'next.waiting': 'The next step appears when the project overview loads.',
      'recent.title': 'Recent',
      'recent.empty': 'No saved audits or reports yet.',
      'recent.audit': 'Audit',
      'recent.report': 'Report',
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
      'status.connectedDetail': '智能体可以调用 bisibility 工具。',
      'status.failed': '未连接',
      'status.failedDetail': '上一次尝试没有完成。下面的详细信息来自 harness；请再次点击“连接账户”。',
      'status.mcpFailed': '已连接，但 MCP 客户端未能启动',
      'status.mcpFailedDetail': 'Host 报告了挂载失败；下面的详细信息来自 harness。',
      'connect.title': '使用 bisibility 登录',
      'connect.body': '连接会在浏览器中打开 bisibility。如果登录后显示的是仪表板，说明你已登录：再次点击“连接账户”即可完成。令牌只保存在 harness 凭据存储中，不会写入配置文件或环境变量。',
      'connect.action': '连接账户',
      'connect.working': '正在打开 bisibility…',
      'connected.account': '已登录：{account}',
      'connected.renews': '会话令牌会在你使用 bisibility 时续期。这不是订阅。',
      'header.settings': '设置',
      'header.noProject': '没有项目',
      'header.version': '版本 {version}',
      'header.session': '会话令牌',
      'header.provider': '数据源设置',
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
      loading: '正在加载',
      'error.signIn': '请重新登录后继续。',
      'project.label': '项目',
      'project.empty': '还没有项目。填写要跟踪的域名。',
      'project.domain': '域名',
      'project.create': '创建项目',
      'project.confirm': '在此账户上创建项目 {domain}？',
      'project.cancel': '取消',
      'project.creating': '正在创建项目…',
      'project.invalid': '请输入域名，例如 example.com。',
      'checklist.audit': '站点审计',
      'checklist.auditDone': '已保存审计',
      'checklist.search': 'Search Console',
      'checklist.searchDone': '已连接 Search Console',
      'checklist.analytics': 'Analytics',
      'checklist.analyticsDone': '已连接 Analytics',
      'checklist.keywords': '关键词',
      'checklist.keywordsDone': '已添加关键词',
      'connect.gscOn': '已连接 Search Console',
      'connect.gscOff': '未连接 Search Console',
      'connect.gaOn': '已连接 Analytics',
      'connect.gaOff': '未连接 Analytics',
      'connect.optional': '可选',
      'data.title': '项目数据',
      'data.range': '{start} 至 {end}',
      'data.partial': '部分合计，最多 1,000 行查询。',
      'data.actual': '数据：{start} 至 {end}（太平洋日期）',
      'data.window': '时间窗：{start} 至 {end}（太平洋日期）',
      'data.noDates': '此时间窗未返回数据。',
      'data.provisional': '可能包含暂定数据。',
      'data.final': '已最终确定的数据。',
      'data.fetched': '获取时间：{date}',
      'data.finalized': '已最终确定至：{date}',
      'data.incomplete': '首个未完整日期：{date}',
      'data.unknown': '未知',
      'failure.indexing': '无法加载索引数据。',
      'search.indexingDraft': '{domain} 有 {count} 个页面未被索引。',
      'data.empty': 'Search Console 或 Analytics 有已保存的时间窗后，数字会显示在这里。',
      'data.notIndexed': '未索引，范围是 not_indexed 分组',
      'data.sessionDate': '{date} 为 {count}',
      'audit.title': '站点审计',
      'audit.limit': '最多 15 个页面',
      'audit.prep.domain': '域名',
      'audit.prep.scope': '范围',
      'audit.prep.access': '访问',
      'audit.running': '正在抓取，最多 15 个页面。',
      'audit.again': '再次运行',
      'audit.explain': '交给智能体查看',
      'audit.review': '查看 {domain} 的审计 {id}。',
      'audit.findingLine': '发现：{message}（{code}，{severity}）。',
      'audit.urlsLead': '受影响的网址：',
      'audit.viewFindings': '查看发现',
      'audit.tab.findings': '发现',
      'audit.tab.pages': '页面',
      'audit.tab.details': '运行细节',
      'audit.gate': '试用期间包含站点审计。试用结束后，需要付费访问权限才能运行新的审计。已保存的审计仍可阅读。',
      'audit.denied': '试用结束后，需要付费访问权限才能运行新的站点审计。',
      'audit.billing': '查看套餐和账单',
      'audit.empty': '还没有审计。',
      'audit.pages': '已抓取 {count} 个页面',
      'audit.last': '上次审计 {date}',
      'audit.titleDomain': '站点审计 · {domain}',
      'audit.completed': '已完成',
      'audit.historyFallback': '已保存的审计',
      'audit.showMore': '再显示 {count} 项',
      'audit.runAudit': '运行审计',
      'audit.viewLatest': '查看最新',
      'audit.viewProgress': '查看进度',
      'audit.close': '关闭',
      'audit.start': '开始审计',
      'audit.tab.history': '历史',
      'audit.ready': '审计已完成。已保存在结果中。',
      'audit.openReport': '打开报告',
      'results.title': '结果',
      'results.recent': '最近结果',
      'results.viewAll': '查看全部 →',
      'results.openRow': '打开',
      'audit.issues': '主要问题',
      'audit.stop.finished': '已完成',
      'audit.stop.page_limit': '达到页面上限',
      'audit.stop.time_limit': '达到时间上限',
      'audit.stop.request_limit': '达到请求上限',
      'search.title': 'Search Console',
      'search.connect': '连接 Search Console',
      'search.hint': '在那里选择资源。',
      'search.reauth': 'Search Console 需要重新登录。',
      'search.clicks': '点击',
      'search.impressions': '展示',
      'search.ctr': '点击率',
      'search.position': '平均排名',
      'search.queries': '热门查询',
      'search.queriesEmpty': '这个时间段没有查询。',
      'search.indexing': '{count} 个页面未被索引',
      'search.indexingAction': '询问这些页面',
      'search.trend': '点击 {current}，前一个 28 天为 {previous}',
      'analytics.title': 'Analytics',
      'analytics.connect': '连接 Analytics',
      'analytics.refresh': '刷新',
      'analytics.refreshing': '正在刷新…',
      'analytics.sessions': '关键词页面会话',
      'analytics.empty': '这个时间段没有关键词页面的会话。',
      'analytics.rateLimited': '刷新被限流。请稍等一分钟再试。',
      'analytics.reauth': 'Analytics 需要重新登录。',
      'analytics.trend': '与关键词相关页面的最近 28 天合计。',
      'session.workspaceRequired': '请选择工作区以开始对话。',
      'session.copied': '提示已复制。请在 DSH 中创建工作区，以便 bisibility 自动填入提示；也可以打开新对话并粘贴提示。',
      'session.openConversation': '打开新对话',
      'session.dismiss': '关闭提示',
      'session.failed': '无法将提示填入输入框。请重试。',
      'session.copyFailed': '无法复制提示。请在 DSH 中选择工作区，然后重试。',
      'session.ready': '提示已在输入框中。按 Enter 发送。',
      'discover.title': '从一个技能开始',
      'discover.search': '搜索技能',
      'discover.clear': '清除搜索',
      'discover.empty': '没有匹配的技能。',
      'discover.try': '试用这个工作流',
      'discover.filter': '技能分类',
      'provider.filter': '数据提供商',
      'provider.summary': '提供方：{value}',
      'provider.any': '全部',
      'provider.state.notConnected': '未连接',
      'provider.state.reauth': '需重新登录',
      'provider.state.disabled': '已关闭',
      'provider.all': '全部提供方',
      'provider.dataforseo': 'DataForSEO',
      'provider.gsc': 'Search Console',
      'provider.serpapi': 'SerpAPI',
      'provider.ga4': 'Google Analytics 4',
      'provider.plausible': 'Plausible',
      'provider.ahrefs': 'Ahrefs',
      'provider.local-sequence': 'Local sequence',
      'provider.note.reauth': '{provider} 需要重新连接。',
      'provider.note.notConnected': '{provider} 尚未连接。',
      'provider.note.disabled': '{provider} 已连接，但已关闭。',
      'provider.reconnect': '重新连接',
      'provider.open': '打开提供商页面',
      'discover.more': '全部技能',
      'skill.tab.all': '全部',
      'skill.tab.seo': 'SEO',
      'skill.tab.ai-search': 'AI 可见性',
      'skill.tab.site': '网站健康',
      'skill.tab.data': '数据与报告',
      'skill.tab.social': '社交',
      'skill.tab.project': '项目',
      'skill.label.saved': '已保存的结果',
      'skill.label.search-console': 'Search Console',
      'skill.label.analysis': '新的分析',
      'skill.label.estimate': '先估算',
      'skill.label.connect-search': '连接 Search Console',
      'skill.label.add-keywords': '添加关键词',
      'skill.label.no-alerts': '还没有警报',
      'skill.label.no-audit': '没有已保存的审计',
      'failure.project': '项目数据无法加载。',
      'failure.keywords': '关键词无法加载。',
      'failure.audit': '站点审计无法加载。',
      'failure.connections': '连接无法加载。',
      'failure.search': 'Search Console 数据无法加载。',
      'failure.analytics': 'Analytics 数据无法加载。',
      'failure.projects': '项目无法加载。',
      'failure.skills': '技能无法加载。',
      'failure.recent': '最近结果无法加载。',
      'failure.retry': '重试',
      'failure.details': '详细信息',
      'badge.free': '免费',
      'badge.searchConsole': '需要 Search Console',
      'badge.analytics': '需要 Analytics',
      'badge.credits': '使用额度',
      'category.all': '全部',
      'category.audit': '审计',
      'category.searchConsole': 'Search Console',
      'category.keywords': '关键词',
      'category.competitors': '竞争对手',
      'category.ai': 'AI 可见度',
      'category.local': '本地',
      'category.reports': '报告',
      'category.setup': '设置',
      'pack.router': '路由包',
      'pack.projectOnboarding': '项目接入包',
      'pack.instanceDiagnosis': '实例诊断包',
      'ask.label': '你想改进什么？',
      'ask.send': '询问 bisibility',
      'ask.placeholder': '问问 {domain}…',
      'ask.placeholderNoDomain': '问问这个项目…',
      'ask.issues': '查看网站问题',
      'ask.audit': '预览第一次审计',
      'ask.queries': '看看我的搜索查询',
      'ask.traffic': '流量为什么下降了？',
      'ask.compare': '对比一个竞争对手',
      'ask.mentions': '查看提及',
      'next.create.title': '创建项目',
      'next.create.body': '从你要跟踪的域名开始。',
      'next.create.action': '创建项目',
      'next.audit.title': '运行站点审计',
      'next.audit.body': '最多抓取 15 个页面。试用期间包含此功能；试用结束后需要付费访问权限。',
      'next.audit.action': '最多审计 15 个页面',
      'next.search.title': '连接 Search Console',
      'next.search.body': '在 Bisibility 里选择资源。然后这个面板才能读取查询。',
      'next.search.action': '连接 Search Console',
      'next.keywords.title': '跟踪第一批关键词',
      'next.keywords.body': '提议第一批关键词。这不会运行排名检查。',
      'next.keywords.action': '跟踪关键词',
      'next.keywords.prompt': '读取 {domain}，提议第一批关键词。不要连接数据源，也不要运行排名检查。',
      'next.keywords.promptNoDomain': '读取当前项目，提议第一批关键词。不要连接数据源，也不要运行排名检查。',
      'next.weekly.title': '每周排名报告',
      'next.weekly.body': '报告已保存的上升和下降。下一步是竞争对手。',
      'next.weekly.action': '打开每周报告',
      'next.weekly.prompt': '报告 {domain} 已保存的排名上升和下降。不要运行新的检查。',
      'next.weekly.promptNoDomain': '报告当前项目已保存的排名上升和下降。不要运行新的检查。',
      'next.waiting': '项目概览加载后会显示下一步。',
      'recent.title': '最近',
      'recent.empty': '还没有保存的审计或报告。',
      'recent.audit': '审计',
      'recent.report': '报告',
    };

    /** One local group identity. Social stays reserved until it has registered skills. */
    const GROUP_IDENTITY = {
      seo: { icon: 'MagnifyingGlass', base: '#3563E9', dark: '#18388B', light: '#8CAEFF' },
      'ai-search': { icon: 'Eye', base: '#D9368B', dark: '#7D174F', light: '#FF9BD1' },
      'site-health': { icon: 'Scan', base: '#65A82D', dark: '#2E5914', light: '#B8E57C' },
      'data-reports': { icon: 'ChartLineUp', base: '#E89B19', dark: '#87500A', light: '#FFD878' },
      social: { icon: 'UsersThree', base: '#E85548', dark: '#8B2D28', light: '#FFB19A' },
      project: { icon: 'GearSix', base: '#6B7280', dark: '#343A46', light: '#B8C0CD' },
    };

    /** Palette variables stay on identity tiles; host surfaces and semantic colors stay host-owned. */
    function groupIdentityCss() {
      return Object.entries(GROUP_IDENTITY)
        .map(([id, group]) => `.bis-skillTile[data-surface=${id}]{--bis-group-dark:${group.dark};--bis-group-base:${group.base};--bis-group-light:${group.light};--bis-group-glyph:#fff}`)
        .join('\n');
    }

    /** Panel styles. Only identity tiles use group gradients. Everything else uses theme tokens. */
    const styles = `
.bis-page{--bis-outline-subtle:var(--dsw-alias-border-l2);--bis-outline-strong:var(--dsw-alias-border-l1);box-sizing:border-box;width:100%;min-width:0;height:100%;min-height:0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:14px;line-height:1.6;display:flex;overflow:hidden;container-type:inline-size}
@media (prefers-color-scheme:light){.bis-page{--bis-outline-subtle:var(--dsw-alias-border-l2);--bis-outline-strong:var(--dsw-alias-border-l1)}}
@media (prefers-color-scheme:dark){.bis-page{--bis-outline-subtle:color-mix(in srgb,var(--dsw-alias-border-l2) 65%,transparent);--bis-outline-strong:var(--dsw-alias-border-l1)}}
[data-theme=light] .bis-page,[data-color-mode=light] .bis-page{--bis-outline-subtle:var(--dsw-alias-border-l2);--bis-outline-strong:var(--dsw-alias-border-l1)}
[data-theme=dark] .bis-page,[data-color-mode=dark] .bis-page{--bis-outline-subtle:color-mix(in srgb,var(--dsw-alias-border-l2) 65%,transparent);--bis-outline-strong:var(--dsw-alias-border-l1)}
.bis-scroll{scrollbar-gutter:stable both-edges;scroll-padding:4px;flex:1;min-width:0;min-height:0;overflow-x:clip;overflow-y:auto}
.bis-content{max-width:760px;margin:0 auto;padding:0 clamp(16px,4cqw,48px) 56px}
/* Optical row bleed plus 4px of outward focus clearance preserves the content column. */
.bis-screen{--bis-section-space:12px;padding-inline:16px;margin-inline:-16px;min-width:0;display:flex;flex-direction:column;gap:var(--bis-section-space);margin-top:28px}
.bis-head{box-sizing:border-box;display:flex;align-items:center;gap:10px;min-height:44px;height:44px;padding:0;flex:none}
[data-platform=darwin] .bis-head{padding-top:var(--dsh-frame-top-clearance,0px);height:calc(44px + var(--dsh-frame-top-clearance,0px))}
.bis-mark{width:28px;height:28px;color:var(--dsw-alias-label-primary);border-radius:8px;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--bis-outline-subtle);flex:none;justify-content:center;align-items:center;display:inline-flex}
.bis-titles{flex:1;flex-direction:row;align-items:center;gap:8px;min-width:0;height:28px;display:flex}
.bis-title{flex:none;margin:0;font-size:14px;font-weight:500;line-height:20px;height:20px}
.bis-projectSlot{box-sizing:border-box;flex:none;display:inline-flex;align-items:center;width:168px;min-width:168px;max-width:168px;height:28px;min-height:28px;max-height:28px;overflow:visible;background:transparent;border:0}
.bis-projectName{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%;white-space:nowrap;font-size:13px;line-height:20px;height:28px}
.bis-projectLabel{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bis-projectName svg{flex:none}
.bis-projectSwitch{display:inline-flex;align-items:center;min-width:0;max-width:100%;height:28px;background:transparent;border:0}
.bis-headEnd{flex:none;align-items:center;gap:8px;height:28px;display:flex}
.bis-connected{color:var(--dsw-alias-label-secondary);align-items:center;gap:6px;width:162px;min-width:162px;height:28px;font-size:12px;line-height:18px;display:inline-flex}
.bis-statusLabel{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:flex-end;gap:6px;width:162px;min-width:162px;max-width:162px;height:28px;font-size:12px;line-height:18px;white-space:nowrap}
.bis-statusDot{display:inline-flex;align-items:center;flex:none;height:28px}
.bis-statusCopy{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@container (max-width:560px){
.bis-head{gap:8px}
.bis-title{position:absolute;clip:rect(0 0 0 0);width:1px;height:1px;overflow:hidden;white-space:nowrap}
.bis-titles{gap:0}
.bis-projectSlot{flex:1 1 auto;width:auto;min-width:0;max-width:100%}
.bis-projectSwitch,.bis-projectSwitch>.bis-settingsMenu{width:100%}
.bis-projectName{width:100%;justify-content:space-between}
.bis-connected,.bis-statusLabel{width:8px;min-width:8px;max-width:8px}
.bis-statusCopy{position:absolute;clip:rect(0 0 0 0);width:1px;height:1px;overflow:hidden;white-space:nowrap}
.bis-askRow{flex-direction:column}
.bis-askField,.bis-askSubmit{width:100%}
}
.bis-broken{box-sizing:border-box;border:.5px solid var(--dsw-alias-state-error-primary);border-radius:14px;background:var(--dsw-alias-bg-layer-1);padding:16px 18px}
.bis-broken[data-tone=warn]{border-color:var(--dsw-alias-state-warn-primary)}
.bis-settingsAnchor{position:relative;display:inline-flex;max-width:100%}
.bis-settingsMenu{position:relative;display:inline-flex;max-width:100%}
.bis-menuList{box-sizing:border-box;padding:0;width:max-content;max-width:min(320px,calc(100vw - 32px));overflow:hidden}
.bis-menuList>[role=presentation]{display:flex;flex-direction:column;padding:6px;gap:4px;scroll-padding:6px;min-width:0;overflow:auto}
.bis-menuItemTip{min-width:0;width:100%}
.bis-menuList [role=menuitem]{box-sizing:border-box;width:100%;max-width:100%;height:auto;min-height:36px;padding:8px 12px;border-radius:var(--dsw-radius-sm,8px);white-space:nowrap}
.bis-menuList [role=menuitem]:not(:hover):not(:focus-visible){background:transparent}
.bis-menuList [role=menuitem][aria-current=page]{font-weight:600}
.bis-menuItemContent{display:flex;align-items:center;gap:12px;width:100%;min-width:0}
.bis-menuLabel{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bis-menuCheck{display:inline-flex;justify-content:flex-end;flex:none;min-width:16px}
.bis-menuList .bis-menuNote{padding:4px 12px}
.bis-menuNote{color:var(--dsw-alias-label-secondary);max-width:100%;white-space:normal;overflow-wrap:anywhere;font-size:12px;line-height:18px}
.bis-card{box-sizing:border-box;border:.5px solid var(--bis-outline-subtle);border-radius:14px;background:var(--dsw-alias-bg-layer-1);padding:14px 16px}
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
.bis-failure{box-sizing:border-box;display:flex;flex-direction:column;gap:8px;margin:10px 0 0;padding:12px 14px;border:0;border-inline-start:2px solid var(--dsw-alias-state-error-primary);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px}
.bis-failureRow{display:flex;align-items:center;gap:8px;min-width:0}
.bis-failureText{margin:0;flex:1;min-width:0;font:inherit;font-size:13px;line-height:20px}
.bis-failureDetails{color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px}
.bis-failureDetails summary{cursor:pointer;border-radius:var(--dsw-radius-xs,4px)}
.bis-failureTech{margin:6px 0 0;font:inherit}
.bis-actions{flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px;display:flex}
.bis-button{box-sizing:border-box;border:.5px solid var(--bis-outline-subtle);border-radius:14px;height:28px;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:0 0;flex:none;align-items:center;padding:0 12px;font-size:12px;line-height:20px;display:inline-flex;text-decoration:none}
.bis-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.bis-button:disabled{cursor:default;opacity:.55}
.bis-primary{border-color:transparent;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-label-primary-inverted,var(--dsw-alias-bg-base));height:30px;padding:0 14px;font-size:13px}
.bis-primary:hover:not(:disabled){background:var(--dsw-alias-label-primary);color:var(--dsw-alias-label-primary-inverted,var(--dsw-alias-bg-base));opacity:.9}
.bis-section{margin-top:28px}
.bis-h2{color:var(--dsw-alias-label-tertiary);letter-spacing:.04em;text-transform:uppercase;margin:0 0 10px;font-size:11px;font-weight:500;line-height:16px}
.bis-copy{color:var(--dsw-alias-label-secondary);text-wrap:pretty;margin:0;font-size:13px;line-height:21px}
.bis-list{color:var(--dsw-alias-label-primary);flex-direction:column;gap:6px;margin:0;padding:0;font-size:13px;line-height:21px;list-style:none;display:flex}
.bis-list li{padding-left:16px;position:relative}
.bis-list li:before{content:"";background:var(--dsw-alias-label-tertiary);border-radius:1px;width:4px;height:4px;position:absolute;top:8.5px;left:2px}
.bis-notice{box-sizing:border-box;border:.5px solid var(--dsw-alias-state-warn-primary);border-radius:14px;background:var(--dsw-alias-bg-layer-1);margin-top:10px;padding:12px 16px}
.bis-footer{display:flex;flex-wrap:wrap;align-items:center;gap:6px 18px;border-top:.5px solid var(--bis-outline-subtle);color:var(--dsw-alias-label-tertiary);margin-top:32px;padding-top:14px;font-size:12px;line-height:18px}
.bis-workspaceNotice{border:1px solid var(--bis-outline-subtle);border-radius:var(--dsw-radius-md,12px);min-width:0}
.bis-workspaceNotice p{margin:0;overflow-wrap:anywhere}
.bis-workspaceNoticeActions{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px}
.bis-link{border-radius:var(--dsw-radius-xs,4px);color:var(--dsw-alias-brand-primary);font:inherit;cursor:pointer;background:0 0;border:0;padding:0;font-size:12px;text-decoration:none}
.bis-link:hover{text-decoration:underline}
.bis-visuallyHidden{clip:rect(0 0 0 0);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}
.bis-growth{padding-inline:16px;margin-inline:-16px;min-width:0;flex-direction:column;gap:12px;margin-top:0;display:flex}
.bis-checklist{flex-wrap:wrap;align-items:center;gap:8px 14px;min-height:28px;margin:0;padding:0;list-style:none;display:flex}
.bis-connections{min-height:32px;margin:0;padding:0;color:var(--dsw-alias-label-secondary);flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 12px;font-size:12px;line-height:18px;display:flex}
.bis-connections p{margin:0;padding:0}
.bis-projectData{margin:0;padding:0}
.bis-projectDataToggle{box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;height:auto;margin:0;margin-inline-start:-8px;padding:6px 8px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px}
.bis-projectDataToggle:hover,.bis-projectDataToggle:focus,.bis-projectDataToggle:focus-visible{margin:0;margin-inline-start:-8px;padding:6px 8px}
.bis-projectDataLabel{margin:0;padding:0}
.bis-projectDataChevron{display:inline-flex;flex:none;width:14px;height:14px;color:var(--dsw-alias-label-tertiary);transform:rotate(-90deg)}
.bis-projectDataChevron[data-open=true]{transform:rotate(0deg)}
.bis-projectDataPanel{margin:8px 0 0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.bis-check{color:var(--dsw-alias-label-secondary);align-items:center;gap:6px;min-width:0;min-height:24px;font-size:12px;line-height:18px;display:flex}
.bis-check[data-done=true]{color:var(--dsw-alias-label-primary)}
.bis-check .bis-dot{margin-top:0}
.bis-field{flex-direction:column;gap:6px;min-width:0;display:flex}
.bis-label{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.bis-input,.bis-select{box-sizing:border-box;width:100%;min-width:0;height:30px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--bis-outline-strong);border-radius:14px;margin:0;padding:0 10px;font:inherit;font-size:13px;line-height:20px}
.bis-metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px;display:grid}
.bis-metricValue{min-height:24px;margin:0;font-size:18px;line-height:24px;font-variant-numeric:tabular-nums}
.bis-metricLabel{color:var(--dsw-alias-label-tertiary);margin:0;font-size:11px;line-height:16px}
.bis-spark{color:var(--dsw-alias-label-secondary);width:100%;height:36px;margin-top:8px;display:block}
.bis-queries{flex-direction:column;gap:4px;min-width:0;margin:8px 0 0;padding:0;list-style:none;display:flex}
.bis-query{justify-content:space-between;gap:8px;min-width:0;font-size:12px;line-height:18px;display:flex}
.bis-queryName{white-space:nowrap;text-overflow:ellipsis;min-width:0;overflow:hidden}
.bis-queryFinding{white-space:normal;overflow-wrap:anywhere;min-width:0}
.bis-cardTitle{margin:0;font-size:13px;font-weight:500;line-height:20px}
.bis-skeleton{height:12px;background:var(--dsw-alias-bg-layer-2);border-radius:6px}
.bis-skeleton+.bis-skeleton{margin-top:8px}
.bis-skeletonShort{width:55%}
.bis-skeletonMetric{display:block;width:min(96px,100%);height:36px}
.bis-dataSource .bis-metricValue{height:48px;min-height:48px;overflow:auto}
.bis-dataSource .bis-metricLabel{height:48px;min-height:48px;overflow:auto}
.bis-dataSource{min-width:0;display:flex;flex-direction:column}
.bis-dataSource[data-source=search]{grid-column:1/-1}
.bis-dataSource .bis-metrics{flex:none;grid-template-columns:minmax(0,1fr);margin-top:0}
.bis-dataSource[data-source=search] .bis-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
.bis-sourceNote,.bis-indexingActionSlot{box-sizing:border-box;height:64px;overflow:auto;padding:8px 4px 4px}
.bis-dataSource[data-source=search] .bis-sourceNote{height:160px;overflow-wrap:anywhere}
.bis-querySlot{box-sizing:border-box;height:160px;overflow:auto;padding:4px;min-width:0}
.bis-querySlot .bis-metricLabel{height:auto;min-height:0;overflow:visible}
.bis-querySlot .bis-query{overflow-wrap:anywhere}
.bis-querySlot .bis-query span:first-child{min-width:0}
.bis-querySlot .bis-query span:last-child{flex:none}
.bis-recentSlot{box-sizing:border-box;height:auto;overflow:auto;scroll-padding:4px;padding:4px 16px;margin:-4px -16px}
.bis-recentSlot .bis-recentList{margin:0;padding:0;list-style:none}
.bis-recentPending{display:flex;flex-direction:column;gap:4px}
.bis-recentPending .bis-skeleton{height:54px;margin:0}
.bis-metricsSkeleton .bis-skeleton+.bis-skeleton{margin-top:0}
.bis-skeletonField{height:30px}
.bis-skeletonCard{min-height:148px}
.bis-modalRoot.bis-modalRoot{box-sizing:border-box;position:fixed;display:flex;align-items:center;justify-content:center;padding:16px;container-type:inline-size;isolation:isolate}
.bis-modalRoot>[aria-hidden=true]{inset:0}
.bis-modalRoot>[aria-hidden=true]::after{background:var(--dsw-alias-bg-mask-1);animation:none;opacity:1}
.bis-modal.bis-modal{animation:none;opacity:1;box-sizing:border-box;display:flex;flex-direction:column;gap:0;width:min(880px,100%);max-width:880px;height:auto;max-height:min(80dvh,var(--bis-modal-max-height));margin-inline:auto;align-self:center;padding:0;border-radius:16px;overflow:hidden}
.bis-modalInner{min-width:0;margin-inline:-12px;padding-inline:12px}
.bis-modalContent,.bis-modal>div:first-child{position:relative;display:flex;flex-direction:column;min-width:0;min-height:0;flex:1 1 auto;overflow:hidden}
.bis-modalHeader,.bis-modal>div:first-child>div:first-child{display:block;flex:none;padding:16px 24px 0}
.bis-modalTitle,.bis-modal [class*="_title_"]{margin:0;min-width:0;padding-inline-end:44px;overflow-wrap:anywhere;font-size:16px;line-height:24px;font-weight:500}
.bis-modalHeader>button,.bis-modal [class*="_close_"]{position:absolute;top:12px;right:24px;box-sizing:border-box;flex:none;width:32px;height:32px;min-width:32px;min-height:32px;padding:8px;border-radius:var(--dsw-radius-sm,8px)}
.bis-modalMeta,.bis-modal>div:first-child>p{margin:8px 0 0;padding:0 24px;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.bis-modalBody,.bis-modal>div:first-child>div:last-child{box-sizing:border-box;margin-top:20px;padding:4px 24px 16px;scroll-padding:4px;overflow:auto;min-height:0;flex:1 1 auto}
.bis-modalFooter,.bis-modal>[class*="footer"]{box-sizing:border-box;display:flex;align-items:center;flex:none;min-width:0;padding:16px 24px;border-top:.5px solid var(--bis-outline-subtle)}
.bis-auditPane{padding-inline:12px;margin-inline:-12px;display:flex;flex-direction:column;align-items:stretch;gap:24px;min-width:0;max-width:calc(100% + 24px)}
.bis-auditPane .bis-queries{margin:0;gap:8px}
.bis-auditActions{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-start;gap:12px;width:100%;margin:0}
.bis-auditGate{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:18px;min-width:0;max-width:100%;white-space:normal;overflow-wrap:anywhere;flex:1 1 240px}
.bis-failure .bis-auditGate{flex:0 1 auto}
.bis-auditTabs{min-height:28px;margin:0;max-width:100%;min-width:0}
.bis-auditTabs .bis-skeletonField{height:28px}
.bis-findings{display:flex;flex-direction:column;gap:12px;width:100%;margin:0;padding:0;list-style:none}
.bis-finding{display:flex;flex-direction:column;align-items:flex-start;gap:12px;min-width:0;max-width:100%}
.bis-findingHead{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0}
.bis-findingTitle{color:var(--dsw-alias-label-primary);max-width:100%;overflow-wrap:anywhere;font-size:13px;line-height:20px}
.bis-findingCount{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.bis-findingUrls{display:flex;flex-direction:column;gap:8px;width:100%;min-width:0;margin:0;padding:0;list-style:none}
@container (max-width:640px){
.bis-modalHeader,.bis-modal>div:first-child>div:first-child{padding:16px 16px 0}
.bis-modalMeta,.bis-modal>div:first-child>p{padding:0 16px}
.bis-modalBody,.bis-modal>div:first-child>div:last-child{padding:4px 16px 16px}
.bis-modalHeader>button,.bis-modal [class*="_close_"]{right:16px}
.bis-modalFooter,.bis-modal>[class*="footer"]{padding:16px}
}
.bis-findingUrl{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-link);text-decoration:none;font-size:12px;line-height:18px;border-radius:var(--dsw-radius-xs,4px)}
.bis-findingUrl:hover,.bis-findingUrl:focus-visible{text-decoration:underline}
.bis-catalog{padding-inline:4px;margin-inline:-4px;min-width:0;min-height:220px;display:flex;flex-direction:column;gap:12px}
.bis-catalogHead{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}
.bis-catalogHead .bis-h2{margin:0}
.bis-catalogTitle{flex:1 1 auto;min-width:0}
.bis-catalogSearch{flex:0 0 220px;width:220px;min-width:0;display:block;border-radius:var(--dsw-radius-md,12px)}
@container (max-width:480px){.bis-catalogHead{flex-direction:column;align-items:stretch;gap:8px}.bis-catalogSearch{flex:none;width:100%}}
.bis-skeletonTabs{height:28px;width:60%}
.bis-catalogFilters{padding-inline:4px;margin-inline:-4px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;min-width:0}
.bis-providerTrigger{display:inline-flex;align-items:center;gap:6px;box-sizing:border-box;height:28px;min-height:28px;max-width:100%;padding:0 10px;border:1px solid var(--bis-outline-subtle);border-radius:var(--dsw-radius-sm,8px);font-size:12px;line-height:18px;white-space:nowrap}
.bis-providerTriggerText{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bis-providerTrigger svg{flex:none}
.bis-providerOptions{display:flex;flex-direction:column;gap:4px;min-width:0}
.bis-providerCheckbox{display:flex;align-items:center;gap:12px;box-sizing:border-box;width:100%;min-width:0;min-height:36px;padding:8px 12px;border-radius:var(--dsw-radius-sm,8px);cursor:pointer}
.bis-providerCheckbox:hover{background:var(--dsw-alias-interactive-bg-hover)}
.bis-providerCheckbox:has(input:focus-visible){outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:2px}
.bis-menuList.bis-menuList .bis-providerCheckbox input:focus-visible{outline:none;box-shadow:none}
.bis-providerOptionContent{display:flex;align-items:center;gap:6px;min-width:0;width:100%}
.bis-providerOptionName{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bis-providerOptionContent .bis-dot{margin-top:0}
.bis-providerOptionStatus{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;white-space:nowrap}
.bis-providerNote{margin:0}
@container (max-width:480px){.bis-projectDataPanel{grid-template-columns:minmax(0,1fr)}}
.bis-skillGrid{display:grid;align-items:stretch;gap:14px;grid-template-columns:minmax(0,1fr);margin-top:4px}
@container (min-width:560px){.bis-skillGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@container (min-width:860px){.bis-skillGrid{grid-template-columns:repeat(3,minmax(0,1fr))}}
.bis-skillCard{box-sizing:border-box;width:100%;height:100%;min-width:0;border:.5px solid var(--bis-outline-subtle);border-radius:14px;background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;text-align:left;flex-direction:column;align-items:flex-start;gap:8px;padding:18px;display:flex}
.bis-skillCard:hover{background:var(--dsw-alias-interactive-bg-hover)}
.bis-skillTop{width:100%;justify-content:space-between;align-items:flex-start;gap:8px;display:flex}
.bis-skillTile{width:48px;height:48px;border-radius:14px;color:var(--bis-group-glyph,var(--dsw-alias-label-primary));flex:none;justify-content:center;align-items:center;display:inline-flex;position:relative;overflow:hidden;background:linear-gradient(135deg,var(--bis-group-dark,var(--dsw-alias-bg-layer-2)) 0%,var(--bis-group-base,var(--dsw-alias-bg-layer-2)) 68%,var(--bis-group-light,var(--dsw-alias-bg-layer-2)) 100%)}
.bis-skillGlyph{display:inline-flex;color:inherit}
${groupIdentityCss()}
.bis-skillLabels{flex-wrap:wrap;justify-content:flex-end;gap:4px;min-width:0;display:flex}
.bis-skillTitle{font-size:14px;font-weight:560;line-height:20px}
.bis-skillResult{flex:1 1 auto;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:18px}
.bis-skillAction{margin-top:auto;align-self:flex-start}
.bis-skillActions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:auto}
.bis-prepRow{align-items:flex-start;gap:16px}
.bis-prepRow>.bis-queryName{flex-shrink:0}
.bis-prepValue{min-width:0;text-align:right;overflow-wrap:anywhere}
.bis-tabs{box-sizing:border-box;display:inline-flex;flex-wrap:nowrap;align-items:center;align-self:flex-start;width:fit-content;max-width:calc(100% + 8px);min-width:0;overflow-x:auto;overflow-y:hidden;scroll-padding:6px;gap:2px;padding:6px;margin:-4px;border:.5px solid var(--bis-outline-subtle);border-radius:999px;background:transparent}
.bis-tabs button{position:relative;box-sizing:border-box;white-space:nowrap;flex:none;width:auto;min-height:24px;height:28px;margin:0;padding:0 12px;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}
.bis-tabs button[aria-selected=true]{color:var(--dsw-alias-label-primary)}
.bis-tabLabel{position:relative;z-index:1}
.bis-tabIndicator{position:absolute;inset:0;z-index:0;border-radius:inherit;background:var(--dsw-alias-bg-layer-2);box-shadow:inset 0 0 0 .5px var(--bis-outline-subtle);pointer-events:none}
.bis-auditTabList{border:0;border-radius:0;background:transparent;padding:4px 12px;margin:-4px -12px;max-width:calc(100% + 24px);gap:16px;scroll-padding:4px 12px;box-shadow:none}
.bis-auditTabList button{display:inline-flex;align-items:center;height:auto;min-height:28px;padding:4px 8px;margin-inline:-8px;border-radius:var(--dsw-radius-sm,8px)}
.bis-auditTabList .bis-tabIndicator{display:none;background:transparent;box-shadow:none}
.bis-auditTabList .bis-tabLabel{display:inline-block}
.bis-auditTabList .bis-tabLabel::after{content:"";position:absolute;inset-inline:0;bottom:-3px;height:2px;background:var(--dsw-alias-label-tertiary);opacity:0;pointer-events:none}
.bis-auditTabList button:is(:hover,:focus-visible) .bis-tabLabel::after{opacity:1}
.bis-auditTabList button[aria-selected=true] .bis-tabLabel::after{opacity:1;background:var(--dsw-alias-brand-primary)}
.bis-searchRow{display:flex;gap:6px;min-width:0;align-items:center}
.bis-searchRow .bis-input{flex:1 1 auto;min-width:0}
.bis-askRow{--bis-ask-control:var(--dsw-control-height-md,36px);--bis-ask-radius:var(--dsw-radius-md,14px);display:flex;align-items:stretch;gap:8px;min-width:0}
.bis-askField{flex:1 1 auto;min-width:0;display:flex;align-items:center;box-sizing:border-box;height:var(--bis-ask-control);min-height:var(--bis-ask-control);max-height:var(--bis-ask-control);border:1px solid var(--bis-outline-strong);border-radius:var(--bis-ask-radius);background:transparent;overflow:hidden}
.bis-askField .bis-input,.bis-askField input{box-sizing:border-box;width:100%;height:100%;min-height:0;max-height:100%;margin:0;padding:0;border:0;border-radius:0;background:transparent;background-color:transparent;box-shadow:none;outline:none}
.bis-askField .bis-input>input{padding:0 12px;line-height:20px}
.bis-askField input:focus,.bis-askField input:focus-visible{outline:none;box-shadow:none}
.bis-askField :focus,.bis-askField :focus-visible,.bis-askField :focus-within{outline:none;box-shadow:none}
.bis-catalogSearch input:focus,.bis-catalogSearch input:focus-visible,.bis-catalogSearch :focus-within{outline:none;box-shadow:none}
.bis-iconButton{width:28px;height:28px;padding:6px;flex:none;justify-content:center}
.bis-filters{display:flex;flex-wrap:wrap;gap:6px;min-width:0}
.bis-suggests{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-height:28px;margin:0;overflow:visible}
.bis-suggest{box-sizing:border-box;display:inline-flex;align-items:center;height:28px;min-height:28px;max-height:28px;margin:0;padding:0 12px;border:1px solid var(--bis-outline-subtle);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;white-space:nowrap}
.bis-suggestSkeleton{flex:none;padding:0;border:0;background:var(--dsw-alias-bg-layer-2);background-image:linear-gradient(90deg,transparent,var(--dsw-alias-bg-layer-1),transparent);background-size:200% 100%;background-repeat:no-repeat;color:transparent;overflow:hidden;pointer-events:none;animation:bis-shimmer 1.4s ease-in-out infinite}
.bis-suggests>.bis-suggestSkeleton:nth-child(1){width:156px}
.bis-suggests>.bis-suggestSkeleton:nth-child(2){width:148px}
.bis-suggests>.bis-suggestSkeleton:nth-child(3){width:132px}
@keyframes bis-shimmer{0%{background-position:120% 0}100%{background-position:-20% 0}}
.bis-pill{box-sizing:border-box;border:.5px solid var(--bis-outline-subtle);border-radius:999px;min-height:28px;height:auto;max-width:100%;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:transparent;padding:4px 10px;font-size:12px;line-height:18px}
.bis-pill:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.bis-pill[aria-pressed=true]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border-color:var(--bis-outline-strong)}
.bis-pill:disabled{cursor:default;opacity:.55}
.bis-catalogList{display:flex;flex-direction:column;gap:8px;min-width:0}
.bis-workflow{min-width:0;overflow-wrap:anywhere}
.bis-badge{display:inline-block;max-width:100%;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary);border:.5px solid var(--bis-outline-subtle);border-radius:999px;padding:2px 8px;font-size:11px;line-height:16px}
.bis-catalog .bis-actions .bis-button{max-width:100%;height:auto;min-height:28px;white-space:normal}
.bis-ask{min-width:0;display:flex;flex-direction:column;gap:10px}
.bis-askHeading{font-size:20px;font-weight:560;letter-spacing:-0.011em;line-height:28px;margin:4px 0 0}
.bis-askSubmit{flex:none;align-self:stretch;box-sizing:border-box;height:var(--bis-ask-control);min-height:var(--bis-ask-control);max-height:var(--bis-ask-control);border-radius:var(--bis-ask-radius)}
.bis-featured{min-width:0;min-height:96px}
.bis-featured .bis-button,.bis-recent .bis-button{max-width:100%;height:auto;min-height:28px;white-space:normal}
.bis-recent{padding-inline:16px;margin-inline:-16px;min-width:0;min-height:0;margin-top:var(--bis-section-space);margin-bottom:var(--bis-section-space)}
.bis-recentHead{padding-inline:12px;margin-inline:-12px;display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0;margin-block:0 10px}
.bis-recentHead .bis-h2{margin:0}
.bis-recentAll{flex:none;padding-inline:12px;margin-inline-end:-12px;font-size:12px;line-height:18px}
.bis-recentItem{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0;padding:8px 0;border:0;border-bottom:.5px solid var(--bis-outline-subtle);border-radius:0;background:transparent;box-shadow:none}
.bis-recentCompact{box-sizing:border-box;padding:0 12px;margin-inline:-12px;border:0}
.bis-recentOpen{box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:12px;width:calc(100% + 24px);min-width:0;height:auto;min-height:54px;margin:0;margin-inline:-12px;padding:8px 12px;border:0;border-radius:var(--dsw-radius-md,12px);background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.bis-recentOpen:hover{background:var(--dsw-alias-interactive-bg-hover)}
.bis-recentOpen:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}
.bis-recentText{display:flex;flex-direction:column;gap:2px;min-width:0}
.bis-recentName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:20px}
.bis-recentMeta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px}
.bis-recentArrow{flex:none;display:inline-flex;color:var(--dsw-alias-label-tertiary);transform:rotate(-90deg)}
.bis-toastMessage~button{--dsw-focus-ring-color:var(--dsw-alias-toast-label);box-sizing:border-box;display:inline-flex;align-items:center;min-height:var(--dsw-control-height-sm,28px);padding:4px 8px;border-radius:var(--dsw-radius-sm,8px);font-size:13px;line-height:20px}
.bis-toast{display:flex;align-items:center;gap:8px;margin-top:8px}
.bis-recentList{display:flex;flex-direction:column;align-items:stretch;gap:4px;min-width:0;margin:0;padding:0;list-style:none}
.bis-recentList:has(>.bis-recentCompact){padding-inline:12px;margin-inline:-12px}
.bis-recentItem:last-child{border-bottom:0}
/* Match the native menu's three-class focus specificity. */
.bis-page :focus-visible,.bis-modalRoot :focus-visible,.bis-menuList.bis-menuList :focus-visible,.bis-askField:focus-within:has(:focus-visible),.bis-catalogSearch:focus-within:has(:focus-visible),.bis-toastMessage~button:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:2px;box-shadow:none}
.bis-page button,.bis-modalRoot button{white-space:nowrap}
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
     * Read one Host route. A failed tool call keeps the typed error on the thrown value.
     * @param url - the route, including any query.
     * @param options - method and JSON body.
     * @returns the parsed body.
     */
    async function readRoute(url, options) {
      const method = options !== undefined && options.method ? options.method : 'GET';
      const response = await fetch(url, {
        method,
        headers: {
          accept: 'application/json',
          ...(options !== undefined && options.body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: options !== undefined && options.body !== undefined ? JSON.stringify(options.body) : undefined,
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          body !== null && body.error !== null && typeof body.error === 'object' && typeof body.error.message === 'string'
            ? body.error.message
            : `request failed with HTTP ${response.status}`;
        const error = new Error(message);
        error.payload = body;
        error.status = response.status;
        throw error;
      }
      return body;
    }

    /**
     * Whether the Host told the panel to sign in again after a refresh still failed.
     * @param error - a failed route call.
     * @returns true when the payload sets `signIn`.
     */
    function signInNeeded(error) {
      return Boolean(error && error.payload && error.payload.error && error.payload.error.signIn === true);
    }

    /**
     * The host error object, without treating its message as display copy.
     * @param error - a failed route call.
     * @returns the payload error, or a small object with the message kept for details.
     */
    function routeFailure(error) {
      const body = error && error.payload && error.payload.error;
      return body !== null && typeof body === 'object' ? body : { message: error && typeof error.message === 'string' ? error.message : '' };
    }

    /**
     * Format a count in the active locale.
     * @param value - a finite number.
     * @param locale - a BCP 47 tag.
     * @returns display text.
     */
    function formatNumber(value, locale) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '';
      try {
        return new Intl.NumberFormat(locale).format(value);
      } catch (error) {
        return String(value);
      }
    }

    /**
     * Format an ISO timestamp as a date in the active locale.
     * @param value - an ISO string.
     * @param locale - a BCP 47 tag.
     * @returns display text.
     */
    function formatDate(value, locale) {
      if (typeof value !== 'string' || value.length === 0) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      try {
        return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
      } catch (error) {
        return value;
      }
    }

    /**
     * Format an ISO timestamp as a short local time.
     * @param value - an ISO string.
     * @param locale - a BCP 47 tag.
     * @returns display text, or an empty string.
     */
    function formatClock(value, locale) {
      if (typeof value !== 'string' || value.length === 0) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      try {
        return new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(date);
      } catch (error) {
        return '';
      }
    }

    /**
     * Count text for one finding. A unit is shown only when the audit data names one.
     * @param issue - a grouped finding.
     * @param locale - a BCP 47 tag.
     * @returns the count and supplied unit, or an empty string when either is absent.
     */
    function issueCountLabel(issue, locale) {
      const count = formatNumber(issue.count, locale);
      if (count === '') return '';
      const unit = typeof issue.unit === 'string' ? issue.unit.trim() : '';
      return unit === '' ? '' : `${count} ${unit}`;
    }

    /**
     * Format a position with one fraction digit.
     * @param value - the average position, or null.
     * @param locale - a BCP 47 tag.
     * @returns display text.
     */
    function formatPosition(value, locale) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '';
      try {
        return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
      } catch (error) {
        return String(value);
      }
    }

    /**
     * A one-series trend drawn with the theme's current text color. No chart library.
     * @param props - numeric points and an accessible name.
     * @returns the SVG, or null when there is nothing to draw.
     */
    function Sparkline(props) {
      const values = props.points;
      const width = 120;
      const height = 36;
      if (!Array.isArray(values) || values.length === 0) return null;
      const min = Math.min(...values, 0);
      const max = Math.max(...values, 1);
      const span = max - min || 1;
      const coords = values.map((value, index) => {
        const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * (width - 2) + 1;
        const y = height - 2 - ((value - min) / span) * (height - 6);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      return h(
        'svg',
        {
          className: 'bis-spark',
          viewBox: `0 0 ${width} ${height}`,
          role: 'img',
          'aria-label': props.label,
          focusable: 'false',
        },
        h('polyline', {
          points: coords.join(' '),
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '1.5',
          strokeLinejoin: 'round',
          strokeLinecap: 'round',
        }),
      );
    }

    /**
     * A card-shaped placeholder so the first load does not jump the sidebar.
     * @param props - translator.
     * @returns the placeholder.
     */
    function SkeletonCard(props) {
      return h(
        'div',
        { className: 'bis-card bis-skeletonCard', role: 'status', 'aria-label': props.t('loading') },
        h('div', { className: 'bis-skeleton' }),
        h('div', { className: 'bis-skeleton bis-skeletonShort' }),
        h('div', { className: 'bis-skeleton' }),
      );
    }

    /**
     * Reserved space for the workflow catalog so the first load does not jump.
     * @param props - translator.
     * @returns the placeholder.
     */
    function CatalogSkeleton(props) {
      return h(
        'section',
        { className: 'bis-catalog', role: 'status', 'aria-label': props.t('loading') },
        h(
          'div',
          { className: 'bis-catalogHead' },
          h('h2', { className: 'bis-h2 bis-catalogTitle' }, props.t('discover.title')),
          h('span', { className: 'bis-catalogSearch' }, h('div', { className: 'bis-skeleton bis-skeletonField' })),
        ),
        h('div', { className: 'bis-skeleton bis-skeletonTabs' }),
        h(
          'div',
          { className: 'bis-skillGrid' },
          [0, 1, 2, 3, 4, 5].map((slot) =>
            h(
              'div',
              { key: slot, className: 'bis-card bis-skeletonCard' },
              h('div', { className: 'bis-skeleton' }),
              h('div', { className: 'bis-skeleton bis-skeletonShort' }),
            ),
          ),
        ),
      );
    }

    /** Category ids in filter order, with their dictionary keys. */
    const WORKFLOW_FILTERS = [
      ['all', 'category.all'],
      ['audit', 'category.audit'],
      ['search-console', 'category.searchConsole'],
      ['keywords', 'category.keywords'],
      ['competitors', 'category.competitors'],
      ['ai-visibility', 'category.ai'],
      ['local', 'category.local'],
      ['reports', 'category.reports'],
      ['setup', 'category.setup'],
    ];

    /**
     * Skill token for each ask suggestion.
     * The same three-row choice lives in `askSuggestions` in ask.js.
     */
    const ASK_SKILL = {
      issues: 'seo-audit',
      audit: 'seo-audit',
      queries: 'keyword-opportunity-research',
      traffic: 'seo-audit',
      compare: 'competitor-analysis',
      mentions: 'ai-visibility-audit',
    };

    /**
     * @param flags - audit, Search Console, and traffic-history flags.
     * @returns three suggestion ids.
     */
    function askSuggestionIds(flags) {
      const picks = [flags.hasAudit === true ? 'issues' : 'audit'];
      if (flags.searchConsole === true) picks.push('queries');
      picks.push(flags.trafficHistory === true ? 'traffic' : 'compare');
      if (picks.length < 3) picks.push('mentions');
      return picks.slice(0, 3);
    }

    /** Shown when the overview fails or comes back empty. Same row as `askSuggestions({})`. */
    const DEFAULT_SUGGESTIONS = ['audit', 'compare', 'mentions'];

    /**
     * Regular-weight paths from @phosphor-icons/react 2.1.10.
     * The notice ships in THIRD_PARTY_NOTICES.md.
     * Binoculars is the dashboard keyword-research icon. The queries skill uses ChartLineUp.
     */
    const PHOSPHOR = {
      Ranking: 'M112.41,102.53a8,8,0,0,1,5.06-10.12l12-4A8,8,0,0,1,140,96v40a8,8,0,0,1-16,0V107.1l-1.47.49A8,8,0,0,1,112.41,102.53ZM248,208a8,8,0,0,1-8,8H16a8,8,0,0,1,0-16h8V104A16,16,0,0,1,40,88H80V56A16,16,0,0,1,96,40h64a16,16,0,0,1,16,16v72h40a16,16,0,0,1,16,16v56h8A8,8,0,0,1,248,208Zm-72-64v56h40V144ZM96,200h64V56H96Zm-56,0H80V104H40Z',
      Binoculars: 'M237.2,151.87v0a47.1,47.1,0,0,0-2.35-5.45L193.26,51.8a7.82,7.82,0,0,0-1.66-2.44,32,32,0,0,0-45.26,0A8,8,0,0,0,144,55V80H112V55a8,8,0,0,0-2.34-5.66,32,32,0,0,0-45.26,0,7.82,7.82,0,0,0-1.66,2.44L21.15,146.4a47.1,47.1,0,0,0-2.35,5.45v0A48,48,0,1,0,112,168V96h32v72a48,48,0,1,0,93.2-16.13ZM76.71,59.75a16,16,0,0,1,19.29-1v73.51a47.9,47.9,0,0,0-46.79-9.92ZM64,200a32,32,0,1,1,32-32A32,32,0,0,1,64,200ZM160,58.74a16,16,0,0,1,19.29,1l27.5,62.58A47.9,47.9,0,0,0,160,132.25ZM192,200a32,32,0,1,1,32-32A32,32,0,0,1,192,200Z',
      Tag: 'M243.31,136,144,36.69A15.86,15.86,0,0,0,132.69,32H40a8,8,0,0,0-8,8v92.69A15.86,15.86,0,0,0,36.69,144L136,243.31a16,16,0,0,0,22.63,0l84.68-84.68a16,16,0,0,0,0-22.63Zm-96,96L48,132.69V48h84.69L232,147.31ZM96,84A12,12,0,1,1,84,72,12,12,0,0,1,96,84Z',
      UploadSimple: 'M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0ZM93.66,77.66,120,51.31V144a8,8,0,0,0,16,0V51.31l26.34,26.35a8,8,0,0,0,11.32-11.32l-40-40a8,8,0,0,0-11.32,0l-40,40A8,8,0,0,0,93.66,77.66Z',
      UsersThree: 'M244.8,150.4a8,8,0,0,1-11.2-1.6A51.6,51.6,0,0,0,192,128a8,8,0,0,1-7.37-4.89,8,8,0,0,1,0-6.22A8,8,0,0,1,192,112a24,24,0,1,0-23.24-30,8,8,0,1,1-15.5-4A40,40,0,1,1,219,117.51a67.94,67.94,0,0,1,27.43,21.68A8,8,0,0,1,244.8,150.4ZM190.92,212a8,8,0,1,1-13.84,8,57,57,0,0,0-98.16,0,8,8,0,1,1-13.84-8,72.06,72.06,0,0,1,33.74-29.92,48,48,0,1,1,58.36,0A72.06,72.06,0,0,1,190.92,212ZM128,176a32,32,0,1,0-32-32A32,32,0,0,0,128,176ZM72,120a8,8,0,0,0-8-8A24,24,0,1,1,87.24,82a8,8,0,1,0,15.5-4A40,40,0,1,0,37,117.51,67.94,67.94,0,0,0,9.6,139.19a8,8,0,1,0,12.8,9.61A51.6,51.6,0,0,1,64,128,8,8,0,0,0,72,120Z',
      MapTrifold: 'M228.92,49.69a8,8,0,0,0-6.86-1.45L160.93,63.52,99.58,32.84a8,8,0,0,0-5.52-.6l-64,16A8,8,0,0,0,24,56V200a8,8,0,0,0,9.94,7.76l61.13-15.28,61.35,30.68A8.15,8.15,0,0,0,160,224a8,8,0,0,0,1.94-.24l64-16A8,8,0,0,0,232,200V56A8,8,0,0,0,228.92,49.69ZM104,52.94l48,24V203.06l-48-24ZM40,62.25l48-12v127.5l-48,12Zm176,131.5-48,12V78.25l48-12Z',
      Link: 'M240,88.23a54.43,54.43,0,0,1-16,37L189.25,160a54.27,54.27,0,0,1-38.63,16h-.05A54.63,54.63,0,0,1,96,119.84a8,8,0,0,1,16,.45A38.62,38.62,0,0,0,150.58,160h0a38.39,38.39,0,0,0,27.31-11.31l34.75-34.75a38.63,38.63,0,0,0-54.63-54.63l-11,11A8,8,0,0,1,135.7,59l11-11A54.65,54.65,0,0,1,224,48,54.86,54.86,0,0,1,240,88.23ZM109,185.66l-11,11A38.41,38.41,0,0,1,70.6,208h0a38.63,38.63,0,0,1-27.29-65.94L78,107.31A38.63,38.63,0,0,1,144,135.71a8,8,0,0,0,16,.45A54.86,54.86,0,0,0,144,96a54.65,54.65,0,0,0-77.27,0L32,130.75A54.62,54.62,0,0,0,70.56,224h0a54.28,54.28,0,0,0,38.64-16l11-11A8,8,0,0,0,109,185.66Z',
      MapPin: 'M128,64a40,40,0,1,0,40,40A40,40,0,0,0,128,64Zm0,64a24,24,0,1,1,24-24A24,24,0,0,1,128,128Zm0-112a88.1,88.1,0,0,0-88,88c0,31.4,14.51,64.68,42,96.25a254.19,254.19,0,0,0,41.45,38.3,8,8,0,0,0,9.18,0A254.19,254.19,0,0,0,174,200.25c27.45-31.57,42-64.85,42-96.25A88.1,88.1,0,0,0,128,16Zm0,206c-16.53-13-72-60.75-72-118a72,72,0,0,1,144,0C200,161.23,144.53,209,128,222Z',
      Eye: 'M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,124,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.34c18.83-18.83,27.3-37.61,27.65-38.4A8,8,0,0,0,247.31,124.76ZM128,192c-30.78,0-57.67-11.19-79.93-33.25A133.47,133.47,0,0,1,25,128,133.33,133.33,0,0,1,48.07,97.25C70.33,75.19,97.22,64,128,64s57.67,11.19,79.93,33.25A133.46,133.46,0,0,1,231.05,128C223.84,141.46,192.43,192,128,192Zm0-112a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Z',
      MagnifyingGlass: 'M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z',
      Scan: 'M224,40V80a8,8,0,0,1-16,0V48H176a8,8,0,0,1,0-16h40A8,8,0,0,1,224,40ZM80,208H48V176a8,8,0,0,0-16,0v40a8,8,0,0,0,8,8H80a8,8,0,0,0,0-16Zm136-40a8,8,0,0,0-8,8v32H176a8,8,0,0,0,0,16h40a8,8,0,0,0,8-8V176A8,8,0,0,0,216,168ZM40,88a8,8,0,0,0,8-8V48H80a8,8,0,0,0,0-16H40a8,8,0,0,0-8,8V80A8,8,0,0,0,40,88ZM80,72h96a8,8,0,0,1,8,8v96a8,8,0,0,1-8,8H80a8,8,0,0,1-8-8V80A8,8,0,0,1,80,72Zm8,96h80V88H88Z',
      ChartLineUp: 'M232,208a8,8,0,0,1-8,8H32a8,8,0,0,1-8-8V48a8,8,0,0,1,16,0V156.69l50.34-50.35a8,8,0,0,1,11.32,0L128,132.69,180.69,80H160a8,8,0,0,1,0-16h40a8,8,0,0,1,8,8v40a8,8,0,0,1-16,0V91.31l-58.34,58.35a8,8,0,0,1-11.32,0L96,123.31l-56,56V200H224A8,8,0,0,1,232,208Z',
      FileText: 'M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-32-80a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,136Zm0,32a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,168Z',
      Siren: 'M120,16V8a8,8,0,0,1,16,0v8a8,8,0,0,1-16,0Zm80,32a8,8,0,0,0,5.66-2.34l8-8a8,8,0,0,0-11.32-11.32l-8,8A8,8,0,0,0,200,48ZM50.34,45.66A8,8,0,0,0,61.66,34.34l-8-8A8,8,0,0,0,42.34,37.66Zm87,26.45a8,8,0,1,0-2.64,15.78C153.67,91.08,168,108.32,168,128a8,8,0,0,0,16,0C184,100.6,163.93,76.57,137.32,72.11ZM232,176v24a16,16,0,0,1-16,16H40a16,16,0,0,1-16-16V176a16,16,0,0,1,16-16V128a88,88,0,0,1,88.67-88c48.15.36,87.33,40.29,87.33,89v31A16,16,0,0,1,232,176ZM56,160H200V129c0-40-32.05-72.71-71.45-73H128a72,72,0,0,0-72,72Zm160,40V176H40v24H216Z',
      ShareNetwork: 'M176,160a39.89,39.89,0,0,0-28.62,12.09l-46.1-29.63a39.8,39.8,0,0,0,0-28.92l46.1-29.63a40,40,0,1,0-8.66-13.45l-46.1,29.63a40,40,0,1,0,0,55.82l46.1,29.63A40,40,0,1,0,176,160Zm0-128a24,24,0,1,1-24,24A24,24,0,0,1,176,32ZM64,152a24,24,0,1,1,24-24A24,24,0,0,1,64,152Zm112,72a24,24,0,1,1,24-24A24,24,0,0,1,176,224Z',
      GearSix: 'M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm109.94-52.79a8,8,0,0,0-3.89-5.4l-29.83-17-.12-33.62a8,8,0,0,0-2.83-6.08,111.91,111.91,0,0,0-36.72-20.67,8,8,0,0,0-6.46.59L128,41.85,97.88,25a8,8,0,0,0-6.47-.6A112.1,112.1,0,0,0,54.73,45.15a8,8,0,0,0-2.83,6.07l-.15,33.65-29.83,17a8,8,0,0,0-3.89,5.4,106.47,106.47,0,0,0,0,41.56,8,8,0,0,0,3.89,5.4l29.83,17,.12,33.62a8,8,0,0,0,2.83,6.08,111.91,111.91,0,0,0,36.72,20.67,8,8,0,0,0,6.46-.59L128,214.15,158.12,231a7.91,7.91,0,0,0,3.9,1,8.09,8.09,0,0,0,2.57-.42,112.1,112.1,0,0,0,36.68-20.73,8,8,0,0,0,2.83-6.07l.15-33.65,29.83-17a8,8,0,0,0,3.89-5.4A106.47,106.47,0,0,0,237.94,107.21Zm-15,34.91-28.57,16.25a8,8,0,0,0-3,3c-.58,1-1.19,2.06-1.81,3.06a7.94,7.94,0,0,0-1.22,4.21l-.15,32.25a95.89,95.89,0,0,1-25.37,14.3L134,199.13a8,8,0,0,0-3.91-1h-.19c-1.21,0-2.43,0-3.64,0a8.08,8.08,0,0,0-4.1,1l-28.84,16.1A96,96,0,0,1,67.88,201l-.11-32.2a8,8,0,0,0-1.22-4.22c-.62-1-1.23-2-1.8-3.06a8.09,8.09,0,0,0-3-3.06l-28.6-16.29a90.49,90.49,0,0,1,0-28.26L61.67,97.63a8,8,0,0,0,3-3c.58-1,1.19-2.06,1.81-3.06a7.94,7.94,0,0,0,1.22-4.21l.15-32.25a95.89,95.89,0,0,1,25.37-14.3L122,56.87a8,8,0,0,0,4.1,1c1.21,0,2.43,0,3.64,0a8.08,8.08,0,0,0,4.1-1l28.84-16.1A96,96,0,0,1,188.12,55l.11,32.2a8,8,0,0,0,1.22,4.22c.62,1,1.23,2,1.8,3.06a8.09,8.09,0,0,0,3,3.06l28.6,16.29A90.49,90.49,0,0,1,222.9,142.12Z',
      Globe: 'M128,24h0A104,104,0,1,0,232,128,104.12,104.12,0,0,0,128,24Zm88,104a87.61,87.61,0,0,1-3.33,24H174.16a157.44,157.44,0,0,0,0-48h38.51A87.61,87.61,0,0,1,216,128ZM102,168H154a115.11,115.11,0,0,1-26,45A115.27,115.27,0,0,1,102,168Zm-3.9-16a140.84,140.84,0,0,1,0-48h59.88a140.84,140.84,0,0,1,0,48ZM40,128a87.61,87.61,0,0,1,3.33-24H81.84a157.44,157.44,0,0,0,0,48H43.33A87.61,87.61,0,0,1,40,128ZM154,88H102a115.11,115.11,0,0,1,26-45A115.27,115.27,0,0,1,154,88Zm52.33,0H170.71a135.28,135.28,0,0,0-22.3-45.6A88.29,88.29,0,0,1,206.37,88ZM107.59,42.4A135.28,135.28,0,0,0,85.29,88H49.63A88.29,88.29,0,0,1,107.59,42.4ZM49.63,168H85.29a135.28,135.28,0,0,0,22.3,45.6A88.29,88.29,0,0,1,49.63,168Zm98.78,45.6a135.28,135.28,0,0,0,22.3-45.6h35.66A88.29,88.29,0,0,1,148.41,213.6Z',
      PuzzlePiece: 'M220.27,158.54a8,8,0,0,0-7.7-.46,20,20,0,1,1,0-36.16A8,8,0,0,0,224,114.69V72a16,16,0,0,0-16-16H171.78a35.36,35.36,0,0,0,.22-4,36.11,36.11,0,0,0-11.36-26.24,36,36,0,0,0-60.55,23.62,36.56,36.56,0,0,0,.14,6.62H64A16,16,0,0,0,48,72v32.22a35.36,35.36,0,0,0-4-.22,36.12,36.12,0,0,0-26.24,11.36,35.7,35.7,0,0,0-9.69,27,36.08,36.08,0,0,0,33.31,33.6,35.68,35.68,0,0,0,6.62-.14V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V165.31A8,8,0,0,0,220.27,158.54ZM208,208H64V165.31a8,8,0,0,0-11.43-7.23,20,20,0,1,1,0-36.16A8,8,0,0,0,64,114.69V72h46.69a8,8,0,0,0,7.23-11.43,20,20,0,1,1,36.16,0A8,8,0,0,0,161.31,72H208v32.23a35.68,35.68,0,0,0-6.62-.14A36,36,0,0,0,204,176a35.36,35.36,0,0,0,4-.22Z',
      Key: 'M216.57,39.43A80,80,0,0,0,83.91,120.78L28.69,176A15.86,15.86,0,0,0,24,187.31V216a16,16,0,0,0,16,16H72a8,8,0,0,0,8-8V208H96a8,8,0,0,0,8-8V184h16a8,8,0,0,0,5.66-2.34l9.56-9.57A79.73,79.73,0,0,0,160,176h.1A80,80,0,0,0,216.57,39.43ZM224,98.1c-1.09,34.09-29.75,61.86-63.89,61.9H160a63.7,63.7,0,0,1-23.65-4.51,8,8,0,0,0-8.84,1.68L116.69,168H96a8,8,0,0,0-8,8v16H72a8,8,0,0,0-8,8v16H40V187.31l58.83-58.82a8,8,0,0,0,1.68-8.84A63.72,63.72,0,0,1,96,95.92c0-34.14,27.81-62.8,61.9-63.89A64,64,0,0,1,224,98.1ZM192,76a12,12,0,1,1-12-12A12,12,0,0,1,192,76Z',
      Pulse: 'M240,128a8,8,0,0,1-8,8H204.94l-37.78,75.58A8,8,0,0,1,160,216h-.4a8,8,0,0,1-7.08-5.14L95.35,60.76,63.28,131.31A8,8,0,0,1,56,136H24a8,8,0,0,1,0-16H50.85L88.72,36.69a8,8,0,0,1,14.76.46l57.51,151,31.85-63.71A8,8,0,0,1,200,120h32A8,8,0,0,1,240,128Z',
      CaretDown: 'M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z',
      DotsThree: 'M140,128a12,12,0,1,1-12-12A12,12,0,0,1,140,128Zm56-12a12,12,0,1,0,12,12A12,12,0,0,0,196,116ZM60,116a12,12,0,1,0,12,12A12,12,0,0,0,60,116Z',
    };

    const SKILL_ICON = {
      'rank-tracking-report': 'Ranking',
      'keyword-clustering': 'Tag',
      'keyword-import': 'UploadSimple',
      'competitor-analysis': 'UsersThree',
      'competitive-landscape': 'MapTrifold',
      'backlink-profile-analysis': 'Link',
      'local-seo': 'MapPin',
      'ai-visibility-audit': 'Eye',
      'ai-prompt-research': 'MagnifyingGlass',
      'seo-audit': 'Scan',
      'keyword-opportunity-research': 'ChartLineUp',
      'weekly-report': 'FileText',
      'alert-triage': 'Siren',
      'project-setup': 'GearSix',
      'domain-onboarding': 'Globe',
      'provider-setup': 'PuzzlePiece',
      'team-api-governance': 'Key',
      // Withheld with instance-diagnosis. The glyph is used again when that pack is registered.
      'self-host-health': 'Pulse',
    };

    /** Unknown identities stay neutral instead of borrowing another group's meaning. */
    function skillIdentity(item) {
      const icon = Object.hasOwn(SKILL_ICON, item.skill) ? SKILL_ICON[item.skill] : null;
      const knownIcon = icon !== null && Object.hasOwn(PHOSPHOR, icon);
      return {
        surface: knownIcon && Object.hasOwn(GROUP_IDENTITY, item.surface) ? item.surface : 'unknown',
        icon: knownIcon ? icon : 'PuzzlePiece',
      };
    }

    /**
     * @param props - `name` is a PHOSPHOR key and `size` is the pixel box.
     * @returns one currentColor glyph. Known tiles turn it white through CSS.
     */
    function PhosphorIcon(props) {
      const d = PHOSPHOR[props.name];
      if (typeof d !== 'string' || d.length === 0) throw new Error('missing phosphor path ' + props.name);
      const size = props.size || 22;
      return h(
        'svg',
        {
          viewBox: '0 0 256 256',
          width: size,
          height: size,
          fill: 'currentColor',
          'aria-hidden': 'true',
          focusable: 'false',
          'data-phosphor': props.name,
        },
        h('path', { d }),
      );
    }
    /**
     * Same choice as `visibleStartSkills` in workflows.js.
     * @param rows - shaped workflows.
     * @param state - audit, Search Console, and keyword flags.
     * @param surface - the selected surface.
     * @returns routers removed, then sorted by available data.
     */
    function visibleSkills(rows, state, surface) {
      const list = (Array.isArray(rows) ? rows : []).filter(
        (item) => item && item.router !== true && item.skill !== 'seo-coach' && item.skill !== 'bisibility' && item.pack !== 'router',
      );
      const group = surface && surface !== 'all' ? list.filter((item) => item.surface === surface) : list;
      const score = (item) => {
        let value = 0;
        if (item.needs === 'audit' && state.audit === true) value += 30;
        if (item.needs === 'search-console' && state.searchConsole === true) value += 30;
        if (item.needs === 'keywords' && state.keywords === true) value += 30;
        if (item.source === 'saved' && state.audit === true) value += 8;
        if (item.source === 'search-console' && state.searchConsole === true) value += 8;
        if (item.source === 'saved' && item.needs === 'keywords' && state.keywords === true) value += 4;
        return value;
      };
      return group
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
          const delta = score(b.item) - score(a.item);
          if (delta !== 0) return delta;
          return (a.item.order ?? a.index) - (b.item.order ?? b.index);
        })
        .map((row) => row.item);
    }


    /**
     * Provider ids in chip order. The skill to provider map ships on each shaped
     * workflow row (`providers`), from `PROVIDER_SKILLS` in workflows.js.
     */
    const PROVIDER_ORDER = ['dataforseo', 'gsc', 'serpapi', 'ga4', 'plausible', 'ahrefs', 'local-sequence'];

    /**
     * Same choice as `providerChips` in workflows.js.
     * @param rows - shaped workflows.
     * @returns provider ids with at least one visible skill other than provider-setup.
     */
    function providerChipIds(rows) {
      const visible = visibleSkills(rows, {}, 'all').filter((item) => item.skill !== 'provider-setup');
      return PROVIDER_ORDER.filter((id) => visible.some((item) => Array.isArray(item.providers) && item.providers.includes(id)));
    }

    /**
     * Same choice as `providerPrompt` in workflows.js.
     * @param item - a shaped workflow.
     * @param provider - selected provider ids (or one legacy id).
     * @returns the prompt, plus one provider sentence only for the skills that accept one.
     */
    function providerPrompt(item, provider) {
      const rule = item.providerSentence;
      if (rule === null || rule === undefined || !Array.isArray(rule.providers)) return item.prompt;
      const selected = [...new Set(Array.isArray(provider) ? provider : typeof provider === 'string' ? [provider] : [])].filter((id) => rule.providers.includes(id));
      if (selected.length !== 1) return item.prompt;
      return `${item.prompt} ${rule.text.replaceAll('{provider}', selected[0])}`;
    }

    /**
     * @param overview - the overview payload, or null while it loads.
     * @param id - a provider id.
     * @returns unknown, connected, disabled, needs_reauth, or not_connected.
     */
    function providerChipState(overview, id) {
      if (overview === null || !Array.isArray(overview.providers)) return 'unknown';
      const row = overview.providers.find((item) => item && item.id === id);
      return row === undefined ? 'not_connected' : row.status;
    }

    /**
     * Which sentence names the data a tool was reading.
     * @param tool - MCP tool name, or an empty string.
     * @returns a dictionary key, or null when the caller has its own sentence.
     */
    function toolSentence(tool) {
      if (tool === 'list_keywords') return 'failure.keywords';
      if (tool === 'list_site_audits' || tool === 'get_site_audit' || tool === 'run_site_audit') return 'failure.audit';
      if (tool === 'list_providers') return 'failure.connections';
      if (tool === 'get_search_performance_totals' || tool === 'list_search_performance_query_stats' || tool === 'get_page_indexing_report' || tool === 'list_page_indexing_urls') return 'failure.search';
      if (tool === 'list_traffic_snapshots' || tool === 'sync_project_traffic') return 'failure.analytics';
      if (tool === 'list_projects' || tool === 'create_project') return 'failure.projects';
      if (tool === 'list_agent_reports' || tool === 'get_agent_report') return 'failure.recent';
      return null;
    }

    /**
     * A failed load: one sentence, Retry, and the tool facts behind a disclosure.
     * The raw tool message stays off the screen.
     * @param props - translator, error payload, fallback sentence key, and retry.
     * @returns the error block.
     */
    function LoadFailure(props) {
      const error = props.error !== null && typeof props.error === 'object' ? props.error : {};
      const tool = typeof error.tool === 'string' ? error.tool : '';
      const kind = typeof error.kind === 'string' ? error.kind : '';
      const status = typeof error.status === 'number' ? error.status : null;
      const sentenceKey = toolSentence(tool) || props.fallback;
      const parts = [];
      if (tool !== '') parts.push(tool);
      if (status !== null) parts.push(`HTTP ${status}`);
      if (kind !== '') parts.push(kind);
      return h(
        'div',
        { className: 'bis-failure', role: 'alert' },
        h(
          'div',
          { className: 'bis-failureRow' },
          h(StateDot, { state: 'error', size: 8 }),
          h('p', { className: 'bis-failureText' }, props.t(sentenceKey)),
          h(Button, { variant: 'outline', size: 'sm', onClick: props.onRetry }, props.t('failure.retry')),
        ),
        parts.length === 0
          ? null
          : h(
              'details',
              { className: 'bis-failureDetails' },
              h('summary', null, props.t('failure.details')),
              h('p', { className: 'bis-failureTech' }, parts.join(' · ')),
            ),
      );
    }

    /**
     * @param item - a shaped skill.
     * @param state - project flags.
     * @returns one or two label ids.
     */
    function skillLabelIds(item, state) {
      if (state === null || state.known === false) return [];
      const readiness =
        item.needs === 'search-console' && state.searchConsole !== true
          ? 'connect-search'
          : item.needs === 'keywords' && state.keywords === false
            ? 'add-keywords'
            : item.needs === 'alerts'
              ? 'no-alerts'
                : item.needs === 'audit' && state.audit !== true
                  ? 'no-audit'
                  : null;
      const labels = [];
      if (readiness !== null) labels.push(readiness);
      if (item.billing === 'estimate' && labels.length < 2) labels.push('estimate');
      if (labels.length === 0) labels.push(item.source);
      return labels.slice(0, 2);
    }

    /**
     * Pack label for a skill that ships with the rest of its pack.
     * @param item - a shaped workflow.
     * @param t - panel translator.
     * @returns the label, or an empty string when the skill has no pack.
     */
    function packText(item, t) {
      if (item.pack === 'router') return t('pack.router');
      if (item.pack === 'project-onboarding') return t('pack.projectOnboarding');
      if (item.pack === 'instance-diagnosis') return t('pack.instanceDiagnosis');
      return '';
    }

    function badgeText(item, t) {
      const key =
        item.badge === 'search-console'
          ? 'badge.searchConsole'
          : item.badge === 'analytics'
            ? 'badge.analytics'
            : item.badge === 'credits'
              ? 'badge.credits'
              : 'badge.free';
      const label = t(key);
      if (item.badge === 'credits' && typeof item.estimate === 'string' && item.estimate !== '') {
        return `${label}: ${item.estimate}`;
      }
      return label;
    }

    /**
     * Why a crawl stopped, in the panel language.
     * @param reason - the server stop reason.
     * @param t - panel translator.
     * @returns a short label.
     */
    function stopLabel(reason, t) {
      if (reason === 'finished') return t('audit.stop.finished');
      if (reason === 'page_limit') return t('audit.stop.page_limit');
      if (reason === 'time_limit') return t('audit.stop.time_limit');
      if (reason === 'request_limit') return t('audit.stop.request_limit');
      return typeof reason === 'string' ? reason : '';
    }

    /** Settings menu opens under the trigger, end-aligned, and shifts back inside the panel. */
    const settingsMenuPlacement = {
      side: 'bottom',
      align: 'end',
      placement: 'bottom-end',
      avoidCollisions: true,
      collisionPadding: 8,
      className: 'bis-settingsMenu',
    };

    /** Enable full-text hints only while the rendered text is horizontally truncated. */
    function TruncatedTooltip({ label, render, measureSelector, measuredLabel, disabled, ...tooltipProps }) {
      const anchor = React.useRef(null);
      const [hint, setHint] = React.useState(null);
      React.useLayoutEffect(() => {
        const element = anchor.current;
        const texts = element && (measureSelector ? Array.from(element.querySelectorAll(measureSelector)) : [element]);
        if (!texts || texts.length === 0) return undefined;
        let active = true;
        const refresh = () => {
          if (!active) return;
          const overflowing = texts.filter((text) => text.scrollWidth > text.clientWidth);
          setHint(overflowing.length === 0 ? null : measuredLabel ? overflowing.map((text) => text.textContent).join('\n') : label);
        };
        refresh();
        element.addEventListener('pointerenter', refresh);
        element.addEventListener('focusin', refresh);
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(refresh) : null;
        if (observer) texts.forEach((text) => observer.observe(text));
        window.addEventListener('resize', refresh);
        const fonts = document.fonts;
        if (fonts && fonts.ready) void fonts.ready.then(refresh, () => {});
        if (fonts && typeof fonts.addEventListener === 'function') fonts.addEventListener('loadingdone', refresh);
        return () => {
          active = false;
          element.removeEventListener('pointerenter', refresh);
          element.removeEventListener('focusin', refresh);
          if (observer) observer.disconnect();
          window.removeEventListener('resize', refresh);
          if (fonts && typeof fonts.removeEventListener === 'function') fonts.removeEventListener('loadingdone', refresh);
        };
      }, [label, measureSelector, measuredLabel]);
      return h(Tooltip, { label: hint === null ? label : hint, portal: true, ...tooltipProps, disabled: disabled === true || hint === null }, render(anchor));
    }

    /** Native anchored menu with panel bounds and the shared padded item convention. */
    function PanelMenu(props) {
      const { panelRef, renderAnchor, menuClass, items = [], selectedId, onSelect, children, flipWhenClipped, ...menuProps } = props;
      const trigger = React.useRef(null);
      const getAnchorRect = () => {
        const anchor = trigger.current;
        if (!anchor) return null;
        const rect = anchor.getBoundingClientRect();
        const panel = panelRef.current && panelRef.current.getBoundingClientRect();
        if (!panel) return rect;
        const left = Math.max(0, panel.left) + 16;
        const right = Math.min(document.documentElement.clientWidth, panel.right) - 16;
        const top = Math.max(0, panel.top) + 16;
        const bottom = Math.min(window.innerHeight, panel.bottom) - 16;
        const popup = document.querySelector(`.${menuClass}`);
        if (!popup) return rect;
        popup.style.maxWidth = `${Math.max(0, Math.min(320, right - left))}px`;
        popup.style.maxHeight = `${Math.max(0, bottom - top)}px`;
        const size = popup.getBoundingClientRect();
        const x = Math.max(left + size.width, Math.min(right, rect.right));
        const above = rect.top - size.height - 4;
        const y = flipWhenClipped && rect.bottom + 4 + size.height > bottom && above >= top
          ? above - 4
          : Math.max(top - 4, Math.min(rect.bottom, bottom - size.height - 4));
        return { x: x - rect.width, y: y - rect.height, left: x - rect.width, right: x, top: y - rect.height, bottom: y, width: rect.width, height: rect.height };
      };
      return h(Menu, {
        ...settingsMenuPlacement,
        ...menuProps,
        portal: true,
        anchor: renderAnchor(trigger),
        getAnchorRect,
        listClassName: `bis-menuList ${menuClass}`,
      }, children && (!Array.isArray(children) || children.length > 0) ? children : items.map((item) => item.type === 'label'
        ? h('div', { key: item.id, className: 'bis-menuNote', role: 'presentation' }, item.text)
        : h(TruncatedTooltip, { key: item.id, label: item.label, measureSelector: '.bis-menuLabel', render: (ref) =>
            h('div', { className: 'bis-menuItemTip', ref },
              h(MenuItemButton, { current: item.id === selectedId, onSelect: () => onSelect(item.id) },
                h('span', { className: 'bis-menuItemContent' },
                  h('span', { className: 'bis-menuLabel' }, item.label),
                  item.id === selectedId ? h('span', { className: 'bis-menuCheck', 'aria-hidden': 'true' }, '✓') : null,
                ),
              ),
            ),
          }),
      ));
    }

    /**
     * Compact panel header: logo, project, connection, and the settings menu.
     * A project menu exists only when the account has more than one project.
     * @param props - translator and the header actions.
     * @returns the header.
     */
    function StartHeader(props) {
      const {
        t,
        panelRef,
        projects,
        projectId,
        setProjectId,
        selected,
        projectMenu,
        setProjectMenu,
        settingsMenu,
        setSettingsMenu,
        version,
        expiryNote,
        busy,
        onRefresh,
        onDisconnect,
        onOpenPlugins,
        onOpenSurface,
        projectPending,
        statusPending,
        statusText,
        dot,
      } = props;
      const pendingProject = projectPending === true || projects === null;
      const many = !pendingProject && Array.isArray(projects) && projects.length > 1;
      const projectLabel =
        selected !== null && selected !== undefined
          ? selected.domain || selected.name || t('header.noProject')
          : t('header.noProject');
      const projectItems = many
        ? projects.map((row) => ({
            id: row.id,
            label: row.domain ? `${row.name} (${row.domain})` : row.name,
          }))
        : [];
      const settingsItems = [
        version === null ? null : { id: 'version', type: 'label', text: t('header.version', { version }) },
        expiryNote === null || expiryNote === undefined
          ? null
          : { id: 'session', type: 'label', className: 'bis-menuNote', text: expiryNote },
        { id: 'refresh', label: t('refresh') },
        { id: 'disconnect', label: busy === 'disconnect' ? t('connected.disconnecting') : t('connected.disconnect') },
        { id: 'provider', label: t('header.provider') },
        { id: 'plugins', label: t('update.openPlugins') },
        { id: 'docs', label: t('docs') },
        { id: 'troubleshooting', label: t('troubleshooting') },
        { id: 'site', label: t('site') },
      ].filter((item) => item !== null);
      const onSettings = (id) => {
        setSettingsMenu(false);
        if (id === 'refresh') onRefresh();
        else if (id === 'disconnect') onDisconnect();
        else if (id === 'provider' && typeof onOpenSurface === 'function') onOpenSurface('project');
        else if (id === 'plugins') onOpenPlugins();
        else if (id === 'docs' || id === 'troubleshooting' || id === 'site') {
          const href = id === 'docs' ? DOCS_URL : id === 'troubleshooting' ? TROUBLESHOOTING_URL : SITE_URL;
          try {
            const link = document.createElement('a');
            link.href = href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            document.body.appendChild(link);
            link.click();
            link.remove();
          } catch (error) {
            /* the menu item stays available */
          }
        }
      };
      return h(
        'header',
        { className: 'bis-head' },
        h('span', { className: 'bis-mark', 'data-slot': 'mark', 'aria-hidden': 'true' }, h(BisibilityMark, { size: 16 })),
        h(
          'div',
          { className: 'bis-titles', 'data-slot': 'titles' },
          h('h1', { className: 'bis-title', 'data-slot': 'title' }, t('title')),
          h(
            'span',
            { className: 'bis-projectSlot', 'data-slot': 'project' },
            pendingProject
              ? null
              : many
                ? h(
                    'span',
                    { className: 'bis-projectSwitch' },
                    h(PanelMenu, {
                      panelRef,
                      menuClass: 'bis-projectMenuList',
                      renderAnchor: (ref) => h(TruncatedTooltip, { label: projectLabel, disabled: projectMenu, measureSelector: '.bis-projectLabel', render: (measureRef) => h(
                        Button,
                        {
                          variant: 'ghost',
                          size: 'sm',
                          className: 'bis-projectName',
                          ref: (element) => { ref.current = element; measureRef.current = element; },
                          'aria-label': t('project.label'),
                          'aria-haspopup': 'menu',
                          'aria-expanded': projectMenu ? 'true' : 'false',
                          onClick: () => setProjectMenu((open) => !open),
                        },
                        h('span', { className: 'bis-projectLabel' }, projectLabel),
                        h(PhosphorIcon, { name: 'CaretDown', size: 14 }),
                      ) }),
                      listClassName: 'bis-menuList',
                      portal: true,
                      open: projectMenu,
                      items: projectItems,
                      selectedId: projectId,
                      onClose: () => setProjectMenu(false),
                      onSelect: (id) => {
                        setProjectMenu(false);
                        setProjectId(id);
                      },
                    }),
                  )
                : h(TruncatedTooltip, { label: projectLabel, measureSelector: '.bis-projectLabel', render: (ref) => h('span', { className: 'bis-projectName', ref }, h('span', { className: 'bis-projectLabel' }, projectLabel)) }),
          ),
        ),
        h(
          'div',
          { className: 'bis-headEnd', 'data-slot': 'end' },
          h(
            'span',
            { className: 'bis-connected', 'data-slot': 'status' },
            h(
              'span',
              { className: 'bis-statusLabel', 'data-slot': 'statusText' },
              h(Tooltip, { label: statusText || t('status.connected'), portal: true }, h('span', { className: 'bis-statusDot', 'aria-hidden': 'true' }, h(StateDot, { state: dot || 'idle', size: 8 }))),
              h('span', { className: 'bis-statusCopy' }, statusPending === true ? t('loading') : statusText || t('status.connected')),
            ),
          ),
          h(
            'span',
            { className: 'bis-settingsAnchor', 'data-slot': 'settings' },
            h(PanelMenu, {
              panelRef,
              menuClass: 'bis-settingsMenuList',
              renderAnchor: (ref) => h(
                Button,
                {
                  variant: 'ghost',
                  size: 'sm',
                  ref,
                  className: 'bis-iconButton',
                  'aria-label': t('header.settings'),
                  'aria-haspopup': 'menu',
                  'aria-expanded': settingsMenu ? 'true' : 'false',
                  disabled: busy !== null && busy !== undefined,
                  onClick: () => setSettingsMenu((open) => !open),
                },
                h(PhosphorIcon, { name: 'DotsThree', size: 16 }),
              ),
              listClassName: 'bis-menuList',
              portal: true,
              open: settingsMenu,
              items: settingsItems,
              onClose: () => setSettingsMenu(false),
              onSelect: onSettings,
            }),
          ),
        ),
      );
    }

    /**
     * One row of tabs. The row is as wide as its labels, and the selected mark
     * lives on the selected tab. A narrow panel scrolls the row instead of wrapping it.
     * @param props - accessible name, selected value, items, and change handler.
     * @returns the tab row.
     */
    function FilterTabs(props) {
      const items = Array.isArray(props.items) ? props.items : [];
      const rowRef = React.useRef(null);
      React.useEffect(() => {
        const row = rowRef.current;
        if (!row) return undefined;
        const onWheel = (event) => {
          if (row.scrollWidth <= row.clientWidth) return;
          const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
          const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? row.clientWidth : 1;
          const before = row.scrollLeft;
          row.scrollLeft += delta * unit;
          if (row.scrollLeft !== before) event.preventDefault();
        };
        row.addEventListener('wheel', onWheel, { passive: false });
        return () => row.removeEventListener('wheel', onWheel);
      }, []);
      const onKeyDown = (event, index) => {
        let next = null;
        if (event.key === 'ArrowRight') next = (index + 1) % items.length;
        else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = items.length - 1;
        if (next === null) return;
        event.preventDefault();
        props.onChange(items[next].value);
        const row = event.currentTarget && event.currentTarget.parentElement;
        const target = row && row.querySelectorAll('[role=tab]')[next];
        if (target) {
          target.focus({ preventScroll: true });
          target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      };
      return h(
        'div',
        {
          role: 'tablist',
          ref: rowRef,
          'aria-label': props.label,
          className: ['bis-tabs', props.className].filter((name) => typeof name === 'string' && name !== '').join(' '),
        },
        items.map((item, index) => {
          const selected = item.value === props.value;
          return h(
            'button',
            {
              type: 'button',
              key: item.value,
              role: 'tab',
              'aria-selected': selected ? 'true' : 'false',
              tabIndex: selected ? 0 : -1,
              onClick: () => props.onChange(item.value),
              onKeyDown: (event) => onKeyDown(event, index),
            },
            selected ? h('span', { className: 'bis-tabIndicator', 'aria-hidden': 'true' }) : null,
            h('span', { className: 'bis-tabLabel' }, item.label),
          );
        }),
      );
    }

    /**
     * Ask row used before the project list is ready. Same heading, field, and chips as the live row.
     * @param props - translator.
     * @returns the disabled ask form.
     */
    function PendingAsk(props) {
      const t = props.t;
      return h(
        'form',
        { className: 'bis-ask' },
        h('h2', { className: 'bis-askHeading', id: 'bis-ask-heading' }, t('ask.label')),
        h(
          'div',
          { className: 'bis-askRow' },
          h(
            'span',
            { className: 'bis-askField' },
            h(Input, {
              id: 'bis-ask',
              className: 'bis-input',
              size: 'md',
              type: 'text',
              value: '',
              disabled: true,
              placeholder: t('ask.placeholderNoDomain'),
              autoComplete: 'off',
              'aria-labelledby': 'bis-ask-heading',
              readOnly: true,
            }),
          ),
          h(Button, { type: 'button', variant: 'primary', size: 'md', className: 'bis-askSubmit', disabled: true }, t('ask.send')),
        ),
        h(
          'div',
          { className: 'bis-suggests', role: 'group', 'aria-label': t('ask.label') },
          [0, 1, 2].map((slot) => h('span', { key: slot, className: 'bis-suggest bis-suggestSkeleton', 'aria-hidden': 'true' })),
        ),
      );
    }

    /**
     * Header plus the start screen. The header is always the first child.
     * @param header - the stable header.
     * @param body - start-screen children.
     * @returns the screen.
     */
    function PanelScreen(header, ...body) {
      return h('div', { className: 'bis-screen' }, header, h('div', { className: 'bis-growth' }, body));
    }

    /** A compact two-line result control shared by every saved-result list. */
    function ResultRow({ title, meta, onOpen, history, rowProps, buttonProps }) {
      return h('li', { className: 'bis-recentItem bis-recentCompact', ...rowProps },
        h(TruncatedTooltip, { label: `${title}\n${meta || ''}`, measuredLabel: true, measureSelector: '.bis-recentName,.bis-recentMeta', render: (ref) =>
          h(Button, { ref, variant: 'ghost', className: history ? 'bis-recentOpen bis-historyOpen' : 'bis-recentOpen', onClick: onOpen, ...buttonProps },
            h('span', { className: 'bis-recentText' },
              h('span', { className: 'bis-recentName' }, title),
              meta ? h('span', { className: 'bis-recentMeta' }, meta) : null,
            ),
            h('span', { className: 'bis-recentArrow', 'aria-hidden': 'true' }, h(PhosphorIcon, { name: 'CaretDown', size: 14 })),
          ) }),
      );
    }

    /**
     * Keep the native modal portal inside the visible plugin panel.
     * @param props - native Modal props plus the owning panel ref.
     * @returns the DSH modal with an anchor for its portal bounds.
     */
    function PanelModal(props) {
      const anchor = React.useRef(null);
      const { panelRef, children, ...modalProps } = props;
      React.useLayoutEffect(() => {
        if (modalProps.open !== true) return undefined;
        const panel = panelRef.current;
        const dialog = anchor.current && anchor.current.closest('.bis-modal');
        if (!panel || !dialog) return undefined;
        const root = dialog.parentElement;
        root.classList.add('bis-modalRoot');
        const place = () => {
          const bounds = panel.getBoundingClientRect();
          const width = document.documentElement.clientWidth;
          const height = window.innerHeight;
          let left = Math.max(0, bounds.left), right = Math.min(width, bounds.right);
          let top = Math.max(0, bounds.top), bottom = Math.min(height, bounds.bottom);
          for (let parent = panel.parentElement; parent && parent !== document.body && parent !== document.documentElement; parent = parent.parentElement) {
            const style = getComputedStyle(parent), rect = parent.getBoundingClientRect();
            if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
              left = Math.max(left, rect.left + parent.clientLeft);
              right = Math.min(right, rect.left + parent.clientLeft + parent.clientWidth);
            }
            if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
              top = Math.max(top, rect.top + parent.clientTop);
              bottom = Math.min(bottom, rect.top + parent.clientTop + parent.clientHeight);
            }
          }
          root.style.inset = `${top}px ${width - right}px ${height - bottom}px ${left}px`;
          // Apply to the actual native dialog, overriding its default size.
          dialog.style.width = `${Math.min(880, Math.max(0, right - left - 32))}px`;
          dialog.style.maxWidth = '880px';
          dialog.style.height = 'auto';
          dialog.style.minHeight = '0';
          dialog.style.setProperty('--bis-modal-max-height', `${Math.max(0, bottom - top - 64)}px`);
          const theme = getComputedStyle(panel);
          for (const token of ['--bis-outline-subtle', '--bis-outline-strong']) root.style.setProperty(token, theme.getPropertyValue(token));
        };
        place();
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null;
        if (observer) {
          observer.observe(panel);
          for (let parent = panel.parentElement; parent && parent !== document.body && parent !== document.documentElement; parent = parent.parentElement) observer.observe(parent);
        }
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
          if (observer) observer.disconnect();
          window.removeEventListener('resize', place);
          window.removeEventListener('scroll', place, true);
        };
      }, [panelRef, modalProps.open]);
      return modalProps.open === true ? h(Modal, modalProps, h('div', { className: 'bis-modalInner', ref: anchor }, children)) : null;
    }

    /**
     * Project picker, checklist, site audit, Search Console, and Analytics.
     * The Host shapes the numbers. This view only renders them.
     * @param props - translator, prompt starter, locale tag, and the sign-in action.
     * @returns the growth section.
     */
    function Growth(props) {
      const { t, startPrompt, localeTag, reconnect, version, expiryNote, busy, onRefresh, onDisconnect, onOpenPlugins, panelRef } = props;
      const locale = localeTag();
      const [projects, setProjects] = React.useState(null);
      const [projectsError, setProjectsError] = React.useState(null);
      const [origin, setOrigin] = React.useState(null);
      const [projectId, setProjectId] = React.useState(null);
      const [overview, setOverview] = React.useState(null);
      const [connectionSnapshot, setConnectionSnapshot] = React.useState(null);
      const [connectionsError, setConnectionsError] = React.useState(null);
      const [overviewError, setOverviewError] = React.useState(null);
      const [overviewSettled, setOverviewSettled] = React.useState(false);
      const [domain, setDomain] = React.useState('');
      const [pendingDomain, setPendingDomain] = React.useState(null);
      const [creating, setCreating] = React.useState(false);
      const [formError, setFormError] = React.useState(null);
      const [running, setRunning] = React.useState(false);
      const [auditOpen, setAuditOpen] = React.useState(false);
      const auditInstance = React.useRef(0);
      const [resultsOpen, setResultsOpen] = React.useState(false);
      const [auditToast, setAuditToast] = React.useState(false);
      const [auditStage, setAuditStage] = React.useState('scope');
      const [selectedRunId, setSelectedRunId] = React.useState(null);
      const [runAudit, setRunAudit] = React.useState(null);
      const [auditError, setAuditError] = React.useState(null);
      const [syncing, setSyncing] = React.useState(false);
      const [syncNotice, setSyncNotice] = React.useState(null);
      const [note, setNote] = React.useState(null);
      const [catalogRows, setWorkflows] = React.useState(null);
      const [catalogScope, setCatalogScope] = React.useState(null);
      const workflowScope = `${projectId ?? ''}:${locale}`;
      const workflows = catalogScope === workflowScope ? catalogRows : null;
      const [catalogError, setCatalogError] = React.useState(null);
      const [catalogBusy, setCatalogBusy] = React.useState(false);
      const [query, setQuery] = React.useState('');
      const [category, setCategory] = React.useState('all');
      const [providers, setProviders] = React.useState([]);
      const [providerMenu, setProviderMenu] = React.useState(false);
      const providerOptionsRef = React.useRef(null);
      const providerTriggerRef = React.useRef(null);
      const [catalogMore, setCatalogMore] = React.useState(false);
      const [dataOpen, setDataOpen] = React.useState(false);
      const [projectData, setProjectData] = React.useState({});
      const projectDataCache = React.useRef(new Map());
      const projectDataRequests = React.useRef(new Map());
      const [projectDataTry, setProjectDataTry] = React.useState(0);
      const [auditDetails, setAuditDetails] = React.useState({});
      const [auditDetailError, setAuditDetailError] = React.useState(null);
      const [auditDetailTry, setAuditDetailTry] = React.useState(0);
      const [auditView, setAuditView] = React.useState('findings');
      const [openFindings, setOpenFindings] = React.useState({});
      const [catalogNote, setCatalogNote] = React.useState(null);
      const [question, setQuestion] = React.useState('');
      const [askNote, setAskNote] = React.useState(null);
      const [workspaceNotice, setWorkspaceNotice] = React.useState(null);
      const [openingConversation, setOpeningConversation] = React.useState(false);
      const [workspaceNoticeError, setWorkspaceNoticeError] = React.useState(null);
      const workspaceNavigation = React.useRef(false);
      const [recent, setRecent] = React.useState(null);
      const [recentError, setRecentError] = React.useState(null);
      const [authExpired, setAuthExpired] = React.useState(false);
      const [projectMenu, setProjectMenu] = React.useState(false);
      const [settingsMenu, setSettingsMenu] = React.useState(false);
      const [tick, setTick] = React.useState(0);
      const alive = React.useRef(true);
      const confirmRef = React.useRef(null);
      const projectRef = React.useRef(null);
      const crawlRef = React.useRef(new Map());
      projectRef.current = projectId;

      React.useEffect(() => {
        workspaceNavigation.current = false;
        setOpeningConversation(false);
        setWorkspaceNoticeError(null);
        if (!workspaceNotice || typeof workspaceNotice.watchWorkspace !== 'function') return undefined;
        return workspaceNotice.watchWorkspace(() => setWorkspaceNotice((current) => current && current.requestId === workspaceNotice.requestId ? null : current));
      }, [workspaceNotice]);

      React.useEffect(() => {
        alive.current = true;
        return () => {
          alive.current = false;
        };
      }, []);

      React.useLayoutEffect(() => {
        const list = providerOptionsRef.current;
        if (!providerMenu || !list) return;
        // DSH Checkbox does not forward ARIA props to its native input.
        list.closest('[role="menu"]')?.setAttribute('aria-label', t('provider.filter'));
        for (const input of list.querySelectorAll('input[type="checkbox"]')) {
          input.setAttribute('role', 'menuitemcheckbox');
          input.setAttribute('aria-checked', input.checked ? 'true' : 'false');
        }
      }, [providerMenu, providers, workflows, locale]);
      React.useEffect(() => {
        if (!providerMenu || !providerOptionsRef.current) return undefined;
        let frame;
        const focusWhenVisible = () => {
          const list = providerOptionsRef.current;
          const popup = list && list.closest('[role="menu"]');
          if (!list || !popup) return;
          if (window.getComputedStyle(popup).visibility === 'hidden') {
            frame = window.requestAnimationFrame(focusWhenVisible);
            return;
          }
          if (!list.contains(document.activeElement)) list.querySelector('input[type="checkbox"]')?.focus();
        };
        frame = window.requestAnimationFrame(focusWhenVisible);
        return () => window.cancelAnimationFrame(frame);
      }, [providerMenu]);

      const FOCUS_GAP_MS = 60000;
      const FOCUS_DEBOUNCE_MS = 300;
      const lastFocusReload = React.useRef(Date.now());
      React.useEffect(() => {
        let timer = null;
        const onFocus = () => {
          if (timer !== null) clearTimeout(timer);
          timer = setTimeout(() => {
            timer = null;
            const now = Date.now();
            if (now - lastFocusReload.current < FOCUS_GAP_MS) return;
            lastFocusReload.current = now;
            setTick((value) => value + 1);
          }, FOCUS_DEBOUNCE_MS);
        };
        window.addEventListener('focus', onFocus);
        return () => {
          if (timer !== null) clearTimeout(timer);
          window.removeEventListener('focus', onFocus);
        };
      }, []);

      React.useEffect(() => {
        if (pendingDomain !== null && confirmRef.current !== null) confirmRef.current.focus();
      }, [pendingDomain]);

      React.useEffect(() => {
        let stop = false;
        const load = async () => {
          try {
            const body = await readRoute('/bisibility/projects');
            if (stop || !alive.current) return;
            const rows = Array.isArray(body.projects) ? body.projects : [];
            setAuthExpired(false);
            setProjectsError(null);
            setOrigin(typeof body.origin === 'string' ? body.origin : null);
            setProjects(rows);
            setProjectId((current) => (current !== null && rows.some((row) => row.id === current) ? current : rows[0] ? rows[0].id : null));
          } catch (error) {
            if (stop || !alive.current) return;
            if (signInNeeded(error)) setAuthExpired(true);
            setProjectsError(routeFailure(error));
          }
        };
        void load();
        return () => {
          stop = true;
        };
      }, [tick]);

      React.useEffect(() => {
        setOverview(null);
        setConnectionSnapshot(null);
        setConnectionsError(null);
        setOverviewError(null);
        setOverviewSettled(false);
        setRunAudit(null);
        setAuditError(null);
        setRunning(crawlRef.current.has(projectId));
        setSyncing(false);
        setSyncNotice(null);
        setNote(null);
        setCatalogNote(null);
        setAskNote(null);
        setQuestion('');
        setOpenFindings({});
        setAuditOpen(false);
        setResultsOpen(false);
        setAuditToast(false);
        setAuditStage('scope');
        setSelectedRunId(null);
        setRecent(null);
        setRecentError(null);
        setProjectData({});
        projectDataCache.current.clear();
        projectDataRequests.current.clear();
        setAuditDetails({});
        setAuditDetailError(null);
        setProjectMenu(false);
        setProviderMenu(false);
      }, [projectId]);

      React.useEffect(() => {
        if (auditOpen !== true) return undefined;
        const onKey = (event) => {
          if (event && event.key === 'Escape') setAuditOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [auditOpen]);

      React.useEffect(() => {
        if (projectId === null) return undefined;
        let stop = false;
        const load = async () => {
          try {
            const body = await readRoute(`/bisibility/overview?project=${encodeURIComponent(projectId)}`);
            if (stop || !alive.current) return;
            setAuthExpired(false);
            const usable = body !== null && typeof body === 'object' && !Array.isArray(body) && ('searchConsole' in body || 'checklist' in body || 'analytics' in body);
            if (!usable) {
              setOverview(null);
              setOverviewError(null);
              setOverviewSettled(true);
              return;
            }
            setOverview(body);
            setOverviewError(null);
            setOverviewSettled(true);
            if (typeof body.origin === 'string') setOrigin(body.origin);
          } catch (error) {
            if (stop || !alive.current) return;
            if (signInNeeded(error)) setAuthExpired(true);
            setOverviewError(routeFailure(error));
            setOverviewSettled(true);
          }
        };
        void load();
        return () => {
          stop = true;
        };
      }, [projectId, tick]);

      React.useEffect(() => {
        if (projectId === null) return undefined;
        let stop = false;
        void readRoute(`/bisibility/connections?project=${encodeURIComponent(projectId)}`).then((body) => {
          if (stop || !alive.current) return;
          if (!body || !body.searchConsole || !body.analytics) throw new Error('unreadable response');
          setConnectionSnapshot({ ...body, projectId });
          setConnectionsError(null);
        }).catch((error) => {
          if (stop || !alive.current) return;
          if (signInNeeded(error)) setAuthExpired(true);
          setConnectionsError(routeFailure(error));
        });
        return () => { stop = true; };
      }, [projectId, tick]);

      const currentConnections = connectionSnapshot !== null && connectionSnapshot.projectId === projectId ? connectionSnapshot : null;
      const gscConnected = currentConnections !== null && currentConnections.searchConsole.connected === true;
      const gaConnected = currentConnections !== null && currentConnections.analytics.connected === true;
      const wantsProjectData = dataOpen && projectId !== null && (gscConnected || gaConnected);
      // Each source has its own stable slot, error and short cache. A close/reopen while
      // pending subscribes to the same promise; focus revalidates expired entries, without polling.
      React.useEffect(() => {
        if (projectId === null) return undefined;
        let stop = false;
        for (const source of ['search', 'indexing', 'analytics']) {
          const key = `${projectId}:${source}`;
          const enabled = source === 'analytics' ? gaConnected : gscConnected;
          if (!enabled) {
            projectDataCache.current.delete(key);
            projectDataRequests.current.delete(key);
            continue;
          }
          if (!dataOpen) continue;
          const cached = projectDataCache.current.get(key);
          if (cached && Date.now() - cached.loadedAt < FOCUS_GAP_MS) {
            setProjectData((current) => ({ ...current, [source]: cached }));
            continue;
          }
          setProjectData((current) => ({ ...current, [source]: { loading: true } }));
          let request = projectDataRequests.current.get(key);
          if (!request) {
            request = readRoute(`/bisibility/project-data?project=${encodeURIComponent(projectId)}&source=${source}`).then((body) => {
              const field = source === 'search' ? 'searchConsole' : source;
              if (!body || !body[field] || typeof body[field] !== 'object') throw new Error('unreadable response');
              return { body, error: null, loadedAt: Date.now() };
            }).catch((error) => ({ body: null, error: routeFailure(error), loadedAt: Date.now(), signIn: signInNeeded(error) })).then((entry) => {
              if (projectDataRequests.current.get(key) === request) projectDataCache.current.set(key, entry);
              return entry;
            }).finally(() => {
              if (projectDataRequests.current.get(key) === request) projectDataRequests.current.delete(key);
            });
            projectDataRequests.current.set(key, request);
          }
          void request.then((entry) => {
            if (stop || !alive.current) return;
            if (entry.signIn) setAuthExpired(true);
            setProjectData((current) => ({ ...current, [source]: entry }));
          });
        }
        return () => { stop = true; };
      }, [dataOpen, projectId, gscConnected, gaConnected, tick, projectDataTry]);

      React.useEffect(() => {
        if (projectId === null) {
          setRecent({ audits: [], reports: [] });
          setRecentError(null);
          return undefined;
        }
        let stop = false;
        const load = async () => {
          try {
            const body = await readRoute(`/bisibility/recent?project=${encodeURIComponent(projectId)}`);
            if (stop || !alive.current) return;
            setAuthExpired(false);
            setRecent({
              audits: Array.isArray(body.audits) ? body.audits : [],
              reports: Array.isArray(body.reports) ? body.reports : [],
            });
            setRecentError(null);
          } catch (error) {
            if (stop || !alive.current) return;
            if (signInNeeded(error)) setAuthExpired(true);
            setRecentError(routeFailure(error));
          }
        };
        void load();
        return () => {
          stop = true;
        };
      }, [projectId, tick]);

      React.useEffect(() => {
        if (projects === null) return undefined;
        let stop = false;
        const load = async () => {
          setCatalogBusy(true);
          setCatalogError(null);
          const params = new URLSearchParams();
          params.set('locale', locale);
          if (projectId !== null) params.set('project', projectId);
          try {
            const body = await readRoute(`/bisibility/workflows?${params.toString()}`);
            if (stop || !alive.current) return;
            setAuthExpired(false);
            setWorkflows(Array.isArray(body.workflows) ? body.workflows : []);
            setCatalogScope(workflowScope);
            setCatalogError(null);
          } catch (error) {
            if (stop || !alive.current) return;
            if (signInNeeded(error)) setAuthExpired(true);
            setCatalogError(routeFailure(error));
          } finally {
            if (!stop && alive.current) setCatalogBusy(false);
          }
        };
        void load();
        return () => {
          stop = true;
        };
      }, [projects, projectId, tick, locale]);

      const selected = projects === null ? null : projects.find((row) => row.id === projectId) || null;
      const audit = runAudit || (overview !== null ? overview.audit : null);

      const sessionText = (error) => {
        const text = `${error && error.code ? error.code : ''} ${error && error.message ? error.message : ''}`;
        if (text.indexOf('draft.workspaceRequired') !== -1) return t('session.workspaceRequired');
        return error && typeof error.message === 'string' && error.message.length > 0 ? error.message : t('session.failed');
      };

      const promptAttempt = React.useRef(0);
      const prefill = async (prompt, setMessage, initiatingAudit = null) => {
        const write = typeof setMessage === 'function' ? setMessage : setNote;
        const attempt = ++promptAttempt.current;
        setNote(null);
        setAskNote(null);
        setCatalogNote(null);
        try {
          const result = await startPrompt(prompt, { whenDraftExists: 'replace' });
          if (!alive.current || attempt !== promptAttempt.current) return;
          if (result && result.status === 'ready') {
            setWorkspaceNotice(null);
            write(t('session.ready'));
          } else if (result && result.status === 'copied') {
            if (initiatingAudit !== null && initiatingAudit === auditInstance.current) setAuditOpen(false);
            setWorkspaceNotice({ ...result, requestId: attempt });
          } else if (result && result.ok === false) write(result.error && result.error.message || t('session.failed'));
          else write(t('session.failed'));
        } catch (error) {
          if (alive.current && attempt === promptAttempt.current) write(sessionText(error));
        }
      };

      const openCopiedConversation = async () => {
        if (workspaceNavigation.current || !workspaceNotice || typeof workspaceNotice.openConversation !== 'function') return;
        workspaceNavigation.current = true;
        setOpeningConversation(true);
        try {
          await workspaceNotice.openConversation();
          // Successful navigation unmounts this panel. Keep the action latched.
        } catch (error) {
          if (!alive.current) return;
          workspaceNavigation.current = false;
          setOpeningConversation(false);
          setWorkspaceNoticeError(sessionText(error));
        }
      };

      const explainAudit = () => {
        const viewed = shownAudit !== null && typeof shownAudit.id === 'string' ? shownAudit : null;
        const id = viewed !== null ? viewed.id : selectedRunId;
        if (typeof id !== 'string' || id === '') return;
        const domainName = selected !== null && typeof selected.domain === 'string' ? selected.domain : '';
        const chosen = viewed !== null && Array.isArray(viewed.topIssues) && viewed.topIssues.length > 0 ? viewed.topIssues[0] : null;
        const urls = chosen !== null && Array.isArray(chosen.urls) ? chosen.urls : chosen !== null && typeof chosen.url === 'string' ? [chosen.url] : [];
        const review = t('audit.review', { id, domain: domainName });
        const findingText =
          chosen === null
            ? ''
            : ` ${t('audit.findingLine', {
                message: chosen.message || chosen.code || '',
                code: chosen.code || '',
                severity: chosen.severity || '',
              })}`;
        const urlText = urls.length === 0 ? '' : `\n${t('audit.urlsLead')}\n${urls.join('\n')}`;
        prefill(`/seo-audit ${review}${findingText}${urlText}`, undefined, auditInstance.current);
      };

      const explainIndex = () => {
        const indexing = projectData.indexing && projectData.indexing.body ? projectData.indexing.body.indexing : null;
        const domainName = selected !== null && typeof selected.domain === 'string' ? selected.domain : '';
        const urls = indexing !== null && Array.isArray(indexing.urls) ? indexing.urls : [];
        const count = indexing !== null && typeof indexing.notIndexed === 'number' ? indexing.notIndexed : 0;
        const detail = t('search.indexingDraft', { count, domain: domainName }) + (urls.length > 0 ? `\n${urls.join('\n')}` : '');
        prefill(`/seo-audit ${detail}`);
      };

      const sendAsk = (text, skill) => {
        const trimmed = typeof text === 'string' ? text.trim() : '';
        if (trimmed === '') return;
        const domainName = selected !== null && typeof selected.domain === 'string' ? selected.domain.trim() : '';
        const body = domainName === '' ? trimmed : `${trimmed} for ${domainName}`;
        const prompt = typeof skill === 'string' && skill !== '' ? `/${skill} ${body}` : body;
        prefill(prompt, setAskNote);
        setQuestion('');
      };

      const featuredPrompt = (step) => {
        if (step === null || step === undefined) return null;
        if (step.skill !== 'project-setup' && step.skill !== 'rank-tracking-report') return null;
        const domainName = selected !== null && typeof selected.domain === 'string' ? selected.domain.trim() : '';
        const template = domainName === '' ? t(`next.${step.id}.promptNoDomain`) : t(`next.${step.id}.prompt`).replaceAll('{domain}', domainName);
        const trimmed = typeof template === 'string' ? template.trim() : '';
        if (trimmed === '') return null;
        return `/${step.skill} ${trimmed}`;
      };

      /**
       * Providers page for one connection.
       * Desktop DSH opens an http(s) `target=_blank` link in the system browser
       * and denies the popup (`/private/tmp/dsh-asar-yNNB/lib/main.js:11970`).
       * The anchor never assigns this window. `window.open` with `noopener`
       * returns null even when a tab opened, so there is no location fallback.
       * @param provider - `gsc` or `ga4`.
       * @returns the absolute URL, or null until the project and origin are known.
       */
      const providerHref = (provider) => {
        if (origin === null || projectId === null) return null;
        const hash = provider === 'gsc' ? '#provider-gsc' : '';
        return `${origin}/app/${projectId}/providers?connect=${provider}${hash}`;
      };

      /**
       * @param provider - `gsc` or `ga4`.
       * @param label - visible text.
       * @param className - button classes.
       * @returns an external anchor, or a disabled button before the URL exists.
       */
      const providerLink = (provider, label, className) => {
        const href = providerHref(provider);
        if (href === null) return h('button', { type: 'button', className, disabled: true }, label);
        return h('a', { className, href, target: '_blank', rel: 'noopener noreferrer' }, label);
      };

      const askCreate = (event) => {
        event.preventDefault();
        const normalized = domain.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
        if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(normalized)) {
          setFormError(t('project.invalid'));
          return;
        }
        setFormError(null);
        setPendingDomain(normalized);
      };

      const commitCreate = async () => {
        setCreating(true);
        setFormError(null);
        try {
          const body = await readRoute('/bisibility/projects', {
            method: 'POST',
            body: { domain: pendingDomain, name: pendingDomain, confirm: true },
          });
          if (!alive.current) return;
          setPendingDomain(null);
          setDomain('');
          if (body.project && typeof body.project.id === 'string') setProjectId(body.project.id);
          setTick((value) => value + 1);
        } catch (error) {
          if (!alive.current) return;
          if (signInNeeded(error)) setAuthExpired(true);
          setFormError(error.message);
        } finally {
          if (alive.current) setCreating(false);
        }
      };

      const runCrawl = async () => {
        const started = projectRef.current;
        if (started === null || crawlRef.current.has(started)) return;
        const operation = {};
        const instance = auditInstance.current;
        crawlRef.current.set(started, operation);
        setRunning(true);
        setAuditError(null);
        try {
          const body = await readRoute('/bisibility/audit', { method: 'POST', body: { project: started } });
          if (!alive.current || projectRef.current !== started || crawlRef.current.get(started) !== operation) return;
          setRunAudit(body.audit);
          if (auditInstance.current === instance && typeof body.audit?.id === 'string') setSelectedRunId(body.audit.id);
          if (body.audit !== null && typeof body.audit === 'object') setAuditToast(true);
          setTick((value) => value + 1);
        } catch (error) {
          if (!alive.current || projectRef.current !== started || crawlRef.current.get(started) !== operation) return;
          if (signInNeeded(error)) setAuthExpired(true);
          setAuditError(routeFailure(error));
        } finally {
          if (crawlRef.current.get(started) !== operation) return;
          crawlRef.current.delete(started);
          if (!alive.current || projectRef.current !== started) return;
          setRunning(false);
          setAuditStage((stage) => (stage === 'progress' ? 'result' : stage));
        }
      };

      const refreshTraffic = async () => {
        const started = projectRef.current;
        if (started === null) return;
        setSyncing(true);
        setSyncNotice(null);
        try {
          const body = await readRoute('/bisibility/traffic', { method: 'POST', body: { project: started } });
          if (!alive.current || projectRef.current !== started) return;
          if (body.rateLimited === true) setSyncNotice(t('analytics.rateLimited'));
          else if (body.needsReauth === true) setSyncNotice(t('analytics.reauth'));
          setProjectData({});
          projectDataCache.current.clear();
          setProjectDataTry((value) => value + 1);
          setTick((value) => value + 1);
        } catch (error) {
          if (!alive.current || projectRef.current !== started) return;
          if (signInNeeded(error)) setAuthExpired(true);
          setSyncNotice(error.message);
        } finally {
          if (alive.current && projectRef.current === started) setSyncing(false);
        }
      };

      /**
       * A saved audit that already carries its findings or pages.
       * @param row - an audit summary.
       * @returns the row, or null when only the list fields are known.
       */
      const fullAudit = (row) => (row !== null && typeof row === 'object' && (Array.isArray(row.topIssues) || Array.isArray(row.pages)) ? row : null);

      /**
       * `get_site_audit` runs only when the audit modal opens on a saved run, once per run.
       * The run is the selected one, or the newest. Hooks stay above the first early return (`authExpired`).
       */
      const savedRunIds = [];
      if (audit !== null && typeof audit.id === 'string') savedRunIds.push(audit.id);
      for (const row of recent !== null && Array.isArray(recent.audits) ? recent.audits : []) {
        if (row !== null && typeof row === 'object' && typeof row.id === 'string' && !savedRunIds.includes(row.id)) savedRunIds.push(row.id);
      }
      const viewedRunId = savedRunIds.includes(selectedRunId) ? selectedRunId : savedRunIds.length > 0 ? savedRunIds[0] : null;
      const viewedRow =
        viewedRunId === null
          ? null
          : audit !== null && audit.id === viewedRunId
            ? audit
            : (recent !== null && Array.isArray(recent.audits) ? recent.audits : []).find((row) => row !== null && row.id === viewedRunId) || null;
      const viewedLoaded = viewedRunId !== null && (fullAudit(viewedRow) !== null || auditDetails[viewedRunId] !== undefined);
      const detailId = auditOpen === true && auditStage === 'result' && viewedRunId !== null && !viewedLoaded && projectId !== null ? viewedRunId : null;
      const detailFailed = auditDetailError !== null && auditDetailError.id === detailId;
      React.useEffect(() => {
        if (detailId === null || detailFailed) return undefined;
        let stop = false;
        const load = async () => {
          try {
            const body = await readRoute(`/bisibility/audit?project=${encodeURIComponent(projectId)}&id=${encodeURIComponent(detailId)}`);
            if (stop || !alive.current) return;
            setAuthExpired(false);
            if (body !== null && typeof body === 'object' && body.audit !== null && typeof body.audit === 'object') {
              setAuditDetails((current) => ({ ...current, [detailId]: body.audit }));
            } else {
              setAuditDetailError({ id: detailId, error: routeFailure(new Error('unreadable response')) });
            }
          } catch (error) {
            if (stop || !alive.current) return;
            if (signInNeeded(error)) setAuthExpired(true);
            setAuditDetailError({ id: detailId, error: routeFailure(error) });
          }
        };
        void load();
        return () => {
          stop = true;
        };
      }, [detailId, projectId, auditDetailTry, detailFailed]);

      if (authExpired) {
        return h(
          'div',
          { className: 'bis-notice', role: 'alert' },
          h('p', { className: 'bis-statusDetail' }, t('error.signIn')),
          h(
            'div',
            { className: 'bis-actions' },
            h(
              'button',
              { type: 'button', className: 'bis-button bis-primary', onClick: reconnect },
              t('connect.action'),
            ),
          ),
        );
      }

      const header = (current) =>
        h(StartHeader, {
          t,
          panelRef,
          projects,
          projectId,
          setProjectId,
          selected: current,
          projectMenu,
          setProjectMenu,
          settingsMenu,
          setSettingsMenu,
          version,
          expiryNote,
          busy,
          onRefresh,
          onDisconnect,
          onOpenPlugins,
          projectPending: projects === null,
          statusPending: false,
          statusText: t('status.connected'),
          dot: 'success',
          onOpenSurface: (surface) => {
            setCategory(surface);
            setCatalogMore(true);
            setQuery('');
          },
        });

      if (projects === null) {
        if (projectsError !== null) {
          return PanelScreen(header(null), h(LoadFailure, { t, error: projectsError, fallback: 'failure.projects', onRetry: () => setTick((value) => value + 1) }));
        }
        return PanelScreen(
          header(null),
          h(PendingAsk, { t }),
          h(CatalogSkeleton, { t }),
          h('div', { className: 'bis-connections', 'aria-hidden': 'true' }, h('span', { className: 'bis-skeleton bis-skeletonShort' })),
        );
      }

      const flags = overview !== null && overview.checklist ? overview.checklist : null;
      const checklist =
        projects.length > 0 && flags === null && overviewError === null
          ? h('div', { className: 'bis-checklist', role: 'status', 'aria-label': t('loading') }, h('div', { className: 'bis-skeleton' }))
          : h(
              'ul',
              { className: 'bis-checklist' },
              [
                ['audit', 'checklist.audit', 'checklist.auditDone'],
                ['searchConsole', 'checklist.search', 'checklist.searchDone'],
                ['analytics', 'checklist.analytics', 'checklist.analyticsDone'],
                ['keywords', 'checklist.keywords', 'checklist.keywordsDone'],
              ].map(([key, idle, done]) =>
                h(
                  'li',
                  { key, className: 'bis-check', 'data-done': flags !== null && flags[key] === true ? 'true' : 'false' },
                  h('span', {
                    className: 'bis-dot',
                    'data-state': flags !== null && flags[key] === true ? 'ok' : undefined,
                    'aria-hidden': 'true',
                  }),
                  h('span', null, flags !== null && flags[key] === true ? t(done) : t(idle)),
                ),
              ),
            );

      const projectPicker =
        projects.length === 0
          ? h(
              'div',
              { className: 'bis-card' },
              h('h2', { className: 'bis-cardTitle' }, t('project.label')),
              h('p', { className: 'bis-copy' }, t('project.empty')),
              pendingDomain === null
                ? h(
                    'form',
                    { className: 'bis-field', onSubmit: askCreate },
                    h('label', { className: 'bis-label', htmlFor: 'bis-domain' }, t('project.domain')),
                    h('input', {
                      id: 'bis-domain',
                      className: 'bis-input',
                      value: domain,
                      autoComplete: 'off',
                      spellCheck: 'false',
                      inputMode: 'url',
                      onChange: (event) => setDomain(event.target.value),
                    }),
                    h(
                      'div',
                      { className: 'bis-actions' },
                      h(
                        'button',
                        { type: 'submit', className: 'bis-button bis-primary' },
                        t('project.create'),
                      ),
                    ),
                  )
                : h(
                    'div',
                    { className: 'bis-field' },
                    h('p', { className: 'bis-copy' }, t('project.confirm', { domain: pendingDomain })),
                    h(
                      'div',
                      { className: 'bis-actions' },
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'bis-button bis-primary',
                          ref: confirmRef,
                          onClick: () => void commitCreate(),
                          disabled: creating,
                        },
                        creating ? t('project.creating') : t('project.create'),
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'bis-button',
                          onClick: () => setPendingDomain(null),
                          disabled: creating,
                        },
                        t('project.cancel'),
                      ),
                    ),
                  ),
              formError !== null ? h('pre', { className: 'bis-error' }, formError) : null,
            )
          : null;

      const connections = currentConnections !== null ? currentConnections.searchConsole : null;
      const search = gscConnected && projectData.search && projectData.search.body ? projectData.search.body.searchConsole : connections === null ? null : { ...connections, previous: null, clicks: null, impressions: null, indexing: null, queries: [] };
      const analytics = gaConnected && projectData.analytics && projectData.analytics.body ? projectData.analytics.body.analytics : currentConnections !== null ? currentConnections.analytics : null;
      const trendPoints =
        search !== null && search.connected === true
          ? [search.previous !== null ? search.previous.clicks : null, search.clicks].filter((value) => typeof value === 'number')
          : [];
      const sessionPoints = analytics !== null && Array.isArray(analytics.sessions) ? analytics.sessions.map((row) => row.sessions) : [];
      const sessionTotal = sessionPoints.length > 0 ? sessionPoints[sessionPoints.length - 1] : null;
      const savedAuditError =
        overview !== null && overview.auditError !== null && typeof overview.auditError === 'object' && typeof overview.auditError.message === 'string'
          ? overview.auditError
          : null;
      const shownAuditError = auditError !== null ? auditError : savedAuditError;
      const billingUrl = `${origin}/app/${projectId}/settings/billing`;
      const auditAccessCopy = [
        t('audit.gate'),
        ' ',
        h('a', { className: 'bis-link', href: billingUrl, target: '_blank', rel: 'noopener noreferrer' }, t('audit.billing')),
      ];
      const auditAccessNote = h('p', { className: 'bis-auditGate' }, ...auditAccessCopy);
      // The MCP wrapper preserves the shared operation denial as HTTP 403 plus this message.
      // Match only a failed crawl, not every permission error or a saved-audit read.
      const auditAccessDenied = auditError !== null && auditError.status === 403 && auditError.message === 'This operation is unavailable for this project.';
      const auditFailure = shownAuditError === null
        ? null
        : auditAccessDenied
          ? h('div', { className: 'bis-failure', role: 'alert' }, h('p', { className: 'bis-failureText' }, t('audit.denied')), auditAccessNote)
          : h('pre', { className: 'bis-error' }, shownAuditError.message);

      const historyRuns = [];
      const addHistoryRun = (row) => {
        if (!row || typeof row.id !== 'string' || historyRuns.some((item) => item.id === row.id)) return;
        const detail = auditDetails[row.id] || fullAudit(row) || null;
        historyRuns.push({
          id: row.id,
          createdAt: detail && detail.createdAt || row.createdAt || null,
          pages: detail && typeof detail.pagesCrawled === 'number' ? detail.pagesCrawled : typeof row.pagesCrawled === 'number' ? row.pagesCrawled : null,
          status: detail && (detail.stopReason || detail.state) || row.stopReason || row.status || row.state || 'saved',
          detail,
        });
      };
      addHistoryRun(audit);
      for (const row of recent !== null && Array.isArray(recent.audits) ? recent.audits : []) addHistoryRun(row);
      const activeRun = historyRuns.find((item) => item.id === selectedRunId) || historyRuns[0] || null;
      const shownAudit = activeRun !== null && activeRun.detail !== null && activeRun.detail !== undefined ? activeRun.detail : null;
      const detailLoading = detailId !== null && !detailFailed;
      const auditViews =
        shownAudit === null
          ? []
          : [
              Array.isArray(shownAudit.topIssues) && shownAudit.topIssues.length > 0 ? 'findings' : null,
              Array.isArray(shownAudit.pages) && shownAudit.pages.some((page) => page && typeof page.url === 'string' && page.url !== '') ? 'pages' : null,
              typeof shownAudit.stopReason === 'string' ||
              typeof shownAudit.requests === 'number' ||
              typeof shownAudit.state === 'string' ||
              (shownAudit.summary && ['pages', 'errors', 'warnings', 'indexable'].some((key) => typeof shownAudit.summary[key] === 'number')) ||
              (shownAudit.limits !== null && shownAudit.limits !== undefined)
                ? 'details'
                : null,
            ].filter((view) => view !== null);
      const modalViews = auditViews.concat(['history']);
      const activeAuditView = modalViews.includes(auditView) ? auditView : modalViews[0] || 'history';
      const pageCountLabel = shownAudit === null || typeof shownAudit.pagesCrawled !== 'number' ? '' : t('audit.pages', { count: formatNumber(shownAudit.pagesCrawled, locale) });
      const auditDomain = selected !== null && typeof selected.domain === 'string' ? selected.domain.trim() : '';
      const auditTitle = auditDomain === '' ? t('audit.title') : t('audit.titleDomain', { domain: auditDomain });
      const auditDate = shownAudit !== null && shownAudit.createdAt ? formatDate(shownAudit.createdAt, locale) : activeRun !== null && activeRun.createdAt ? formatDate(activeRun.createdAt, locale) : '';
      const pagesText =
        pageCountLabel !== ''
          ? pageCountLabel
          : activeRun !== null && typeof activeRun.pages === 'number'
            ? t('audit.pages', { count: formatNumber(activeRun.pages, locale) })
            : '';
      const metaStatus =
        activeRun === null
          ? ''
          : activeRun.status === 'finished' || activeRun.status === 'saved'
            ? t('audit.completed')
            : stopLabel(activeRun.status, t);
      const runSummary =
        shownAudit === null && activeRun === null ? '' : [metaStatus, auditDate, pagesText].filter((part) => part !== '').join(' · ');
      const closeAudit = () => setAuditOpen(false);
      const latestRun = historyRuns[0] || null;
      /**
       * @param stage - `scope` (preparation), `progress`, or `result`.
       * @param runId - the saved run to show, or null for the latest one.
       */
      const openAudit = (stage, runId) => {
        auditInstance.current += 1;
        setAuditToast(false);
        setResultsOpen(false);
        setAuditStage(stage);
        setSelectedRunId(typeof runId === 'string' ? runId : null);
        setAuditView('findings');
        setAuditOpen(true);
      };
      const auditFooter =
        auditStage === 'result'
          ? h(
              'div',
              { className: 'bis-auditActions' },
              h(Button, { variant: 'primary', onClick: explainAudit }, t('audit.explain')),
              h(Button, { variant: 'outline', onClick: () => setAuditStage('scope'), disabled: running }, t('audit.again')),
              auditViews.includes('findings') && activeAuditView !== 'findings'
                ? h(Button, { variant: 'outline', onClick: () => setAuditView('findings') }, t('audit.viewFindings'))
                : null,
              auditAccessNote,
            )
          : undefined;
      const auditModal =
        auditOpen !== true
          ? null
          : h(
              PanelModal,
              {
                panelRef,
                open: true,
                title: auditTitle,
                closeLabel: t('audit.close'),
                onClose: closeAudit,
                className: auditStage === 'result' ? 'bis-modal bis-auditResult' : 'bis-modal',
                contentClassName: 'bis-modalContent',
                description: auditStage === 'result' && runSummary !== '' ? runSummary : undefined,
                footer: auditFooter,
              },
              auditStage === 'progress'
                  ? h(
                      'div',
                      { role: 'status', 'aria-live': 'polite' },
                      h('p', { className: 'bis-statusDetail' }, t('audit.running')),
                      h('div', { className: 'bis-skeleton' }),
                      h('div', { className: 'bis-skeleton bis-skeletonShort' }),
                      auditFailure,
                    )
                  : auditStage === 'scope'
                    ? h(
                        'div',
                        { className: 'bis-auditPrep' },
                        h(
                          'ul',
                          { className: 'bis-queries' },
                          [
                            [t('audit.prep.domain'), auditDomain === '' ? '-' : auditDomain],
                            [t('audit.prep.scope'), t('audit.limit')],
                            [t('audit.prep.access'), h('span', null, ...auditAccessCopy)],
                          ].map(([label, value]) =>
                            h('li', { key: label, className: 'bis-query bis-prepRow' }, h('span', { className: 'bis-queryName' }, label), h('div', { className: 'bis-prepValue' }, value)),
                          ),
                        ),
                        auditFailure,
                        h(
                          'div',
                          { className: 'bis-actions' },
                          h(
                            Button,
                            {
                              variant: 'primary',
                              onClick: () => {
                                setAuditStage('progress');
                                void runCrawl();
                              },
                              disabled: running || overview === null,
                            },
                            t('audit.start'),
                          ),
                        ),
                      )
                    : detailLoading
                      ? h(
                          'div',
                          { className: 'bis-auditPane', role: 'status', 'aria-busy': 'true', 'aria-label': t('loading') },
                          h('div', { className: 'bis-auditTabs' }, h('div', { className: 'bis-skeleton bis-skeletonField' })),
                          h('div', { className: 'bis-skeleton bis-skeletonShort' }),
                          h('div', { className: 'bis-skeleton' }),
                        )
                      : h(
                        'div',
                        { className: 'bis-auditPane', 'aria-busy': running ? 'true' : 'false' },
                        detailFailed
                          ? h(LoadFailure, {
                              t,
                              error: auditDetailError.error,
                              fallback: 'failure.audit',
                              onRetry: () => {
                                setAuditDetailError(null);
                                setAuditDetailTry((value) => value + 1);
                              },
                            })
                          : null,
                        h(
                          'div',
                          { className: 'bis-auditTabs' },
                          h(FilterTabs, {
                            className: 'bis-auditTabList',
                            label: t('audit.title'),
                            value: activeAuditView,
                            items: modalViews.map((view) => ({ value: view, label: t(`audit.tab.${view}`) })),
                            onChange: setAuditView,
                          }),
                        ),
                        activeAuditView === 'history'
                          ? h(
                              'ul',
                              { className: 'bis-recentList' },
                              historyRuns.map((run) => h(ResultRow, {
                                key: run.id,
                                history: true,
                                title: [formatDate(run.createdAt, locale), formatClock(run.createdAt, locale)].filter(Boolean).join(' · ') || t('audit.historyFallback'),
                                meta: [run.status === 'saved' || run.status === 'finished' ? t('audit.completed') : stopLabel(run.status, t), typeof run.pages === 'number' ? t('audit.pages', { count: formatNumber(run.pages, locale) }) : ''].filter(Boolean).join(' · '),
                                buttonProps: { 'data-audit-history': run.id, 'aria-current': run.id === (activeRun && activeRun.id) ? 'true' : undefined },
                                onOpen: () => {
                                  setSelectedRunId(run.id);
                                  setAuditView('findings');
                                },
                              })),
                            )
                          : null,
                        activeAuditView === 'findings' && shownAudit !== null && Array.isArray(shownAudit.topIssues) && shownAudit.topIssues.length > 0
                          ? h(
                              'ul',
                              { className: 'bis-findings' },
                              shownAudit.topIssues.slice(0, 8).map((issue) => {
                                const key = `${issue.severity}-${issue.code}-${issue.message}`;
                                const issueUrls = Array.isArray(issue.urls)
                                  ? issue.urls.filter((url) => typeof url === 'string' && url !== '')
                                  : typeof issue.url === 'string' && issue.url !== ''
                                    ? [issue.url]
                                    : [];
                                const shownUrls = openFindings[key] === true ? issueUrls : issueUrls.slice(0, 3);
                                const hidden = issueUrls.length - shownUrls.length;
                                const countLabel = issueCountLabel(issue, locale);
                                return h(
                                  'li',
                                  { key, className: 'bis-finding' },
                                  h(
                                    'div',
                                    { className: 'bis-findingHead' },
                                    h('span', { className: 'bis-findingTitle' }, issue.message || issue.code),
                                    typeof issue.severity === 'string' && issue.severity !== '' ? h(Tag, null, issue.severity) : null,
                                    countLabel === '' ? null : h('span', { className: 'bis-findingCount' }, countLabel),
                                  ),
                                  shownUrls.length === 0
                                    ? null
                                    : h(
                                        'ul',
                                        { className: 'bis-findingUrls' },
                                        shownUrls.map((url) =>
                                          h(
                                            'li',
                                            { key: url },
                                            h(TruncatedTooltip, { label: url, side: 'top', maxWidth: 640, render: (ref) => h(
                                              'a',
                                              { ref, className: 'bis-findingUrl', href: url, target: '_blank', rel: 'noopener noreferrer' },
                                              url,
                                            ) }),
                                          ),
                                        ),
                                      ),
                                  hidden > 0
                                    ? h(
                                        Button,
                                        {
                                          variant: 'ghost',
                                          onClick: () => setOpenFindings((current) => ({ ...current, [key]: true })),
                                        },
                                        t('audit.showMore', { count: formatNumber(hidden, locale) }),
                                      )
                                    : null,
                                );
                              }),
                            )
                          : null,
                        activeAuditView === 'pages' && shownAudit !== null && Array.isArray(shownAudit.pages)
                          ? h(
                              'ul',
                              { className: 'bis-queries' },
                              shownAudit.pages.map((page) =>
                                h(
                                  'li',
                                  { key: page.url, className: 'bis-query' },
                                  h('span', { className: 'bis-queryName' }, page.url),
                                  page.status === null || page.status === undefined ? null : h('span', null, String(page.status)),
                                ),
                              ),
                            )
                          : null,
                        activeAuditView === 'details'
                          ? h(
                              'ul',
                              { className: 'bis-queries' },
                              [
                                shownAudit !== null && typeof shownAudit.stopReason === 'string' ? ['stopReason', stopLabel(shownAudit.stopReason, t)] : null,
                                shownAudit !== null && typeof shownAudit.state === 'string' ? ['state', shownAudit.state] : null,
                                shownAudit !== null && typeof shownAudit.requests === 'number' ? ['requests', formatNumber(shownAudit.requests, locale)] : null,
                                ...(shownAudit !== null && shownAudit.summary && typeof shownAudit.summary === 'object'
                                  ? Object.entries(shownAudit.summary).map(([key, value]) => [key, formatNumber(value, locale)])
                                  : []),
                              ]
                                .filter((row) => row !== null)
                                .map(([key, value]) => h('li', { key, className: 'bis-query' }, h('span', { className: 'bis-queryName' }, key), h('span', null, value))),
                            )
                          : null,
                      ),
                auditStage === 'result' ? auditFailure : null,
                note !== null ? h('p', { className: 'bis-statusDetail' }, note) : null,
            );

      const searchCard =
        projectId === null
          ? null
          : overview === null && overviewError === null
            ? h(SkeletonCard, { t })
            : search === null
              ? null
              : h(
                  'section',
                  { className: 'bis-card' },
                  h('h2', { className: 'bis-cardTitle' }, t('search.title')),
                  search.connected !== true
                    ? h(
                        'div',
                        null,
                        search.needsReauth === true ? h('p', { className: 'bis-statusDetail' }, t('search.reauth')) : null,
                        h(
                          'div',
                          { className: 'bis-actions' },
                          providerLink('gsc', t('search.connect'), 'bis-button bis-primary'),
                        ),
                        h('p', { className: 'bis-hint bis-statusDetail' }, t('search.hint')),
                      )
                    : h(
                        'div',
                        null,
                        h(
                          'div',
                          { className: 'bis-metrics' },
                          h(
                            'div',
                            null,
                            h('p', { className: 'bis-metricValue' }, formatNumber(search.clicks, locale)),
                            h('p', { className: 'bis-metricLabel' }, t('search.clicks')),
                          ),
                          h(
                            'div',
                            null,
                            h('p', { className: 'bis-metricValue' }, formatNumber(search.impressions, locale)),
                            h('p', { className: 'bis-metricLabel' }, t('search.impressions')),
                          ),
                        ),
                        h(Sparkline, {
                          points: trendPoints,
                          label:
                            search.previous === null
                              ? t('search.clicks')
                              : t('search.trend', {
                                  current: formatNumber(search.clicks, locale),
                                  previous: formatNumber(search.previous.clicks, locale),
                                }),
                        }),
                        h('p', { className: 'bis-metricLabel' }, t('search.queries')),
                        Array.isArray(search.queries) && search.queries.length > 0
                          ? h(
                              'ul',
                              { className: 'bis-queries' },
                              search.queries.map((row) =>
                                h(
                                  'li',
                                  { key: row.query, className: 'bis-query' },
                                  h('span', { className: 'bis-queryName' }, row.query),
                                  h(
                                    'span',
                                    null,
                                    `${formatNumber(row.clicks, locale)} / ${formatNumber(row.impressions, locale)}${row.position === null ? '' : ` (${formatPosition(row.position, locale)})`}`,
                                  ),
                                ),
                              ),
                            )
                          : h('p', { className: 'bis-statusDetail' }, t('search.queriesEmpty')),
                        search.indexing !== null
                          ? h(
                              'div',
                              { className: 'bis-actions' },
                              h('p', { className: 'bis-statusDetail' }, t('search.indexing', { count: formatNumber(search.indexing.notIndexed, locale) })),
                              search.indexing.notIndexed > 0
                                ? h(
                                    'button',
                                    { type: 'button', className: 'bis-button', onClick: explainIndex },
                                    t('search.indexingAction'),
                                  )
                                : null,
                            )
                          : null,
                      ),
                  search.error !== null && search.error !== undefined
                    ? h(LoadFailure, { t, error: search.error, fallback: 'failure.search', onRetry: () => setTick((value) => value + 1) })
                    : null,
                );

      const analyticsCard =
        projectId === null
          ? null
          : overview === null && overviewError === null
            ? h(SkeletonCard, { t })
            : analytics === null
              ? null
              : h(
                  'section',
                  { className: 'bis-card' },
                  h('h2', { className: 'bis-cardTitle' }, t('analytics.title')),
                  analytics.connected !== true
                    ? h(
                        'div',
                        null,
                        analytics.needsReauth === true ? h('p', { className: 'bis-statusDetail' }, t('analytics.reauth')) : null,
                        h(
                          'div',
                          { className: 'bis-actions' },
                          providerLink('ga4', t('analytics.connect'), 'bis-button bis-primary'),
                        ),
                        h('p', { className: 'bis-hint bis-statusDetail' }, t('search.hint')),
                      )
                    : h(
                        'div',
                        null,
                        h(
                          'div',
                          { className: 'bis-metrics' },
                          h(
                            'div',
                            null,
                            h(
                              'p',
                              { className: 'bis-metricValue' },
                              formatNumber(sessionTotal, locale),
                            ),
                            h('p', { className: 'bis-metricLabel' }, t('analytics.sessions')),
                            sessionTotal !== null ? h('p', { className: 'bis-statusDetail' }, t('analytics.trend')) : null,
                          ),
                        ),
                        sessionTotal !== null
                          ? null
                          : h('p', { className: 'bis-statusDetail' }, t('analytics.empty')),
                        h(
                          'div',
                          { className: 'bis-actions' },
                          h(
                            'button',
                            { type: 'button', className: 'bis-button', onClick: () => void refreshTraffic(), disabled: syncing },
                            syncing ? t('analytics.refreshing') : t('analytics.refresh'),
                          ),
                        ),
                      ),
                  syncNotice !== null ? h('pre', { className: 'bis-error' }, syncNotice) : null,
                  analytics.error !== null && analytics.error !== undefined
                    ? h(LoadFailure, { t, error: analytics.error, fallback: 'failure.analytics', onRetry: () => setTick((value) => value + 1) })
                    : null,
                );

      const needle = query.trim().toLowerCase();
      const skillState =
        overview === null
          ? { known: false }
          : {
              known: true,
              audit: audit !== null && typeof audit.id === 'string',
              searchConsole: search !== null && search.connected === true,
              keywords: overview.checklist && Object.prototype.hasOwnProperty.call(overview.checklist, 'keywords') ? overview.checklist.keywords : false,
            };
      const surface = category;
      const providerIds = workflows === null ? [] : providerChipIds(workflows);
      const activeProviders = providers.filter((id) => providerIds.includes(id));
      const providerNames = activeProviders.map((id) => t(`provider.${id}`));
      const providerValue = providerNames.length === 0 ? t('provider.any') : providerNames.length === 1 ? providerNames[0] : String(providerNames.length);
      const providerSummary = t('provider.summary', { value: providerValue });
      const providerFullSummary = t('provider.summary', { value: providerNames.length === 0 ? t('provider.any') : providerNames.join(', ') });
      const providerKeyDown = (event) => {
        const inputs = Array.from(event.currentTarget.querySelectorAll('input[type="checkbox"]'));
        const index = inputs.indexOf(event.target);
        if (index < 0) return;
        if (event.key === 'Tab') {
          event.preventDefault();
          setProviderMenu(false);
          providerTriggerRef.current?.focus();
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          event.target.click();
          return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? inputs.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + inputs.length) % inputs.length;
        inputs[next]?.focus();
      };
      const matched =
        workflows === null
          ? []
          : visibleSkills(workflows, skillState, surface).filter((item) => {
              if (activeProviders.length > 0 && !(Array.isArray(item.providers) && activeProviders.some((id) => item.providers.includes(id)))) return false;
              if (needle === '') return true;
              const aliases = item.surface === 'ai-search' ? ` ${t('skill.tab.ai-search')} AEO GEO` : '';
              const hay = `${item.title} ${item.result || ''} ${item.action || ''}${aliases}`.toLowerCase();
              return hay.indexOf(needle) !== -1;
            });
      const limitGrid = surface === 'all' && activeProviders.length === 0 && needle === '' && catalogMore !== true;
      const featuredSkills = matched.filter((item) => item.skill !== 'provider-setup');
      const shownSkills = limitGrid ? featuredSkills.slice(0, 6) : matched;
      const categoryTabs = [
        ['seo', 'skill.tab.seo'],
        ['ai-search', 'skill.tab.ai-search'],
        ['site-health', 'skill.tab.site'],
        ['data-reports', 'skill.tab.data'],
        ['social', 'skill.tab.social'],
        ['project', 'skill.tab.project'],
      ];
      const skillTabs = [{ value: 'all', label: t('skill.tab.all') }].concat(
        categoryTabs
          .filter(([id]) =>
            Array.isArray(workflows) &&
            workflows.some(
              (item) =>
                item &&
                item.router !== true &&
                item.skill !== 'seo-coach' &&
                item.skill !== 'bisibility' &&
                item.pack !== 'router' &&
                item.surface === id,
            ),
          )
          .map(([id, key]) => ({ value: id, label: t(key) })),
      );

      const providerNote = activeProviders.map((id) => {
        const state = providerChipState(currentConnections, id);
        if (state === 'connected' || state === 'unknown') return null;
        const page = origin === null || projectId === null ? null : state === 'needs_reauth'
          ? `${origin}/app/${projectId}/providers?connect=${id}#provider-${id}`
          : `${origin}/app/${projectId}/providers#provider-${id}`;
        return h('p', { key: id, className: 'bis-statusDetail bis-providerNote', role: 'status' },
          t(state === 'needs_reauth' ? 'provider.note.reauth' : state === 'disabled' ? 'provider.note.disabled' : 'provider.note.notConnected', { provider: t(`provider.${id}`) }),
          page === null ? null : [' ', h('a', { key: 'link', className: 'bis-link', href: page, target: '_blank', rel: 'noopener noreferrer' }, t(state === 'needs_reauth' ? 'provider.reconnect' : 'provider.open'))],
        );
      });

      const catalog =
        workflows === null && catalogError === null
          ? h(CatalogSkeleton, { t })
          : workflows === null
            ? h('section', { className: 'bis-catalog' }, h('h2', { className: 'bis-h2' }, t('discover.title')), h(LoadFailure, { t, error: catalogError, fallback: 'failure.skills', onRetry: () => setTick((value) => value + 1) }))
            : h(
              'section',
              { className: 'bis-catalog', 'aria-busy': catalogBusy ? 'true' : 'false' },
              h(
                'div',
                { className: 'bis-catalogHead' },
                h('h2', { className: 'bis-h2 bis-catalogTitle' }, t('discover.title')),
                h(
                  'span',
                  { className: 'bis-catalogSearch' },
                  h(Input, {
                    id: 'bis-workflow-search',
                    className: 'bis-input',
                    type: 'search',
                    value: query,
                    placeholder: t('discover.search'),
                    autoComplete: 'off',
                    'aria-label': t('discover.search'),
                    icon: h(PhosphorIcon, { name: 'MagnifyingGlass', size: 16 }),
                    onChange: (event) => {
                      setQuery(event.target.value);
                      setCatalogMore(false);
                    },
                  }),
                ),
              ),
              h(
                'div',
                { className: 'bis-catalogFilters' },
                h(FilterTabs, {
                  label: t('discover.filter'),
                  value: skillTabs.some((item) => item.value === surface) ? surface : 'all',
                  items: skillTabs,
                  onChange: (value) => {
                    setCategory(value);
                  },
                }),
                providerIds.length === 0 ? null : h(PanelMenu, {
                  panelRef,
                  menuClass: 'bis-providerMenuList',
                  flipWhenClipped: true,
                  open: providerMenu,
                  onClose: () => {
                    setProviderMenu(false);
                    providerTriggerRef.current?.focus();
                    window.setTimeout(() => {
                      if (document.activeElement === document.body) providerTriggerRef.current?.focus();
                    }, 0);
                  },
                  renderAnchor: (ref) => h(TruncatedTooltip, {
                    label: providerFullSummary,
                    disabled: providerMenu,
                    measureSelector: '.bis-providerTriggerText',
                    render: (measureRef) => h(Button, {
                      variant: 'outline', size: 'sm', className: 'bis-providerTrigger',
                      ref: (element) => { ref.current = element; measureRef.current = element; providerTriggerRef.current = element; },
                      'aria-haspopup': 'menu', 'aria-expanded': providerMenu ? 'true' : 'false',
                      onClick: () => setProviderMenu((open) => !open),
                    }, h('span', { className: 'bis-providerTriggerText' }, providerSummary), h(PhosphorIcon, { name: 'CaretDown', size: 14 })),
                  }),
                }, h('div', { className: 'bis-providerOptions', ref: providerOptionsRef, onKeyDown: providerKeyDown },
                  ['all', ...providerIds].map((id) => {
                    const all = id === 'all';
                    const state = all ? null : providerChipState(currentConnections, id);
                    const picked = all ? activeProviders.length === 0 : activeProviders.includes(id);
                    const stateKey = state === 'needs_reauth' ? 'provider.state.reauth' : state === 'disabled' ? 'provider.state.disabled' : state === 'not_connected' ? 'provider.state.notConnected' : null;
                    return h('div', { key: id, className: 'bis-providerOption', 'data-provider': id, 'data-state': state }, h(Checkbox, {
                      className: 'bis-providerCheckbox', checked: picked,
                      onChange: (checked) => {
                        if (all) setProviders([]);
                        else setProviders((ids) => checked ? [...new Set(ids.concat(id))] : ids.filter((value) => value !== id));
                      },
                      label: h('span', { className: 'bis-providerOptionContent' },
                        all ? null : h('span', { className: 'bis-dot', 'data-state': state === 'connected' ? 'ok' : state === 'needs_reauth' || state === 'disabled' ? 'warn' : 'idle', 'aria-hidden': 'true' }),
                        h('span', { className: 'bis-providerOptionName' }, all ? t('provider.all') : t(`provider.${id}`)),
                        stateKey === null ? null : h('span', { className: 'bis-providerOptionStatus' }, t(stateKey)),
                      ),
                    }));
                  }),
                )),
              ),
              providerNote,
              catalogError !== null ? h(LoadFailure, { t, error: catalogError, fallback: 'failure.skills', onRetry: () => setTick((value) => value + 1) }) : null,
              shownSkills.length === 0
                ? h('p', { className: 'bis-statusDetail' }, t('discover.empty'))
                : h(
                    'div',
                    { className: 'bis-skillGrid' },
                    shownSkills.map((item) => {
                      const labels = skillLabelIds(item, skillState);
                      const identity = skillIdentity(item);
                      const isAudit = item.skill === 'seo-audit';
                      const auditPhase = running ? 'running' : latestRun !== null ? 'saved' : 'none';
                      const openSkill = () => {
                        if (isAudit) {
                          openAudit(auditPhase === 'running' ? 'progress' : 'scope', null);
                          return;
                        }
                        prefill(providerPrompt(item, activeProviders), setCatalogNote);
                      };
                      const skillAction = !isAudit ? item.action || t('discover.try') : auditPhase === 'running' ? t('audit.viewProgress') : t('audit.runAudit');
                      return h(
                        'div',
                        { key: item.skill, className: 'bis-skillCard' },
                        h(
                          'span',
                          { className: 'bis-skillTop' },
                          h(
                            'span',
                            { className: 'bis-skillTile', 'data-surface': identity.surface, 'aria-hidden': 'true' },
                            h('span', { className: 'bis-skillGlyph' }, h(PhosphorIcon, { name: identity.icon, size: 22 })),
                          ),
                          h(
                            'span',
                            { className: 'bis-skillLabels' },
                            isAudit ? h(Tag, { key: 'limit' }, t('audit.limit')) : labels.map((label) => h(Tag, { key: label }, t(`skill.label.${label}`))),
                          ),
                        ),
                        h('span', { className: 'bis-skillTitle' }, item.title),
                        h('span', { className: 'bis-skillResult' }, item.result || item.line),
                        isAudit
                          ? h(
                              'span',
                              { className: 'bis-skillAction bis-skillActions' },
                              h(Button, { variant: 'primary', 'data-skill': item.skill, onClick: openSkill }, skillAction),
                              latestRun !== null
                                ? h(Button, { variant: 'outline', 'data-audit': 'latest', onClick: () => openAudit('result', latestRun.id) }, t('audit.viewLatest'))
                                : null,
                            )
                          : h(
                              Button,
                              { variant: 'outline', className: 'bis-skillAction', 'data-skill': item.skill, onClick: openSkill },
                              skillAction,
                            ),
                      );
                    }),
                  ),
              limitGrid && matched.length > 6
                ? h(
                    Button,
                    { variant: 'ghost', onClick: () => setCatalogMore(true) },
                    t('discover.more'),
                  )
                : null,
              catalogNote !== null ? h('p', { className: 'bis-statusDetail', role: 'status' }, catalogNote) : null,
            );

      const focusCreate = () => {
        try {
          const field = document.getElementById('bis-domain');
          if (field !== null && typeof field.focus === 'function') field.focus();
        } catch (error) {
          /* the create form is already on the page */
        }
      };

      const step = projects.length === 0 ? { id: 'create' } : overview !== null && overview.next ? overview.next : null;
      const featured =
        projects.length > 0 && overview === null && overviewError === null
          ? h(
              'section',
              { className: 'bis-card bis-featured', 'aria-busy': 'true' },
              h('div', { className: 'bis-skeleton' }),
              h('div', { className: 'bis-skeleton bis-skeletonShort' }),
            )
          : step === null
            ? h('section', { className: 'bis-card bis-featured' }, h('p', { className: 'bis-statusDetail' }, t('next.waiting')))
            : h(
                'section',
                { className: 'bis-card bis-featured' },
                h('h2', { className: 'bis-cardTitle' }, t(`next.${step.id === 'search-console' ? 'search' : step.id}.title`)),
                h('p', { className: 'bis-copy' }, t(`next.${step.id === 'search-console' ? 'search' : step.id}.body`)),
                h(
                  'div',
                  { className: 'bis-actions' },
                  step.id === 'search-console'
                    ? providerLink('gsc', t('next.search.action'), 'bis-button bis-primary')
                    : h(
                        'button',
                        {
                          type: 'button',
                          className: 'bis-button bis-primary',
                          disabled: step.id === 'audit' && running,
                          onClick: () => {
                            if (step.id === 'create') {
                              focusCreate();
                              return;
                            }
                            if (step.id === 'audit') {
                              void runCrawl();
                              return;
                            }
                            const prompt = featuredPrompt(step);
                            if (prompt === null) return;
                            prefill(prompt, setAskNote);
                          },
                        },
                        t(`next.${step.id}.action`),
                      ),
                ),
              );

      const recentItems =
        recent === null
          ? []
          : [
              ...(Array.isArray(recent.audits) ? recent.audits.map((item) => ({ ...item, label: t('recent.audit') })) : []),
              ...(Array.isArray(recent.reports) ? recent.reports.map((item) => ({ ...item, label: t('recent.report') })) : []),
            ];
      const resultName = (item) => (item.label === t('recent.report') ? item.title || item.id : t('audit.title'));
      const resultDate = (item) => (typeof item.createdAt === 'string' ? formatDate(item.createdAt, locale) : '');
      const resultClock = (item) => (typeof item.createdAt === 'string' ? formatClock(item.createdAt, locale) : '');
      const resultStatus = (item) => (typeof item.status === 'string' ? item.status : typeof item.stopReason === 'string' ? item.stopReason : 'saved');
      const resultPages = (item) => (typeof item.pagesCrawled === 'number' ? t('audit.pages', { count: formatNumber(item.pagesCrawled, locale) }) : '');
      const openResult = (item) => {
        setAuditToast(false);
        setResultsOpen(false);
        if (item.label === t('recent.audit')) {
          openAudit('result', typeof item.id === 'string' ? item.id : null);
          return;
        }
        if (typeof item.prompt === 'string' && item.prompt.trim() !== '') prefill(item.prompt, setAskNote);
      };
      const recentPreview = recentItems.slice(0, 3);
      const countDates = (items) => {
        const counts = new Map();
        for (const item of items) {
          const date = resultDate(item);
          counts.set(date, (counts.get(date) || 0) + 1);
        }
        return counts;
      };
      const previewDates = countDates(recentPreview);
      const resultDates = countDates(recentItems);
      const recentRowItem = (item, dates = previewDates) => {
        const date = resultDate(item);
        const sharedDate = dates.get(date) > 1;
        const when = date === '' ? '' : sharedDate && resultClock(item) !== '' ? `${date}, ${resultClock(item)}` : date;
        const meta = [when, item.label === t('recent.audit') ? resultPages(item) : resultStatus(item)].filter((part) => part !== '').join(' · ');
        return h(ResultRow, {
          key: `${item.label}-${item.id}`,
          rowProps: { 'data-recent': item.id },
          buttonProps: { 'data-recent-open': item.id },
          title: resultName(item),
          meta,
          onOpen: () => openResult(item),
        });
      };
      const recentRow =
        recentPreview.length === 0 && recent !== null && recentError === null
          ? null
          : h(
              'section',
              { className: 'bis-recent' },
              h(
                'div',
                { className: 'bis-recentHead' },
                h('h2', { className: 'bis-h2' }, t('results.recent')),
                h(
                  Button,
                  {
                    variant: 'ghost',
                    size: 'sm',
                    className: 'bis-recentAll',
                    onClick: () => {
                      setAuditOpen(false);
                      setResultsOpen(true);
                    },
                  },
                  t('results.viewAll'),
                ),
              ),
              h('div', { className: 'bis-recentSlot', 'data-state': recentError !== null ? 'error' : recent === null ? 'loading' : 'loaded' },
                recentError !== null
                  ? h(LoadFailure, { t, error: recentError, fallback: 'failure.recent', onRetry: () => setTick((value) => value + 1) })
                  : recent === null
                    ? h('div', { className: 'bis-recentPending', role: 'status', 'aria-label': t('loading') }, [0, 1].map((slot) => h('div', { key: slot, className: 'bis-skeleton' })))
                    : h('ul', { className: 'bis-recentList' }, recentPreview.map((item) => recentRowItem(item)))),
            );
      const resultsModal =
        resultsOpen !== true
          ? null
          : h(
              PanelModal,
              {
                panelRef,
                open: true,
                title: t('results.title'),
                closeLabel: t('audit.close'),
                onClose: () => setResultsOpen(false),
                className: 'bis-modal bis-resultsModal',
                contentClassName: 'bis-modalContent',
              },
              recentError !== null ? h(LoadFailure, { t, error: recentError, fallback: 'failure.recent', onRetry: () => setTick((value) => value + 1) }) : null,
              recentItems.length === 0
                ? h('p', { className: 'bis-statusDetail' }, t('recent.empty'))
                : h(
                    'ul',
                    { className: 'bis-recentList' },
                    recentItems.map((item) => recentRowItem(item, resultDates)),
                  ),
            );
      const readyToast = auditToast !== true ? null : h(Toast, {
        text: h('span', { className: 'bis-toastMessage' }, t('audit.ready')),
        anchor: panelRef.current,
        onDone: () => setAuditToast(false),
        actions: [
          { prefix: ' ', label: t('audit.openReport'), onClick: () => {
            setAuditToast(false);
            setAuditOpen(false);
            setResultsOpen(true);
          } },
          { prefix: ' ', label: t('audit.close'), onClick: () => setAuditToast(false) },
        ],
      });

      const suggestionsPending = projectId !== null && overviewSettled !== true;
      const computedSuggestions =
        overview === null
          ? []
          : askSuggestionIds({
              hasAudit: audit !== null && typeof audit.id === 'string',
              searchConsole: search !== null && search.connected === true,
              trafficHistory: analytics !== null && analytics.connected === true && sessionPoints.length > 0,
            });
      const suggestionIds = suggestionsPending ? null : computedSuggestions.length > 0 ? computedSuggestions : DEFAULT_SUGGESTIONS;
      const askDomain = selected !== null && typeof selected.domain === 'string' ? selected.domain.trim() : '';
      const askBox = h(
        'form',
        {
          className: 'bis-ask',
          onSubmit: (event) => {
            event.preventDefault();
            const trimmed = question.trim();
            if (trimmed === '') return;
            const chip = suggestionIds === null ? undefined : suggestionIds.find((id) => t(`ask.${id}`) === trimmed);
            sendAsk(trimmed, chip ? ASK_SKILL[chip] : null);
          },
        },
        h('h2', { className: 'bis-askHeading', id: 'bis-ask-heading' }, t('ask.label')),
        h(
          'div',
          { className: 'bis-askRow' },
          h(
            'span',
            { className: 'bis-askField' },
            h(Input, {
              id: 'bis-ask',
              className: 'bis-input',
              size: 'md',
              type: 'text',
              value: question,
              placeholder: askDomain === '' ? t('ask.placeholderNoDomain') : t('ask.placeholder').replaceAll('{domain}', askDomain),
              autoComplete: 'off',
              'aria-labelledby': 'bis-ask-heading',
              onChange: (event) => setQuestion(event.target.value),
            }),
          ),
          h(
            Button,
            { type: 'submit', variant: 'primary', size: 'md', className: 'bis-askSubmit' },
            t('ask.send'),
          ),
        ),
        h(
          'div',
          { className: 'bis-suggests', role: 'group', 'aria-label': t('ask.label') },
          suggestionIds === null
            ? [0, 1, 2].map((slot) => h('span', { key: slot, className: 'bis-suggest bis-suggestSkeleton', 'aria-hidden': 'true' }))
            : suggestionIds.map((id) =>
                h(
                  Pill,
                  {
                    key: id,
                    className: 'bis-suggest',
                    onClick: (event) => {
                      if (event && typeof event.preventDefault === 'function') event.preventDefault();
                      sendAsk(t(`ask.${id}`), ASK_SKILL[id]);
                    },
                  },
                  t(`ask.${id}`),
                ),
              ),
        ),
        askNote !== null ? h('p', { className: 'bis-statusDetail', role: 'status' }, askNote) : null,
      );

      const gscOn = gscConnected;
      const gaOn = gaConnected;
      const connectionRow =
        projectId !== null && currentConnections === null && connectionsError === null
          ? h('div', { className: 'bis-connections', role: 'status', 'aria-label': t('loading') }, h('span', { className: 'bis-skeleton bis-skeletonShort' }))
          : connectionsError !== null || connections && connections.error
            ? h(LoadFailure, { t, error: connectionsError || connections.error, fallback: 'failure.connections', onRetry: () => setTick((value) => value + 1) })
            : h('div', { className: 'bis-connections' },
                h('p', null, `${gscOn ? t('connect.gscOn') : t('connect.gscOff')} · ${gaOn ? t('connect.gaOn') : t('connect.gaOff')} · ${t('connect.optional')}`),
                gscOn ? gaOn ? null : providerLink('ga4', t('analytics.connect'), 'bis-button') : providerLink('gsc', t('search.connect'), 'bis-button'));
      const retryProjectSource = (source) => {
        projectDataCache.current.delete(`${projectId}:${source}`);
        setProjectDataTry((value) => value + 1);
      };
      const dataLoading = wantsProjectData && ['search', 'indexing', 'analytics'].some((source) =>
        (source === 'analytics' ? gaOn : gscOn) && (!projectData[source] || projectData[source].loading));
      const sourceBlock = (source, enabled, labels, render) => {
        if (!enabled) return null;
        const entry = projectData[source];
        const pending = !entry || entry.loading;
        const body = entry && entry.body;
        const field = source === 'search' ? 'searchConsole' : source;
        const card = body && body[field];
        const error = entry && (entry.error || card && card.error);
        const range = source === 'search' && card && card.window || body && body.window;
        const windowLabel = range && typeof range.start === 'string' && typeof range.end === 'string' ? t('data.range', range) : '';
        return h('section', { key: source, className: 'bis-dataSource', 'data-source': source, 'aria-busy': pending ? 'true' : 'false' },
          h('div', { className: pending ? 'bis-metrics bis-metricsSkeleton' : 'bis-metrics' }, labels.map(([key, label]) =>
            h('div', { key, 'data-metric': key },
              h('p', { className: 'bis-metricValue' }, pending ? h('span', { className: 'bis-skeleton bis-skeletonMetric' }) : render(card, key)),
              h('p', { className: 'bis-metricLabel' }, t(label))))),
          h('div', { className: source === 'indexing' ? 'bis-indexingActionSlot' : 'bis-sourceNote' },
            source === 'search' && windowLabel ? h('p', { className: 'bis-statusDetail' }, t('data.window', range)) : null,
            error ? h(LoadFailure, { t, error, fallback: source === 'search' ? 'failure.search' : source === 'indexing' ? 'failure.indexing' : 'failure.analytics', onRetry: () => retryProjectSource(source) })
              : source === 'search' && card && card.partial ? h('p', { className: 'bis-statusDetail' }, t('data.partial'))
              : source === 'search' && card && card.freshness ? h('div', { className: 'bis-searchFreshness' },
                  h('p', { className: 'bis-statusDetail' }, card.dataWindow && card.dataWindow.start && card.dataWindow.end ? t('data.actual', card.dataWindow) : t('data.noDates')),
                  h('p', { className: 'bis-statusDetail' }, t(card.freshness.data_state === 'final' ? 'data.final' : 'data.provisional')),
                  h('p', { className: 'bis-statusDetail' }, t('data.fetched', { date: card.freshness.fetched_at || t('data.unknown') })),
                  h('p', { className: 'bis-statusDetail' }, t('data.finalized', { date: card.freshness.finalized_through || t('data.unknown') })),
                  card.freshness.first_incomplete_date ? h('p', { className: 'bis-statusDetail' }, t('data.incomplete', { date: card.freshness.first_incomplete_date })) : null)
              : source === 'indexing' && card && Array.isArray(card.urls) && card.urls.length > 0
                ? h(Button, { variant: 'outline', onClick: explainIndex }, t('search.indexingAction')) : null),
          source === 'search' ? h('div', { className: 'bis-querySlot' },
            h('p', { className: 'bis-metricLabel' }, t('search.queries')),
            pending ? h('span', { className: 'bis-skeleton bis-skeletonShort' }) : error ? null
              : card && Array.isArray(card.queries) && card.queries.length > 0 ? h('ul', { className: 'bis-queries' },
                  card.queries.map((row) => h('li', { key: row.query, className: 'bis-query' },
                    h('span', null, row.query), h('span', null, formatNumber(row.clicks, locale)))))
                : h('p', { className: 'bis-statusDetail' }, t('search.queriesEmpty'))) : null);
      };
      const projectDataBlock = h(
        'div',
        { className: 'bis-projectData' },
        h(
          Button,
          {
            variant: 'ghost',
            className: 'bis-projectDataToggle',
            'aria-expanded': dataOpen ? 'true' : 'false',
            'aria-controls': 'bis-project-data',
            onClick: () => setDataOpen((open) => !open),
          },
          h('span', { className: 'bis-projectDataLabel' }, t('data.title')),
          h(
            'span',
            { className: 'bis-projectDataChevron', 'data-open': dataOpen ? 'true' : 'false', 'aria-hidden': 'true' },
            h(PhosphorIcon, { name: 'CaretDown', size: 14 }),
          ),
        ),
        dataOpen
          ? h(
              'div',
              { id: 'bis-project-data', className: 'bis-projectDataPanel', 'aria-busy': dataLoading ? 'true' : 'false' },
              !gscOn && !gaOn ? h('p', { className: 'bis-copy' }, t('data.empty')) : [
                sourceBlock('search', gscOn, [['clicks', 'search.clicks'], ['impressions', 'search.impressions'], ['ctr', 'search.ctr'], ['position', 'search.position']], (card, key) => {
                  if (!card || typeof card[key] !== 'number') return '-';
                  if (key === 'ctr') return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 }).format(card[key]);
                  return key === 'position' ? formatPosition(card[key], locale) : formatNumber(card[key], locale);
                }),
                sourceBlock('analytics', gaOn, [['sessions', 'analytics.sessions']], (card) => {
                  const newest = card && Array.isArray(card.sessions) ? card.sessions[card.sessions.length - 1] : null;
                  return newest && typeof newest.sessions === 'number' ? t('data.sessionDate', { count: formatNumber(newest.sessions, locale), date: newest.date }) : '-';
                }),
                sourceBlock('indexing', gscOn, [['indexing', 'data.notIndexed']], (card) => card && typeof card.notIndexed === 'number' ? formatNumber(card.notIndexed, locale) : '-'),
              ],
            )
          : null,
      );

      return PanelScreen(
        header(selected),
        askBox,
        workspaceNotice === null ? null : h('div', { className: 'bis-notice bis-workspaceNotice' },
          h('p', { role: 'status' }, t('session.copied')),
          workspaceNoticeError === null ? null : h('p', { className: 'bis-statusDetail', role: 'alert' }, workspaceNoticeError),
          h('div', { className: 'bis-actions bis-workspaceNoticeActions' },
            h(Button, { variant: 'primary', disabled: openingConversation || typeof workspaceNotice.openConversation !== 'function', onClick: openCopiedConversation }, t('session.openConversation')),
            h(Button, { variant: 'outline', onClick: () => setWorkspaceNotice(null) }, t('session.dismiss')),
          ),
        ),
        recentRow,
        catalog,
        projectPicker,
        projectsError !== null
          ? h(LoadFailure, { t, error: projectsError, fallback: 'failure.projects', onRetry: () => setTick((value) => value + 1) })
          : null,
        overviewError !== null
          ? h(LoadFailure, { t, error: overviewError, fallback: 'failure.project', onRetry: () => setTick((value) => value + 1) })
          : null,
        overview !== null && overview.keywordsError !== null && overview.keywordsError !== undefined
          ? h(LoadFailure, { t, error: overview.keywordsError, fallback: 'failure.keywords', onRetry: () => setTick((value) => value + 1) })
          : null,
        connectionRow,
        projectDataBlock,
        auditModal,
        resultsModal,
        readyToast,
      );
    }

    /**
     * The Bisibility page behind the left-sidebar entry.
     * @param props - panel translator and standard slot props.
     * @returns the panel element tree.
     */
    function BisibilityPanel(props) {
      const { t, openPluginsPanel, startBisibilityPrompt, localeTag } = props;
      const panelRef = React.useRef(null);
      const [snapshot, setSnapshot] = React.useState(null);
      const [unreachable, setUnreachable] = React.useState(false);
      const [busy, setBusy] = React.useState(null);
      const [localError, setLocalError] = React.useState(null);
      const [settingsMenu, setSettingsMenu] = React.useState(false);
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

      const status = unreachable
        ? { state: 'error', title: t('status.unreachable'), detail: t('status.unreachableDetail') }
        : describeStatus(snapshot, t);
      const connected = snapshot !== null && snapshot.connected === true;
      const healthy = connected && snapshot.mcp !== 'failed' && !unreachable;
      const checking = snapshot === null && !unreachable;
      const refreshable = snapshot !== null && snapshot.refreshable === true;
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

      const dotState = status.state === 'ok' ? 'success' : status.state === 'error' ? 'error' : status.state === 'warn' ? 'warning' : 'idle';

      return h(
        'section',
        { className: 'bis-page', 'aria-label': t('title'), ref: panelRef },
        h('style', { key: 'bisibility-panel-styles' }, styles),
        h(
          'div',
          { className: 'bis-scroll' },
          h(
            'div',
            { className: 'bis-content' },
            !healthy
              ? PanelScreen(
                  h(StartHeader, {
                    t,
                    panelRef,
                    projects: null,
                    projectId: null,
                    setProjectId: () => {},
                    selected: null,
                    projectMenu: false,
                    setProjectMenu: () => {},
                    settingsMenu,
                    setSettingsMenu,
                    version,
                    expiryNote,
                    busy,
                    onRefresh: () => void load(),
                    onDisconnect: () => void disconnect(),
                    onOpenPlugins: openPlugins,
                    onOpenSurface: () => {},
                    projectPending: true,
                    statusPending: checking,
                    statusText: status.title,
                    dot: checking ? 'idle' : dotState,
                  }),
                  h(PendingAsk, { t }),
                  h(CatalogSkeleton, { t }),
                  checking
                    ? null
                    : h(
                    'section',
                    { className: 'bis-broken', 'data-tone': status.state === 'error' ? 'error' : 'warn', role: 'alert' },
                    h(
                      'div',
                      { className: 'bis-status' },
                      h(StateDot, { state: dotState, size: 10 }),
                      h(
                        'div',
                        { className: 'bis-statusBody' },
                        h('p', { className: 'bis-statusTitle' }, status.title),
                        status.detail === null ? null : h('p', { className: 'bis-statusDetail' }, status.detail),
                      ),
                    ),
                    hostError !== null ? h('pre', { className: 'bis-error' }, hostError) : null,
                    localError !== null ? h('pre', { className: 'bis-error' }, localError) : null,
                    h(
                      'div',
                      { className: 'bis-actions' },
                      h(
                        Button,
                        {
                          variant: 'primary',
                          onClick: connect,
                          disabled: busy !== null || unreachable,
                        },
                        busy === 'connect' ? t('connect.working') : t('connect.action'),
                      ),
                    ),
                  ),
            )
              : null,
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
            healthy
              ? h(Growth, {
                  panelRef,
                  t,
                  startPrompt: startBisibilityPrompt,
                  localeTag,
                  reconnect: connect,
                  version,
                  expiryNote,
                  busy,
                  onRefresh: () => void load(),
                  onDisconnect: () => void disconnect(),
                  onOpenPlugins: openPlugins,
                })
              : null,
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

      /**
       * Prefill a real Workspace through DSH's awaitable navigation and draft APIs.
       * startSession itself is fire-and-forget in DSH 0.2.x, including on success.
       * @param prompt - composer text; never submitted automatically.
       * @returns confirmed ready, or copied with an explicit blank-conversation action.
       */
      const startBisibilityPrompt = async (prompt) => {
        const service = (id) => { try { return ctx.get(id) } catch { return undefined } };
        const workspace = service('uiWorkspace');
        if (!workspace || typeof workspace.startSession !== 'function') throw new Error(t('session.failed'));
        const failedResult = (result) => {
          if (result && (result.ok === false || result.error)) {
            const error = new Error(result.error && result.error.message || 'Session creation failed');
            error.code = result.error && result.error.code || result.code;
            throw error;
          }
        };
        const copyPrompt = async () => {
          if (typeof writeClipboard !== 'function' || await writeClipboard(prompt) !== true) throw new Error(t('session.copyFailed'));
          return {
            status: 'copied',
            // Copying never navigates. Only the notice's explicit action opens DSH.
            openConversation: async () => failedResult(await workspace.startSession(undefined, { agentPreset: PRESET_ID })),
            watchWorkspace(onReady) {
              const source = (service('workspaces') || workspace.workspaces)?.list;
              if (!source || typeof source.getSnapshot !== 'function') return undefined;
              let done = false;
              const check = () => {
                const snapshot = source.getSnapshot();
                if (!done && snapshot?.phase === 'ready' && Array.isArray(snapshot.items) && snapshot.items.some((item) => typeof item.workspaceId === 'string' && item.workspaceId !== '')) {
                  done = true;
                  onReady();
                }
              };
              const stop = typeof source.subscribe === 'function' ? source.subscribe(check) : undefined;
              check();
              return stop;
            },
          };
        };
        const readySnapshot = async (source) => {
          if (!source || typeof source.getSnapshot !== 'function') return null;
          const initial = source.getSnapshot();
          if (!initial) return null;
          if (initial.phase === 'ready' || initial.phase === undefined) return initial;
          if (typeof source.subscribe !== 'function') throw new Error(t('session.failed'));
          return new Promise((resolve, reject) => {
            let stop;
            const timer = setTimeout(() => { if (stop) stop(); reject(new Error(t('session.failed'))); }, 8000);
            const check = () => {
              const snapshot = source.getSnapshot();
              if (snapshot.phase !== 'ready' && snapshot.phase !== 'error') return;
              clearTimeout(timer);
              if (stop) stop();
              if (snapshot.phase === 'ready') resolve(snapshot);
              else reject(new Error(t('session.failed')));
            };
            stop = source.subscribe(check);
            check();
          });
        };
        const workspaces = service('workspaces') || workspace.workspaces;
        const sessions = service('sessions') || workspace.sessions;
        const snapshot = await readySnapshot(workspaces && workspaces.list);
        if (snapshot && Array.isArray(snapshot.items) && !snapshot.items.some((item) => typeof item.workspaceId === 'string' && item.workspaceId !== '')) return copyPrompt();
        const sessionList = await readySnapshot(sessions && sessions.list);
        if (snapshot && Array.isArray(snapshot.items)) {
          // Ungrouped has no Workspace id and must never become a target.
          const items = snapshot.items.filter((item) => typeof item.workspaceId === 'string' && item.workspaceId !== '');
          if (items.length === 0) return copyPrompt();
          const byId = sessionList && sessionList.byId || {};
          const current = workspace.mainReference && workspace.mainReference.sessionId || Object.values(byId).find((item) => (item.retainedBy && item.retainedBy.mainView || 0) > 0)?.id;
          let target = items.find((item) => Array.isArray(item.sessionIds) && item.sessionIds.includes(current))?.workspaceId;
          if (!target) {
            let latest = Number.NEGATIVE_INFINITY;
            for (const item of items) {
              let time = Number.NEGATIVE_INFINITY;
              for (const id of item.sessionIds || []) if (byId[id]) time = Math.max(time, byId[id].updatedAt);
              if (time === Number.NEGATIVE_INFINITY) time = Date.parse(item.createdAt);
              if (!target || time > latest) { target = item.workspaceId; latest = time; }
            }
          }
          const conversation = service('conversation');
          if (typeof workspace.openWorkspace === 'function' && sessions && typeof sessions.binding === 'function' && conversation && typeof conversation.input?.requestDraftInitialization === 'function') {
            let confirmed = false;
            await workspace.openWorkspace(target, (id) => {
              const binding = sessions.binding(id);
              if (!binding || conversation.input.requestDraftInitialization(binding, { prompt, whenDraftExists: 'replace' }) !== 'applied') {
                const error = new Error(t('session.failed'));
                error.code = 'draft.initializationFailed';
                throw error;
              }
              confirmed = true;
            }, { agentPreset: PRESET_ID });
            if (!confirmed) throw new Error(t('session.failed'));
            return { status: 'ready' };
          }
          // Compatibility with a build that returns an explicit creation result.
          const result = await workspace.startSession(target, { agentPreset: PRESET_ID, prompt, whenDraftExists: 'replace' });
          failedResult(result);
          if (result && (result.status === 'ready' || result.ok === true || typeof result.sessionId === 'string')) return { status: 'ready' };
          throw new Error(t('session.failed'));
        }
        // Without readable Workspace snapshots, keep the panel and prompt available.
        // A fire-and-forget probe could navigate or raise DSH's workspace error toast.
        return copyPrompt();
      };

      /**
       * The locale the panel should use for numbers and dates.
       * @returns a BCP 47 tag.
       */
      const localeTag = () => {
        try {
          const locale = ctx.get('locale')
          for (const key of ['locale', 'language', 'current', 'lang']) {
            if (typeof locale?.[key] === 'string' && locale[key].trim() !== '') return locale[key]
          }
        } catch (error) {
          /* the document language is the fallback */
        }
        try {
          const lang = document.documentElement && document.documentElement.lang
          if (typeof lang === 'string' && lang.trim() !== '') return lang
        } catch (error) {
          /* no document in this runtime */
        }
        return typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en'
      };

      ctx.slots.inject('main', () =>
        ctx.slots.register(
          {
            name: 'main',
            key: PANEL_ID,
            locale: NS,
            inject: () => ({ startBisibilitySession, openPluginsPanel, startBisibilityPrompt, localeTag }),
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
