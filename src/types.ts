export interface SonarQubeConfig {
  host?: string
  token?: string
  project?: string
  branch?: string
}

export interface ResolveConfigOptions extends SonarQubeConfig {
  /** Explicit config file path; defaults to the XDG location. */
  configPath?: string
  /** Directory searched for sonar-project.properties; defaults to process.cwd(). */
  cwd?: string
  /** Environment to read; defaults to process.env. */
  env?: NodeJS.ProcessEnv
}

export interface QualityGateCondition {
  status: string
  metricKey: string
  comparator?: string
  errorThreshold?: string
  actualValue?: string
  periodIndex?: number
}

export interface QualityGatePeriod {
  mode?: string
  parameter?: string
  date?: string
  index?: number
}

export interface ProjectStatus {
  status: string
  conditions?: QualityGateCondition[]
  period?: QualityGatePeriod
  periods?: QualityGatePeriod[]
  ignoredConditions?: boolean
}

export interface Measure {
  metric: string
  value?: string
  bestValue?: boolean
  period?: { index?: number; value?: string }
}

export interface MeasuresComponent {
  key: string
  name?: string
  qualifier?: string
  measures: Measure[]
}

export interface TextRange {
  startLine: number
  endLine: number
  startOffset?: number
  endOffset?: number
}

export interface Issue {
  key: string
  rule: string
  severity: string
  type: string
  status: string
  component: string
  project?: string
  line?: number
  message?: string
  author?: string
  creationDate?: string
  updateDate?: string
  textRange?: TextRange
  tags?: string[]
}

export interface Paging {
  pageIndex: number
  pageSize: number
  total: number
}

export interface IssuesResult {
  projectKey: string
  branch?: string
  pullRequest?: string
  paging?: Paging
  issues: Issue[]
}

export interface IssuesQuery {
  project: string
  branch?: string
  pullRequest?: string
  severities?: string | string[]
  types?: string | string[]
  statuses?: string | string[]
  /** Page size, capped at 500. Defaults to 10. */
  limit?: number
  page?: number
  /** Restrict to the new-code period. */
  newCode?: boolean
}

export interface IssueSource {
  content: string
  snippet: string | null
  start?: number
  end?: number
  focus?: number
}

export interface Branch {
  name: string
  isMain?: boolean
  type?: string
  status?: { qualityGateStatus?: string }
  analysisDate?: string
}

export interface ProjectSummary {
  key: string
  name: string
  qualifier?: string
}

export interface ProjectsResult {
  paging?: Paging
  projects: ProjectSummary[]
}

export interface GateConditionExplanation {
  metric: string
  status: string
  failing: boolean
  comparator?: string
  threshold?: string
  actual?: string
}

export interface GateNewCodePeriod {
  mode?: string
  parameter?: string
  date?: string
}

export interface GateExplanation {
  /** OK, FAILED, warning, or no gate result. */
  status: string
  rawStatus: string
  newCodePeriod?: GateNewCodePeriod
  conditions: GateConditionExplanation[]
}

export interface IssuesSummaryQuery {
  project: string
  branch?: string
  pullRequest?: string
  /** Defaults to severities,types,statuses. */
  facets?: string | string[]
}

export interface IssuesSummary {
  projectKey: string
  branch?: string
  total: number
  /** facet name → value → count */
  facets: Record<string, Record<string, number>>
  requestedFacets: string[]
}

export interface HotspotsQuery {
  project: string
  branch?: string
  pullRequest?: string
  /** TO_REVIEW or REVIEWED */
  status?: string
  /** LOW, MEDIUM or HIGH */
  severity?: string
  /** Page size, capped at 500. Defaults to 50. */
  limit?: number
  page?: number
}

export interface Hotspot {
  key: string
  message?: string
  status?: string
  securityCategory?: string
  vulnerabilityProbability?: string
  line?: number
  /** A key in search results, an object in hotspots/show. */
  component?: string | { key: string; [field: string]: unknown }
  project?: string | { key: string; [field: string]: unknown }
  [field: string]: unknown
}

export interface HotspotsResult {
  projectKey: string
  branch?: string
  paging?: Paging
  hotspots: Hotspot[]
}

export interface RulesQuery {
  query?: string
  languages?: string | string[]
  tags?: string | string[]
  repositories?: string | string[]
  severities?: string | string[]
  /** Page size, capped at 500. Defaults to 50. */
  limit?: number
  page?: number
}

export interface Rule {
  key: string
  name?: string
  severity?: string
  lang?: string
  langName?: string
  tags?: string[]
  htmlDesc?: string
  [field: string]: unknown
}

export interface RulesResult {
  paging?: Paging
  rules: Rule[]
}

export interface MeasuresHistoryQuery {
  component: string
  metrics: string | string[]
  branch?: string
  pullRequest?: string
  /** YYYY-MM-DD */
  from?: string
  /** YYYY-MM-DD */
  to?: string
  /** Page size, capped at 500. Defaults to 100. */
  limit?: number
}

export interface MeasuresHistory {
  paging?: Paging
  measures: { metric: string; history: { date: string; value?: string }[] }[]
}

export interface ComponentTreeQuery {
  component: string
  branch?: string
  pullRequest?: string
  /** Defaults to FIL. */
  qualifiers?: string | string[]
  metricKeys?: string | string[]
  /** leaves, children or all. Defaults to leaves. */
  strategy?: string
  /** Page size, capped at 500. Defaults to 100. */
  limit?: number
}

export interface TreeComponent {
  key: string
  name?: string
  qualifier?: string
  path?: string
  measures?: Measure[]
}

export interface ComponentTree {
  paging?: Paging
  baseComponent?: TreeComponent
  components: TreeComponent[]
}

export interface DuplicationBlock {
  from: number
  size: number
  /** Key into `files`. */
  _ref?: string
}

export interface Duplications {
  duplications: { blocks: DuplicationBlock[] }[]
  files: Record<string, { key?: string; name?: string; project?: string }>
}

export interface QualityProfile {
  key: string
  name: string
  language?: string
  languageName?: string
  isDefault?: boolean
  isInherited?: boolean
  [field: string]: unknown
}
