import { invocablePrompt, shippedSkillNames, skillPack } from './skills.js'

/**
 * Static workflow catalog for the panel.
 *
 * Badges are the four labels from the phase 0 skill map. This module does not
 * call `get_capabilities`. REST skills either prefill an MCP twin or say, in
 * the prompt, which output this session cannot produce. Pack labels mark skills
 * that ship together.
 */

/** Badge ids the panel may show. */
export const WORKFLOW_BADGES = ['free', 'search-console', 'analytics', 'credits']

/**
 * Badge for each skill, from phase 0 section 4.
 * Credits means a prescribed step is gated or paid. seo-audit and prompt research
 * have no cost-estimate tool, so their credit badge has no estimate string.
 * keyword-opportunity-research stays Needs Search Console: that is the history the card leads with.
 * The five skills that name another skill use the same map. Their cards do not
 * start the paid check those skills leave for a later approval.
 */
export const BADGE_BY_SKILL = {
  'seo-coach': 'free',
  'bisibility': 'free',
  'domain-onboarding': 'free',
  'keyword-import': 'free',
  'project-setup': 'free',
  'seo-audit': 'credits',
  'ai-visibility-audit': 'credits',
  'keyword-opportunity-research': 'search-console',
  'rank-tracking-report': 'free',
  'weekly-report': 'free',
  'alert-triage': 'free',
  'backlink-profile-analysis': 'credits',
  'provider-setup': 'free',
  'self-host-health': 'free',
  'team-api-governance': 'free',
  'keyword-clustering': 'credits',
  'competitor-analysis': 'credits',
  'competitive-landscape': 'credits',
  'ai-prompt-research': 'credits',
  'local-seo': 'free',
}

/** Credit badges whose skill has no estimate tool. */
const CREDITS_WITHOUT_ESTIMATE = new Set(['seo-audit', 'ai-prompt-research'])

/** Category ids, in filter order. */
export const WORKFLOW_CATEGORIES = ['audit', 'search-console', 'keywords', 'competitors', 'ai-visibility', 'local', 'reports', 'setup']

/** Shipped skills. The same list as registration. */
export const WORKFLOW_SKILL_NAMES = shippedSkillNames()

/**
 * REST skills that ship. Each entry records why the prompt uses a twin or a limit.
 * seo-coach is MCP and is not in this list. The other four returning skills stay
 * REST: the prompt names the limit instead of promising a twin's output.
 */
const REST_SKILLS = [
  'bisibility',
  'domain-onboarding',
  'keyword-import',
  'self-host-health',
  'weekly-report',
  'provider-setup',
  'team-api-governance',
]

/**
 * One catalog row.
 * `prompt` contains `{domain}`. `promptWithoutDomain` is the same ask with no domain.
 * @type {Array<object>}
 */
