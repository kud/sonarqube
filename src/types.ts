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