const WORKFLOW_ENTRIES = [
  {
    skill: 'seo-coach',
    promptSkill: 'seo-coach',
    category: 'setup',
    badge: 'free',
    estimate: null,
    rest: null,
    pack: 'router',
    title: { en: 'Next skill', zh: '下一步技能' },
    line: {
      en: 'Name one next skill from the goal and saved context. It does not run that skill.',
      zh: '根据目标和已保存的上下文指出下一个技能。它不会运行那个技能。',
    },
    note: {
      en: 'Research comes before new tracking. The named skill has to be one this plugin registers.',
      zh: '先研究，再开始新的跟踪。指出的技能必须是本插件已注册的技能。',
    },
    prompt: {
      en: 'For {domain}, read the saved project context and recommend one next skill by its exact name. Give one reason. Do not run that skill, a paid tool, or a write.',
      zh: '为 {domain} 读取已保存的项目上下文，并用准确的名字推荐下一个技能。给出一条理由。不要运行那个技能，不要调用付费工具，也不要写入。',
    },
    promptWithoutDomain: {
      en: 'For the selected project, read the saved project context and recommend one next skill by its exact name. Give one reason. Do not run that skill, a paid tool, or a write.',
      zh: '为当前项目读取已保存的项目上下文，并用准确的名字推荐下一个技能。给出一条理由。不要运行那个技能，不要调用付费工具，也不要写入。',
    },
  },
  {
    skill: 'bisibility',
    promptSkill: 'bisibility',
    category: 'setup',
    badge: 'free',
    estimate: null,
    rest: {
      decision: 'mark',
      twin: null,
      reason:
        'REST router. It resolves the instance and names one task skill, then stops. This session may not expose GET /capabilities. The prompt uses the tools this session has, names one registered skill, and does not execute it.',
    },
    pack: 'router',
    title: { en: 'Route a task', zh: '路由一个任务' },
    line: {
      en: 'Name the next skill for this project and stop. It does not run that skill.',
      zh: '为这个项目指出下一个技能，然后停止。它不会运行那个技能。',
    },
    note: {
      en: 'This card does not claim a credential scope and does not start a health check or a write.',
      zh: '这张卡片不会声称凭据范围，也不会开始健康检查或写入。',
    },
    prompt: {
      en: 'Resolve {domain} with the tools this session exposes. Name one next skill and stop. Do not run that skill. Do not claim a capability read or a credential scope this session did not perform.',
      zh: '用本次会话提供的工具确定 {domain}。指出下一个技能，然后停止。不要运行那个技能。不要声称本次会话没有做过的能力读取或凭据范围。',
    },
    promptWithoutDomain: {
      en: 'Resolve the selected project with the tools this session exposes. Name one next skill and stop. Do not run that skill. Do not claim a capability read or a credential scope this session did not perform.',
      zh: '用本次会话提供的工具确定当前项目。指出下一个技能，然后停止。不要运行那个技能。不要声称本次会话没有做过的能力读取或凭据范围。',
    },
  },
  {
    skill: 'project-setup',
    promptSkill: 'project-setup',
    category: 'setup',
    badge: 'free',
    estimate: null,
    rest: null,
    title: { en: 'Project setup', zh: '项目设置' },
    line: {
      en: 'Propose missing context, keywords, competitors, and the sitemap monitor.',
      zh: '列出还缺的上下文、关键词、竞争对手和站点地图监控。',
    },
    note: {
      en: 'Hosted accounts stop at 3 owned projects. That cap is a hosted contract and is unconfirmed in production.',
      zh: '托管账户最多 3 个自有项目。这是托管合同里的上限，生产环境尚未确认。',
    },
    prompt: {
      en: 'Read {domain} and propose any missing context, keywords, competitors, and the sitemap monitor. Do not connect a provider and do not run a rank check.',
      zh: '读取 {domain}，列出还缺的上下文、关键词、竞争对手和站点地图监控。不要连接数据源，也不要运行排名检查。',
    },
    promptWithoutDomain: {
      en: 'Read the selected project and propose any missing context, keywords, competitors, and the sitemap monitor. Do not connect a provider and do not run a rank check.',
      zh: '读取当前项目，列出还缺的上下文、关键词、竞争对手和站点地图监控。不要连接数据源，也不要运行排名检查。',
    },
  },
  {
    skill: 'domain-onboarding',
    promptSkill: 'domain-onboarding',
    category: 'setup',
    badge: 'free',
    estimate: null,
    rest: {
      decision: 'mark',
      twin: null,
      reason:
        'REST setup for a new domain. The skill creates a project, reviewed defaults, and first keywords, and hands an existing project to keyword-import or provider-setup. This card only proposes those writes and waits. It does not run a paid check and does not claim a provider is connected.',
    },
    pack: 'project-onboarding',
    title: { en: 'New domain', zh: '新域名' },
    line: {
      en: 'Propose a new project, its defaults, and the first keywords. An existing project is handed off.',
      zh: '提议新项目、默认设置和第一批关键词。已有项目会转交出去。',
    },
    note: {
      en: 'This card does not run a paid rank check. Connecting a provider stays with provider setup.',
      zh: '这张卡片不会运行付费排名检查。连接数据源仍由数据源设置完成。',
    },
    prompt: {
      en: 'If {domain} has no project, propose the project, reviewed defaults, and the first keywords. Wait for confirmation before each write. If the project already exists, stop and name the keyword-import or provider-setup skill. Do not run a rank check. Do not claim a provider is connected.',
      zh: '如果 {domain} 还没有项目，就提议项目、已核对的默认设置和第一批关键词。每次写入前等待确认。如果项目已经存在，就停止，并指出 keyword-import 或 provider-setup 技能。不要运行排名检查。不要声称数据源已经连上。',
    },
    promptWithoutDomain: {
      en: 'If the selected project does not exist yet, propose the project, reviewed defaults, and the first keywords. Wait for confirmation before each write. If the project already exists, stop and name the keyword-import or provider-setup skill. Do not run a rank check. Do not claim a provider is connected.',
      zh: '如果当前项目还不存在，就提议项目、已核对的默认设置和第一批关键词。每次写入前等待确认。如果项目已经存在，就停止，并指出 keyword-import 或 provider-setup 技能。不要运行排名检查。不要声称数据源已经连上。',
    },
  },
  {
    skill: 'keyword-import',
    promptSkill: 'keyword-import',
    category: 'keywords',
    badge: 'free',
    estimate: null,
    rest: {
      decision: 'mark',
      twin: null,
      reason:
        'REST keyword reconciliation. The skill reports created, skipped, and updated rows for a supplied list. This session may only have the MCP keyword tools. The prompt does not run a rank check. Connection repair is named as the provider-setup skill.',
    },
    pack: 'project-onboarding',
    title: { en: 'Keyword import', zh: '关键词导入' },
    line: {
      en: 'Reconcile a supplied keyword list with tracked keywords. It does not run a rank check.',
      zh: '把提供的关键词列表与已跟踪的关键词核对。它不会运行排名检查。',
    },
    note: {
      en: 'A connection repair is the provider-setup skill. This card does not start a paid check.',
      zh: '连接修复属于 provider-setup 技能。这张卡片不会发起付费检查。',
    },
    prompt: {
      en: 'Reconcile the keyword list I supply for {domain} with tracked keywords. Use tools this session exposes. Report created, skipped, and updated rows. Do not run a rank check. If the connection needs repair, name the provider-setup skill and stop.',
      zh: '把我为 {domain} 提供的关键词列表与已跟踪的关键词核对。使用本次会话提供的工具。报告新建、跳过和更新的行。不要运行排名检查。如果连接需要修复，指出 provider-setup 技能并停止。',
    },
    promptWithoutDomain: {
      en: 'Reconcile the keyword list I supply for the selected project with tracked keywords. Use tools this session exposes. Report created, skipped, and updated rows. Do not run a rank check. If the connection needs repair, name the provider-setup skill and stop.',
      zh: '把我为当前项目提供的关键词列表与已跟踪的关键词核对。使用本次会话提供的工具。报告新建、跳过和更新的行。不要运行排名检查。如果连接需要修复，指出 provider-setup 技能并停止。',
    },
  },
  {
    skill: 'seo-audit',
    promptSkill: 'seo-audit',
    category: 'audit',
    badge: 'credits',
    estimate: null,
    rest: null,
    title: { en: 'Site audit', zh: '站点审计' },
    line: {
      en: 'Summarize the saved audit and rank data. A fresh crawl depends on the access gate.',
      zh: '汇总已保存的审计和排名数据。新的抓取取决于访问权限。',
    },
    note: {
      en: 'Search Console history needs Search Console. A fresh crawl has no estimate.',
      zh: 'Search Console 历史需要已连接 Search Console。新的抓取没有估算。',
    },
    prompt: {
      en: 'Summarize the saved site audit and rank data for {domain}. Use Search Console history only when it is connected. Do not start a fresh crawl in this prompt.',
      zh: '汇总 {domain} 已保存的站点审计和排名数据。仅在已连接 Search Console 时使用它的历史。不要在这条提示里开始新的抓取。',
    },
    promptWithoutDomain: {
      en: 'Summarize the saved site audit and rank data for the selected project. Use Search Console history only when it is connected. Do not start a fresh crawl in this prompt.',
      zh: '汇总当前项目已保存的站点审计和排名数据。仅在已连接 Search Console 时使用它的历史。不要在这条提示里开始新的抓取。',
    },
  },
  {
    skill: 'ai-visibility-audit',
    promptSkill: 'ai-visibility-audit',
    category: 'ai-visibility',
    badge: 'credits',
    estimate: 'estimate_only before a paid comparison',
    rest: null,
    title: { en: 'AI visibility', zh: 'AI 可见度' },
    line: {
      en: 'Review saved answers, mentions, and citations. It does not launch a new run.',
      zh: '查看已保存的回答、提及和引用。它不会发起新的运行。',
    },
    note: {
      en: 'A new comparison is quoted with estimate_only before a paid call.',
      zh: '新的对比会在付费调用前用 estimate_only 报价。',
    },
    prompt: {
      en: 'Review retained AI answers, mentions, and citations for {domain}. Quote with estimate_only before any new paid comparison. Do not launch a run.',
      zh: '查看 {domain} 已保留的 AI 回答、提及和引用。在任何新的付费对比之前用 estimate_only 报价。不要发起运行。',
    },
    promptWithoutDomain: {
      en: 'Review retained AI answers, mentions, and citations for the selected project. Quote with estimate_only before any new paid comparison. Do not launch a run.',
      zh: '查看当前项目已保留的 AI 回答、提及和引用。在任何新的付费对比之前用 estimate_only 报价。不要发起运行。',
    },
  },
  {
    skill: 'keyword-opportunity-research',
    promptSkill: 'keyword-opportunity-research',
    category: 'search-console',
    badge: 'search-console',
    estimate: null,
    rest: null,
    title: { en: 'Queries you show for', zh: '已有展示的查询' },
    line: {
      en: 'List queries this project already shows for. Paid research waits for an estimate.',
      zh: '列出这个项目已经有展示的查询。付费研究要等估算。',
    },
    note: {
      en: 'Paid research uses estimate_only on research_keywords.',
      zh: '付费研究使用 research_keywords 上的 estimate_only。',
    },
    prompt: {
      en: 'List Search Console queries {domain} already shows for. Before any paid keyword research, call research_keywords with estimate_only and wait for approval. Do not add keywords.',
      zh: '列出 {domain} 在 Search Console 里已经有展示的查询。在任何付费关键词研究之前，对 research_keywords 使用 estimate_only 并等待同意。不要添加关键词。',
    },
    promptWithoutDomain: {
      en: 'List Search Console queries the selected project already shows for. Before any paid keyword research, call research_keywords with estimate_only and wait for approval. Do not add keywords.',
      zh: '列出当前项目在 Search Console 里已经有展示的查询。在任何付费关键词研究之前，对 research_keywords 使用 estimate_only 并等待同意。不要添加关键词。',
    },
  },
  {
    skill: 'rank-tracking-report',
    promptSkill: 'rank-tracking-report',
    category: 'reports',
    badge: 'free',
    estimate: null,
    rest: null,
    title: { en: 'Rank movement', zh: '排名变化' },
    line: {
      en: 'Report gains and losses from saved rank history. It does not run a new check.',
      zh: '根据已保存的排名历史报告上升和下降。它不会运行新的检查。',
    },
    note: null,
    prompt: {
      en: 'Build a rank movement report for {domain} from saved history. Default to 7 days and at most 200 keywords. Do not run a rank check.',
      zh: '根据已保存的历史，为 {domain} 做排名变化报告。默认 7 天，最多 200 个关键词。不要运行排名检查。',
    },
    promptWithoutDomain: {
      en: 'Build a rank movement report for the selected project from saved history. Default to 7 days and at most 200 keywords. Do not run a rank check.',
      zh: '根据已保存的历史，为当前项目做排名变化报告。默认 7 天，最多 200 个关键词。不要运行排名检查。',
    },
  },
  {
    skill: 'weekly-report',
    promptSkill: 'rank-tracking-report',
    category: 'reports',
    badge: 'free',
    estimate: null,
    rest: {
      decision: 'twin',
      twin: 'rank-tracking-report',
      reason:
        'REST skill. Saved week-over-week movement is the rank-tracking-report read through list_keywords, get_rank_history, and export_rank_history. The prompt does not start a check and does not treat a competitor snapshot as weekly history.',
    },
    title: { en: 'Weekly rank report', zh: '每周排名报告' },
    line: {
      en: 'Summarize saved rank changes over the last 7 days. It does not start a check.',
      zh: '汇总最近 7 天已保存的排名变化。它不会发起检查。',
    },
    note: null,
    prompt: {
      en: 'Summarize saved rank movement for {domain} over the last 7 days. Do not start a rank check, and do not treat a current competitor list as weekly history.',
      zh: '汇总 {domain} 最近 7 天已保存的排名变化。不要发起排名检查，也不要把当前竞争对手列表当作每周历史。',
    },
    promptWithoutDomain: {
      en: 'Summarize saved rank movement for the selected project over the last 7 days. Do not start a rank check, and do not treat a current competitor list as weekly history.',
      zh: '汇总当前项目最近 7 天已保存的排名变化。不要发起排名检查，也不要把当前竞争对手列表当作每周历史。',
    },
  },
  {
    skill: 'alert-triage',
    promptSkill: 'alert-triage',
    category: 'reports',
    badge: 'free',
    estimate: null,
    rest: null,
    title: { en: 'Alert triage', zh: '警报分诊' },
    line: {
      en: 'Check fired ranking alerts against saved history. Rule changes wait for confirmation.',
      zh: '用已保存的历史核对已触发的排名警报。规则变更需要先确认。',
    },
    note: null,
    prompt: {
      en: 'Triage triggered ranking alerts for {domain} against the rules and saved rank history. Propose changes and wait for confirmation. Do not run a rank check.',
      zh: '对照规则和已保存的排名历史，分诊 {domain} 已触发的排名警报。提出变更并等待确认。不要运行排名检查。',
    },
    promptWithoutDomain: {
      en: 'Triage triggered ranking alerts for the selected project against the rules and saved rank history. Propose changes and wait for confirmation. Do not run a rank check.',
      zh: '对照规则和已保存的排名历史，分诊当前项目已触发的排名警报。提出变更并等待确认。不要运行排名检查。',
    },
  },
  {
    skill: 'backlink-profile-analysis',
    promptSkill: 'backlink-profile-analysis',
    category: 'competitors',
    badge: 'credits',
    estimate: 'estimate_only on analyze_backlinks',
    rest: null,
    title: { en: 'Backlink profile', zh: '外链概况' },
    line: {
      en: 'Estimate one backlink snapshot, then wait for approval before the paid analysis.',
      zh: '先估算一次外链快照，在付费分析前等待同意。',
    },
    note: null,
    prompt: {
      en: 'For {domain}, confirm a site target and call analyze_backlinks with estimate_only. Stop for approval before the paid call. Do not start outreach or a disavow.',
      zh: '为 {domain} 确认站点目标，并对 analyze_backlinks 使用 estimate_only。在付费调用前停止并等待同意。不要开始外联或 disavow。',
    },
    promptWithoutDomain: {
      en: 'For the selected project, confirm a site target and call analyze_backlinks with estimate_only. Stop for approval before the paid call. Do not start outreach or a disavow.',
      zh: '为当前项目确认站点目标，并对 analyze_backlinks 使用 estimate_only。在付费调用前停止并等待同意。不要开始外联或 disavow。',
    },
  },
  {
    skill: 'provider-setup',
    promptSkill: 'provider-setup',
    category: 'setup',
    badge: 'free',
    estimate: null,
    rest: {
      decision: 'mark',
      twin: null,
      reason:
        'MCP tools can list, test, update, and delete a provider, and there is no skill twin. The prompt lists and tests one provider. It does not ask for a refresh token and does not promise a finished Search Console or Analytics property.',
    },
    title: { en: 'Provider setup', zh: '数据源设置' },
    line: {
      en: 'List and test one provider. Search Console and Analytics properties are chosen in the browser.',
      zh: '列出并测试一个数据源。Search Console 和 Analytics 的资源在浏览器里选择。',
    },
    note: {
      en: 'This card does not ask for a refresh token and does not finish the property step.',
      zh: '这张卡片不会索取刷新令牌，也不会完成资源选择。',
    },
    prompt: {
      en: 'List provider connections for {domain} and test the one I name. Use the provider tools in this session. Do not ask for a refresh token. Do not claim Search Console or Analytics is finished until the property is chosen in the browser.',
      zh: '列出 {domain} 的数据源连接，并测试我指出的那一个。使用本次会话里的数据源工具。不要索取刷新令牌。在浏览器里选定资源之前，不要声称 Search Console 或 Analytics 已经完成。',
    },
    promptWithoutDomain: {
      en: 'List provider connections for the selected project and test the one I name. Use the provider tools in this session. Do not ask for a refresh token. Do not claim Search Console or Analytics is finished until the property is chosen in the browser.',
      zh: '列出当前项目的数据源连接，并测试我指出的那一个。使用本次会话里的数据源工具。不要索取刷新令牌。在浏览器里选定资源之前，不要声称 Search Console 或 Analytics 已经完成。',
    },
  },
  {
    skill: 'self-host-health',
    promptSkill: 'self-host-health',
    category: 'setup',
    badge: 'free',
    estimate: null,
    rest: {
      decision: 'mark',
      twin: null,
      reason:
        'REST read-only diagnosis of liveness, readiness, and health. Those routes may be absent from this session, so the card does not promise a health verdict. The prompt reports only reads that return. It does not repair, restart, or start a rank check. Provider repair is named as the provider-setup skill.',
    },
    pack: 'instance-diagnosis',
    title: { en: 'Instance check', zh: '实例检查' },
    line: {
      en: 'Report liveness, readiness, and health when those reads are available. It does not repair anything.',
      zh: '在能够读取时报告存活、就绪和健康。它不做任何修复。',
    },
    note: {
      en: 'If those reads are missing here, the card stops. Provider repair is the provider-setup skill.',
      zh: '如果这里缺少这些读取，卡片会停止。数据源修复属于 provider-setup 技能。',
    },
    prompt: {
      en: 'Diagnose the instance used for {domain} from read-only evidence. Use only tools this session exposes. If liveness, readiness, or health is not available, say so and stop. Do not repair, restart, or start a rank check. For a provider repair, name the provider-setup skill and stop.',
      zh: '根据只读证据诊断 {domain} 使用的实例。只使用本次会话提供的工具。如果存活、就绪或健康读取不可用，就说明并停止。不要修复、重启或开始排名检查。如果要修复数据源，指出 provider-setup 技能并停止。',
    },
    promptWithoutDomain: {
      en: 'Diagnose the instance used for the selected project from read-only evidence. Use only tools this session exposes. If liveness, readiness, or health is not available, say so and stop. Do not repair, restart, or start a rank check. For a provider repair, name the provider-setup skill and stop.',
      zh: '根据只读证据诊断当前项目使用的实例。只使用本次会话提供的工具。如果存活、就绪或健康读取不可用，就说明并停止。不要修复、重启或开始排名检查。如果要修复数据源，指出 provider-setup 技能并停止。',
    },
  },
  {
    skill: 'team-api-governance',
    promptSkill: 'team-api-governance',
    category: 'setup',
    badge: 'free',
    estimate: null,
    rest: {
      decision: 'mark',
      twin: null,
      reason:
        'The skill map names only REST paths for keys, members, invites, and migration tokens. The prompt reviews metadata this session can read. It does not promise a new key, an invite, or a migration token.',
    },
    title: { en: 'Access review', zh: '访问审查' },
    line: {
      en: 'Review key, member, and migration-token metadata this session can read.',
      zh: '审查本次会话能够读取的密钥、成员和迁移令牌元数据。',
    },
    note: {
      en: 'This card does not create a key, an invite, or a migration token.',
      zh: '这张卡片不会创建密钥、邀请或迁移令牌。',
    },
    prompt: {
      en: 'Review API key, member, and migration-token metadata for {domain} using only tools this session exposes. Do not create a key, an invite, or a migration token.',
      zh: '只用本次会话提供的工具，审查 {domain} 的 API 密钥、成员和迁移令牌元数据。不要创建密钥、邀请或迁移令牌。',
    },
    promptWithoutDomain: {
      en: 'Review API key, member, and migration-token metadata for the selected project using only tools this session exposes. Do not create a key, an invite, or a migration token.',
      zh: '只用本次会话提供的工具，审查当前项目的 API 密钥、成员和迁移令牌元数据。不要创建密钥、邀请或迁移令牌。',
    },
  },
  {
    skill: 'keyword-clustering',
    promptSkill: 'keyword-clustering',
    category: 'keywords',
    badge: 'credits',
    estimate: 'estimate_only on get_keyword_metrics',
    rest: null,
    title: { en: 'Keyword groups', zh: '关键词分组' },
    line: {
      en: 'Group saved keywords into page intents. The default path does not call a SERP.',
      zh: '把已保存的关键词分成页面意图组。默认路径不调用 SERP。',
    },
    note: {
      en: 'Search Console rows need Search Console. Paid metrics use estimate_only on get_keyword_metrics.',
      zh: 'Search Console 行需要已连接 Search Console。付费指标使用 get_keyword_metrics 上的 estimate_only。',
    },
    prompt: {
      en: 'Group saved keywords for {domain} into intent-based pages using heuristics. Do not fetch SERPs. Quote estimate_only on get_keyword_metrics before any paid metrics. Do not tag or save unless I confirm.',
      zh: '用启发式方法把 {domain} 已保存的关键词分成按意图的页面组。不要获取 SERP。在任何付费指标之前，对 get_keyword_metrics 使用 estimate_only 报价。除非我确认，否则不要打标签或保存。',
    },
    promptWithoutDomain: {
      en: 'Group saved keywords on the selected project into intent-based pages using heuristics. Do not fetch SERPs. Quote estimate_only on get_keyword_metrics before any paid metrics. Do not tag or save unless I confirm.',
      zh: '用启发式方法把当前项目已保存的关键词分成按意图的页面组。不要获取 SERP。在任何付费指标之前，对 get_keyword_metrics 使用 estimate_only 报价。除非我确认，否则不要打标签或保存。',
    },
  },
  {
    skill: 'competitor-analysis',
    promptSkill: 'competitor-analysis',
    category: 'competitors',
    badge: 'credits',
    estimate: 'estimate_domain_overview_cost',
    rest: null,
    title: { en: 'One competitor', zh: '单个竞争对手' },
    line: {
      en: 'Compare one rival on tracked overlap and pages after the domain overview estimate.',
      zh: '在域名概览估算之后，比较一个对手的已跟踪词重叠和页面。',
    },
    note: {
      en: 'Optional backlinks use estimate_backlinks_cost.',
      zh: '可选的外链使用 estimate_backlinks_cost。',
    },
    prompt: {
      en: 'Compare one competitor I name with {domain}. Call estimate_domain_overview_cost before a paid overview. Optional backlinks need estimate_backlinks_cost. Do not add the competitor unless I confirm.',
      zh: '把我指出的一个竞争对手与 {domain} 比较。在付费概览之前调用 estimate_domain_overview_cost。可选外链需要 estimate_backlinks_cost。除非我确认，否则不要添加该竞争对手。',
    },
    promptWithoutDomain: {
      en: 'Compare one competitor I name with the selected project. Call estimate_domain_overview_cost before a paid overview. Optional backlinks need estimate_backlinks_cost. Do not add the competitor unless I confirm.',
      zh: '把我指出的一个竞争对手与当前项目比较。在付费概览之前调用 estimate_domain_overview_cost。可选外链需要 estimate_backlinks_cost。除非我确认，否则不要添加该竞争对手。',
    },
  },
  {
    skill: 'competitive-landscape',
    promptSkill: 'competitive-landscape',
    category: 'competitors',
    badge: 'credits',
    estimate: 'estimate_domain_overview_cost',
    rest: null,
    title: { en: 'Market map', zh: '市场对比' },
    line: {
      en: 'Compare this domain and up to five competitors after each overview estimate.',
      zh: '在每次概览估算之后，比较这个域名和最多五个竞争对手。',
    },
    note: null,
    prompt: {
      en: 'Map {domain} and up to five competitors in one market. Call estimate_domain_overview_cost before each paid overview. Do not add a competitor unless I confirm that domain.',
      zh: '在一个市场里对比 {domain} 和最多五个竞争对手。在每次付费概览之前调用 estimate_domain_overview_cost。除非我确认该域名，否则不要添加竞争对手。',
    },
    promptWithoutDomain: {
      en: 'Map the selected project and up to five competitors in one market. Call estimate_domain_overview_cost before each paid overview. Do not add a competitor unless I confirm that domain.',
      zh: '在一个市场里对比当前项目和最多五个竞争对手。在每次付费概览之前调用 estimate_domain_overview_cost。除非我确认该域名，否则不要添加竞争对手。',
    },
  },
  {
    skill: 'ai-prompt-research',
    promptSkill: 'ai-prompt-research',
    category: 'ai-visibility',
    badge: 'credits',
    estimate: null,
    rest: null,
    title: { en: 'Prompt ideas', zh: '提示词候选' },
    line: {
      en: 'Propose a small prompt set from saved context. It does not start a run.',
      zh: '根据已保存的上下文提出一小套提示词。它不会发起运行。',
    },
    note: {
      en: 'Preview uses prompt_research_suggestions_preview and still needs the access gate. Generation uses credits.',
      zh: '预览使用 prompt_research_suggestions_preview，仍然需要访问权限。生成会使用额度。',
    },
    prompt: {
      en: 'Propose a small deduplicated prompt set for {domain} from saved topics and prompts. Do not start a run or a schedule. Preview still needs the access gate.',
      zh: '根据已保存的主题和提示词，为 {domain} 提出一小套去重后的提示词。不要发起运行或排期。预览仍然需要访问权限。',
    },
    promptWithoutDomain: {
      en: 'Propose a small deduplicated prompt set for the selected project from saved topics and prompts. Do not start a run or a schedule. Preview still needs the access gate.',
      zh: '根据已保存的主题和提示词，为当前项目提出一小套去重后的提示词。不要发起运行或排期。预览仍然需要访问权限。',
    },
  },
  {
    skill: 'local-seo',
    promptSkill: 'local-seo',
    category: 'local',
    badge: 'free',
    estimate: null,
    rest: null,
    title: { en: 'Local map results', zh: '本地地图结果' },
    line: {
      en: 'Explain retained local monitor runs. A missing run id stops in the app.',
      zh: '解释已保留的本地监测运行。缺少运行 id 时在应用里停止。',
    },
    note: null,
    prompt: {
      en: 'Explain retained local monitor runs for {domain}. If no run id is available, stop. Do not create a monitor, launch a run, or read a Google Business Profile.',
      zh: '解释 {domain} 已保留的本地监测运行。如果没有运行 id 就停止。不要创建监测、发起运行，或读取 Google 商家资料。',
    },
    promptWithoutDomain: {
      en: 'Explain retained local monitor runs for the selected project. If no run id is available, stop. Do not create a monitor, launch a run, or read a Google Business Profile.',
      zh: '解释当前项目已保留的本地监测运行。如果没有运行 id 就停止。不要创建监测、发起运行，或读取 Google 商家资料。',
    },
  },
]

/**
 * Catalog the panel and the workflows route serve.
 * A pack in UNREGISTERED_SKILL_PACKS stays defined above and stays off this list.
 */
export const WORKFLOWS = WORKFLOW_ENTRIES.filter((entry) => WORKFLOW_SKILL_NAMES.includes(entry.skill))

/**
 * Reject a catalog that names an unknown skill, repeats one, uses a badge
 * outside the allowed set, or lacks English or Chinese copy.
 * @param entries - catalog rows.
 * @param skillNames - real skill names.
 */
export function validateWorkflowManifest(entries, skillNames) {
  if (!Array.isArray(entries)) throw new Error('workflow manifest is not a list')
  if (!Array.isArray(skillNames)) throw new Error('skill names are not a list')
  if (entries.length !== skillNames.length) {
    throw new Error(`workflow manifest has ${entries.length} entries, expected ${skillNames.length}`)
  }
  const allowed = new Set(skillNames)
  const seen = new Set()
  const rest = new Set(REST_SKILLS)
  for (const entry of entries) {
    const skill = entry !== null && typeof entry === 'object' ? entry.skill : undefined
    if (typeof skill !== 'string' || !allowed.has(skill)) throw new Error(`unknown skill ${skill}`)
    if (seen.has(skill)) throw new Error(`duplicate skill ${skill}`)
    seen.add(skill)
    if (!WORKFLOW_BADGES.includes(entry.badge)) throw new Error(`bad badge ${entry.badge}`)
    if (entry.badge !== BADGE_BY_SKILL[skill]) throw new Error(`badge for ${skill} does not match the skill map`)
    if ((entry.pack ?? null) !== skillPack(skill)) throw new Error(`pack for ${skill} does not match the bundle`)
    if (!WORKFLOW_CATEGORIES.includes(entry.category)) throw new Error(`bad category ${entry.category}`)
    if (typeof entry.promptSkill !== 'string' || !allowed.has(entry.promptSkill)) {
      throw new Error(`unknown skill ${entry.promptSkill}`)
    }
    if (entry.badge === 'credits') {
      const estimate = typeof entry.estimate === 'string' ? entry.estimate.trim() : ''
      if (estimate === '' && !CREDITS_WITHOUT_ESTIMATE.has(skill)) throw new Error(`missing estimate for ${skill}`)
    } else if (entry.estimate != null) {
      throw new Error(`estimate on non-credit badge ${skill}`)
    }
    for (const field of ['title', 'line', 'prompt', 'promptWithoutDomain']) {
      const value = entry[field]
      if (value === null || typeof value !== 'object') throw new Error(`missing en for ${skill} ${field}`)
      if (typeof value.en !== 'string' || value.en.trim() === '') throw new Error(`missing en for ${skill} ${field}`)
      if (typeof value.zh !== 'string' || value.zh.trim() === '') throw new Error(`missing zh for ${skill} ${field}`)
      const token = value.en.includes('{domain}') || value.zh.includes('{domain}')
      if (field === 'prompt' && !token) throw new Error(`missing domain token for ${skill}`)
      if (field !== 'prompt' && token) throw new Error(`domain token in ${skill} ${field}`)
    }
    if (entry.note != null) {
      if (typeof entry.note.en !== 'string' || entry.note.en.trim() === '') throw new Error(`missing en for ${skill} note`)
      if (typeof entry.note.zh !== 'string' || entry.note.zh.trim() === '') throw new Error(`missing zh for ${skill} note`)
    }
    if (rest.has(skill)) {
      if (entry.rest === null || typeof entry.rest !== 'object' || typeof entry.rest.reason !== 'string' || entry.rest.reason.trim() === '') {
        throw new Error(`missing rest reason for ${skill}`)
      }
      if (entry.rest.decision === 'twin') {
        if (entry.promptSkill === skill || entry.promptSkill !== entry.rest.twin) throw new Error(`twin mismatch for ${skill}`)
      } else if (entry.rest.decision === 'mark') {
        if (entry.promptSkill !== skill) throw new Error(`marked skill must prompt itself for ${skill}`)
      } else {
        throw new Error(`bad rest decision for ${skill}`)
      }
    } else if (entry.rest != null) {
      throw new Error(`unexpected rest record for ${skill}`)
    } else if (entry.promptSkill !== skill) {
      throw new Error(`prompt skill drift for ${skill}`)
    }
    if (JSON.stringify(entry).includes('\u2014') || JSON.stringify(entry).includes('\u2013')) {
      throw new Error(`dash in ${skill}`)
    }
  }
  for (const name of skillNames) {
    if (!seen.has(name)) throw new Error(`missing skill ${name}`)
  }
}

/**
 * Locale the catalog copy uses. Anything other than Chinese stays English.
 * @param locale - a BCP 47 tag from the panel.
 * @returns `zh` or `en`.
 */
export function workflowLocale(locale) {
  return typeof locale === 'string' && locale.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/**
 * Start-screen facts for each skill.
 * `source` is saved results, Search Console, or a new analysis.
 * `billing` is included, or an estimate before a paid call.
 * `needs` is the readiness the panel computes from project state.
 * Routers stay in the catalog and stay off the grid.
 */
export const START_SKILL_META = {
  'seo-coach': { surface: 'project', source: 'saved', billing: 'included', needs: null, router: true, order: 90, action: { en: 'Preview analysis', zh: '预览分析' }, result: { en: 'One next skill for this project.', zh: '这个项目的下一个技能。' } },
  bisibility: { surface: 'project', source: 'saved', billing: 'included', needs: null, router: true, order: 91, action: { en: 'Preview analysis', zh: '预览分析' }, result: { en: 'One next skill for this project.', zh: '这个项目的下一个技能。' } },
  'seo-audit': { surface: 'site-health', source: 'saved', billing: 'included', needs: 'audit', router: false, order: 0, action: { en: 'Preview first audit', zh: '预览第一次审计' }, result: { en: 'Check your site for technical SEO issues.', zh: '检查你的网站是否存在技术性 SEO 问题。' } },
  'keyword-opportunity-research': { surface: 'data-reports', source: 'search-console', billing: 'included', needs: 'search-console', router: false, order: 1, action: { en: 'Explore queries', zh: '查看查询' }, result: { en: 'The queries that already bring this domain clicks and impressions.', zh: '已经给这个域名带来点击和展示的查询。' } },
  'rank-tracking-report': { surface: 'seo', source: 'saved', billing: 'included', needs: 'keywords', router: false, order: 2, action: { en: 'Review changes', zh: '查看变化' }, result: { en: 'Which tracked keywords moved up or down.', zh: '哪些被跟踪的关键词上升或下降了。' } },
  'ai-visibility-audit': { surface: 'ai-search', source: 'saved', billing: 'estimate', needs: null, router: false, order: 3, action: { en: 'Review mentions', zh: '查看提及' }, result: { en: 'Where AI answers mention this domain.', zh: 'AI 回答在哪里提到了这个域名。' } },
  'competitor-analysis': { surface: 'seo', source: 'analysis', billing: 'estimate', needs: null, router: false, order: 4, action: { en: 'Preview comparison', zh: '预览对比' }, result: { en: 'How this domain compares with one competitor.', zh: '这个域名和某一个竞争对手相比如何。' } },
  'backlink-profile-analysis': { surface: 'seo', source: 'analysis', billing: 'estimate', needs: null, router: false, order: 5, action: { en: 'Preview analysis', zh: '预览分析' }, result: { en: 'The sites that link to this domain.', zh: '链接到这个域名的网站。' } },
  'competitive-landscape': { surface: 'seo', source: 'analysis', billing: 'estimate', needs: null, router: false, order: 6, action: { en: 'Preview comparison', zh: '预览对比' }, result: { en: 'Where this domain sits among its competitors.', zh: '这个域名在竞争对手中的位置。' } },
  'weekly-report': { surface: 'data-reports', source: 'saved', billing: 'included', needs: 'keywords', router: false, order: 7, action: { en: 'Review changes', zh: '查看变化' }, result: { en: 'A week of saved rank changes for this project.', zh: '这个项目一周里已保存的排名变化。' } },
  'alert-triage': { surface: 'data-reports', source: 'saved', billing: 'included', needs: 'alerts', router: false, order: 8, action: { en: 'Review alerts', zh: '查看警报' }, result: { en: 'The rank alerts that are waiting for a decision.', zh: '还在等待处理的排名警报。' } },
  'keyword-clustering': { surface: 'seo', source: 'analysis', billing: 'estimate', needs: 'keywords', router: false, order: 9, action: { en: 'Preview analysis', zh: '预览分析' }, result: { en: 'Groups of keywords that belong together.', zh: '属于同一组的关键词。' } },
  'ai-prompt-research': { surface: 'ai-search', source: 'analysis', billing: 'included', needs: null, router: false, order: 10, action: { en: 'Preview analysis', zh: '预览分析' }, result: { en: 'Prompts people can use to find this domain.', zh: '人们可以用来找到这个域名的提示词。' } },
  'local-seo': { surface: 'seo', source: 'saved', billing: 'included', needs: null, router: false, order: 11, action: { en: 'Preview analysis', zh: '预览分析' }, result: { en: 'How this domain shows up in local map results.', zh: '这个域名在本地地图结果中的表现。' } },
  'project-setup': { surface: 'project', source: 'saved', billing: 'included', needs: null, router: false, order: 20, action: { en: 'Preview analysis', zh: '预览分析' }, result: { en: 'The context, keywords, and competitors still missing.', zh: '还缺的上下文、关键词和竞争对手。' } },
  'domain-onboarding': { surface: 'project', source: 'analysis', billing: 'included', needs: null, router: false, order: 21, action: { en: 'Preview analysis', zh: '预览分析' }, result: { en: 'A proposed project and its first keywords.', zh: '提议中的项目和它的第一批关键词。' } },
  'keyword-import': { surface: 'seo', source: 'saved', billing: 'included', needs: 'keywords', router: false, order: 22, action: { en: 'Review changes', zh: '查看变化' }, result: { en: 'Which supplied keywords would be created or skipped.', zh: '提供的关键词里哪些会被创建或跳过。' } },
  'provider-setup': { surface: 'project', source: 'saved', billing: 'included', needs: 'search-console', router: false, order: 30, action: { en: 'Preview analysis', zh: '预览分析' }, result: { en: 'Which provider connection is still missing.', zh: '还缺哪一个数据源连接。' } },
  'self-host-health': { surface: 'project', source: 'saved', billing: 'included', needs: null, router: false, order: 31, action: { en: 'Preview analysis', zh: '预览分析' }, result: { en: 'Whether this instance can reach bisibility.', zh: '这个实例能不能连上 bisibility。' } },
  'team-api-governance': { surface: 'project', source: 'saved', billing: 'included', needs: null, router: false, order: 32, action: { en: 'Preview analysis', zh: '预览分析' }, result: { en: 'Who can use this project and its API access.', zh: '谁可以使用这个项目及其 API 访问。' } },
}

/**
 * Main palette only: deep top, accent band, light wave, mid band, deep bottom.
 * Social is defined and has no skills yet. There is no alt palette.
 */
export const CATEGORY_PALETTE = {
  seo: ['#0b3d91', '#22b8f0', '#f2fbff', '#1f6fd6', '#031033'],
  'ai-search': ['#1f1150', '#9b6cff', '#f5f0ff', '#5b34d6', '#0d0626'],
  'site-health': ['#0a3b2c', '#2fd08a', '#f1fff8', '#14916a', '#021a12'],
  'data-reports': ['#4a1d05', '#ff7a1a', '#fff6ea', '#e0a020', '#1f0a02'],
  social: ['#3d0a2e', '#ff4f6d', '#fff1f4', '#d0257f', '#1a0313'],
  project: ['#2a2c2f', '#9aa0a6', '#f4f5f6', '#5f646a', '#0e0f10'],
}

/** Tab order. An empty category, including Social, is left out of the tab list. */
export const SKILL_CATEGORY_ORDER = ['seo', 'ai-search', 'site-health', 'data-reports', 'social', 'project']

const START_SOURCES = new Set(['saved', 'search-console', 'analysis'])
const START_BILLING = new Set(['included', 'estimate'])
const START_NEEDS = new Set(['audit', 'search-console', 'keywords', 'alerts'])
const START_SURFACES = new Set(SKILL_CATEGORY_ORDER)

/**
 * Column count for the skill grid from the panel's own width.
 * @param width - panel width in pixels.
 * @returns 1, 2, or 3.
 */
export function skillGridColumns(width) {
  if (typeof width !== 'number' || !Number.isFinite(width) || width < 0) throw new Error('panel width must be a finite number')
  if (width < 560) return 1
  if (width < 860) return 2
  return 3
}

/**
 * Whether the header offers a project menu.
 * @param count - number of projects on the account.
 * @returns true only when there is more than one project.
 */
export function showProjectSwitcher(count) {
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) throw new Error('project count must be a whole number')
  return count > 1
}

/**
 * Up to two labels: a readiness gap, then an estimate, otherwise the data source.
 * @param item - a shaped skill with `needs`, `billing`, and `source`.
 * @param state - `audit`, `searchConsole`, and `keywords` flags.
 * @returns one or two label ids.
 */
export function skillLabels(item, state) {
  const flags = state !== null && typeof state === 'object' ? state : {}
  if (flags.known === false) return []
  const needs = item !== null && typeof item === 'object' ? item.needs : null
  const readiness =
    needs === 'search-console' && flags.searchConsole !== true
      ? 'connect-search'
      : needs === 'keywords' && flags.keywords === false
        ? 'add-keywords'
        : needs === 'alerts'
          ? 'no-alerts'
            : needs === 'audit' && flags.audit !== true
              ? 'no-audit'
              : null
  const labels = []
  if (readiness !== null) labels.push(readiness)
  if (item !== null && typeof item === 'object' && item.billing === 'estimate' && labels.length < 2) labels.push('estimate')
  if (labels.length === 0 && item !== null && typeof item === 'object') labels.push(item.source)
  return labels.slice(0, 2)
}

/**
 * How useful a skill is for the data this project already has.
 * Cost is not part of the score.
 * @param item - a shaped skill.
 * @param state - project flags.
 * @returns a higher number when the skill can use data that is present.
 */
export function startRelevance(item, state) {
  const flags = state !== null && typeof state === 'object' ? state : {}
  const row = item !== null && typeof item === 'object' ? item : {}
  let score = 0
  if (row.needs === 'audit' && flags.audit === true) score += 30
  if (row.needs === 'search-console' && flags.searchConsole === true) score += 30
  if (row.needs === 'keywords' && flags.keywords === true) score += 30
  if (row.source === 'saved' && flags.audit === true) score += 8
  if (row.source === 'search-console' && flags.searchConsole === true) score += 8
  if (row.source === 'saved' && row.needs === 'keywords' && flags.keywords === true) score += 4
  return score
}

/**
 * Category tabs that have at least one visible skill.
 * Social stays in the palette and stays off this list until a skill uses it.
 * @param rows - shaped workflows.
 * @returns surface ids in tab order.
 */
export function skillCategoryTabs(rows) {
  const visible = visibleStartSkills(rows, {}, 'all')
  return SKILL_CATEGORY_ORDER.filter((id) => visible.some((item) => item.surface === id))
}

/**
 * Skills for one start-screen surface, routers removed, sorted by available data.
 * `all` includes every visible skill. Routers stay registered and stay off the grid.
 * @param rows - shaped workflows.
 * @param state - project flags.
 * @param surface - `all` or a surface id.
 * @returns the rows to render.
 */
export function visibleStartSkills(rows, state, surface) {
  const list = (Array.isArray(rows) ? rows : []).filter(
    (item) => item && item.router !== true && item.skill !== 'seo-coach' && item.skill !== 'bisibility' && item.pack !== 'router',
  )
  const group = surface && surface !== 'all' ? list.filter((item) => item.surface === surface) : list
  return group
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const delta = startRelevance(b.item, state) - startRelevance(a.item, state)
      if (delta !== 0) return delta
      return (a.item.order ?? a.index) - (b.item.order ?? b.index)
    })
    .map((row) => row.item)
}

/**
 * Provider to skills, from the provider filter map
 * (bisibility-private research, providers-map.md section 3). A skill is listed when
 * one of its tools calls or configures that provider. Skills that only read saved rank
 * checks stay off the SERP providers, because those checks can belong to either one.
 * Ids that no registered skill uses stay as data, so a provider appears in the filter
 * as soon as a registered, visible skill maps to it.
 */
export const PROVIDER_SKILLS = {
  dataforseo: [
    'ai-prompt-research',
    'ai-visibility-audit',
    'backlink-profile-analysis',
    'competitive-landscape',
    'competitor-analysis',
    'domain-onboarding',
    'keyword-clustering',
    'keyword-import',
    'keyword-opportunity-research',
    'local-seo',
    'provider-setup',
    'seo-coach',
  ],
  gsc: ['keyword-clustering', 'keyword-opportunity-research', 'provider-setup', 'seo-audit'],
  serpapi: ['domain-onboarding', 'keyword-import', 'provider-setup'],
  ga4: ['provider-setup'],
  plausible: ['provider-setup'],
  ahrefs: [],
  'local-sequence': [],
}

/**
 * The only skills whose prefill names a provider, and the provider ids each one accepts.
 * provider-setup passes the id to `provider_id`. The other two pass `dataforseo` or
 * `serpapi` to `run_rank_check`. Every other tool has no provider argument, so every
 * other skill gets no sentence even when a provider is selected.
 */
export const PROVIDER_SENTENCES = {
  'provider-setup': {
    providers: ['dataforseo', 'serpapi', 'ga4', 'gsc', 'plausible'],
    text: { en: 'Use provider {provider}.', zh: '使用提供商 {provider}。' },
  },
  'domain-onboarding': {
    providers: ['dataforseo', 'serpapi'],
    text: { en: 'Use provider {provider} for the rank check.', zh: '排名检查使用提供商 {provider}。' },
  },
  'keyword-import': {
    providers: ['dataforseo', 'serpapi'],
    text: { en: 'Use provider {provider} for the rank check.', zh: '排名检查使用提供商 {provider}。' },
  },
}

/**
 * Providers that get a filter chip: at least one registered, visible skill other than
 * provider-setup uses them. A provider whose only skill is provider-setup has no chip.
 * @param rows - shaped workflows.
 * @returns provider ids in map order.
 */
export function providerChips(rows) {
  const visible = visibleStartSkills(rows, {}, 'all').filter((item) => item.skill !== 'provider-setup')
  return Object.keys(PROVIDER_SKILLS).filter((id) => visible.some((item) => Array.isArray(item.providers) && item.providers.includes(id)))
}

/**
 * The prefill for a skill with an optional provider choice.
 * @param row - a shaped workflow.
 * @param provider - selected provider ids (or one legacy id).
 * @returns the plain prompt, or the prompt plus the one provider sentence the skill accepts.
 */
export function providerPrompt(row, provider) {
  const rule = row !== null && typeof row === 'object' ? row.providerSentence : null
  if (rule === null || rule === undefined || !Array.isArray(rule.providers)) return row.prompt
  const selected = [...new Set(Array.isArray(provider) ? provider : typeof provider === 'string' ? [provider] : [])].filter((id) => rule.providers.includes(id))
  if (selected.length !== 1) return row.prompt
  return `${row.prompt} ${rule.text.replaceAll('{provider}', selected[0])}`
}

/**
 * Fill the active domain into each starter prompt.
 * @param domain - project domain, or null when the project has none.
 * @param locale - panel locale.
 * @returns rows the panel can render.
 */
export function shapeWorkflows(domain, locale) {
  const lang = workflowLocale(locale)
  const name = typeof domain === 'string' ? domain.trim() : ''
  const hasDomain = name !== ''
  return WORKFLOWS.map((entry) => {
    const template = hasDomain ? entry.prompt[lang] : entry.promptWithoutDomain[lang]
    const text = hasDomain ? template.replaceAll('{domain}', name) : template
    const meta = START_SKILL_META[entry.skill]
    return {
      skill: entry.skill,
      promptSkill: entry.promptSkill,
      category: entry.category,
      badge: entry.badge,
      pack: entry.pack ?? null,
      estimate: entry.estimate,
      title: entry.title[lang],
      line: entry.line[lang],
      note: entry.note === null ? null : entry.note[lang],
      prompt: invocablePrompt(entry.promptSkill, text),
      rest: entry.rest === null ? null : { decision: entry.rest.decision, reason: entry.rest.reason },
      surface: meta.surface,
      source: meta.source,
      billing: meta.billing,
      needs: meta.needs,
      router: meta.router === true,
      order: meta.order,
      action: meta.action[lang],
      result: meta.result[lang],
      providers: Object.keys(PROVIDER_SKILLS).filter((id) => PROVIDER_SKILLS[id].includes(entry.skill)),
      providerSentence:
        PROVIDER_SENTENCES[entry.skill] === undefined
          ? null
          : { providers: PROVIDER_SENTENCES[entry.skill].providers, text: PROVIDER_SENTENCES[entry.skill].text[lang] },
    }
  })
}

for (const name of WORKFLOW_SKILL_NAMES) {
  const meta = START_SKILL_META[name]
  if (meta === undefined) throw new Error(`missing start meta for ${name}`)
  if (!START_SURFACES.has(meta.surface)) throw new Error(`bad surface for ${name}`)
  if (!START_SOURCES.has(meta.source)) throw new Error(`bad source for ${name}`)
  if (!START_BILLING.has(meta.billing)) throw new Error(`bad billing for ${name}`)
  if (meta.needs !== null && !START_NEEDS.has(meta.needs)) throw new Error(`bad needs for ${name}`)
  if (typeof meta.order !== 'number') throw new Error(`bad order for ${name}`)
  for (const field of ['action', 'result']) {
    if (typeof meta[field].en !== 'string' || meta[field].en.trim() === '') throw new Error(`missing en for ${name} ${field}`)
    if (typeof meta[field].zh !== 'string' || meta[field].zh.trim() === '') throw new Error(`missing zh for ${name} ${field}`)
  }
}
if (JSON.stringify(START_SKILL_META).includes('\u2014') || JSON.stringify(START_SKILL_META).includes('\u2013')) {
  throw new Error('dash in start meta')
}
for (const [id, skills] of Object.entries(PROVIDER_SKILLS)) {
  for (const name of skills) {
    if (START_SKILL_META[name] === undefined) throw new Error(`provider ${id} maps unknown skill ${name}`)
  }
}
for (const [name, rule] of Object.entries(PROVIDER_SENTENCES)) {
  if (START_SKILL_META[name] === undefined) throw new Error(`provider sentence for unknown skill ${name}`)
  for (const text of [rule.text.en, rule.text.zh]) {
    if (!text.includes('{provider}') || text.includes('\u2014') || text.includes('\u2013')) throw new Error(`bad provider sentence for ${name}`)
  }
}
validateWorkflowManifest(WORKFLOWS, WORKFLOW_SKILL_NAMES)
