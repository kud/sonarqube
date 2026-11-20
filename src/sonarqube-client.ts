import {
  MissingHostError,
  SonarQubeAuthError,
  SonarQubeHttpError,
} from "./errors.js"
import { explainGate } from "./gate.js"
import type {
  Branch,
  ComponentTree,
  ComponentTreeQuery,
  Duplications,
  Hotspot,
  HotspotsQuery,
  HotspotsResult,
  IssuesSummary,
  IssuesSummaryQuery,
  MeasuresHistory,
  MeasuresHistoryQuery,
  QualityProfile,
  Rule,
  RulesQuery,
  RulesResult,
  GateExplanation,
  IssueSource,
  Issue,
  IssuesQuery,
  IssuesResult,
  MeasuresComponent,
  ProjectStatus,
  ProjectsResult,
  SonarQubeConfig,
} from "./types.js"

type Params = Record<string, string | number | boolean | string[] | undefined>

const MAX_PAGE_SIZE = 500
const DEFAULT_FACETS = "severities,types,statuses"

const toQuery = (params: Params): string => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue
    search.set(key, Array.isArray(value) ? value.join(",") : String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ""
}

const asList = (value?: string | string[]) =>
  Array.isArray(value) ? value.join(",") : value

export class SonarQubeClient {
  readonly host: string
  private readonly token?: string
  private readonly tokenEnv?: string

  constructor(config: SonarQubeConfig) {
    if (!config.host) throw new MissingHostError()
    this.host = config.host.replace(/\/+$/, "")
    this.token = config.token || undefined
    this.tokenEnv = config.tokenEnv
  }

  private authHeaders(): Record<string, string> {
    if (!this.token) return {}
    const basic = Buffer.from(`${this.token}:`).toString("base64")
    return { Authorization: `Basic ${basic}` }
  }

  private async fetchRaw(path: string, params: Params): Promise<Response> {
    const res = await fetch(`${this.host}${path}${toQuery(params)}`, {
      headers: { Accept: "application/json, text/plain", ...this.authHeaders() },
    })
    if (res.status === 401)
      throw new SonarQubeAuthError(path, Boolean(this.token), this.tokenEnv)
    if (!res.ok) throw new SonarQubeHttpError(res.status, path)
    return res
  }

  private async getJson<T = any>(path: string, params: Params = {}): Promise<T> {
    return (await this.fetchRaw(path, params)).json() as Promise<T>
  }

  private async getText(path: string, params: Params = {}): Promise<string> {
    return (await this.fetchRaw(path, params)).text()
  }

  /** Quality gate status for a project, branch or pull request. */
  async getProjectStatus(query: {
    project: string
    branch?: string
    pullRequest?: string
  }): Promise<ProjectStatus> {
    const res = await this.getJson("/api/qualitygates/project_status", {
      projectKey: query.project,
      branch: query.branch,
      pullRequest: query.pullRequest,
    })
    return res.projectStatus
  }

  /** "Why is the gate red" for a project, branch or pull request. */
  async explainGate(query: {
    project: string
    branch?: string
    pullRequest?: string
  }): Promise<GateExplanation> {
    return explainGate(await this.getProjectStatus(query))
  }

  async getMeasures(query: {
    project: string
    metricKeys: string | string[]
    branch?: string
    pullRequest?: string
  }): Promise<MeasuresComponent | null> {
    const res = await this.getJson("/api/measures/component", {
      component: query.project,
      metricKeys: asList(query.metricKeys),
      branch: query.branch,
      pullRequest: query.pullRequest,
    })
    return res.component ?? null
  }

  async getIssues(query: IssuesQuery): Promise<IssuesResult> {
    const limit = query.limit ?? 10
    const params: Params = {
      componentKeys: query.project,
      p: query.page ?? 1,
      ps: Math.min(limit, MAX_PAGE_SIZE),
      branch: query.branch,
      pullRequest: query.pullRequest,
      severities: asList(query.severities),
      types: asList(query.types),
      statuses: asList(query.statuses),
    }
    if (!query.statuses || query.statuses.length === 0) params.resolved = false
    if (query.newCode) params.inNewCodePeriod = true

    const res = await this.searchIssues(params)
    return {
      projectKey: query.project,
      branch: query.branch,
      pullRequest: query.pullRequest,
      paging: res.paging,
      issues: (res.issues ?? []).slice(0, limit),
    }
  }

  // Older servers reject inNewCodePeriod with a 400; they only know sinceLeakPeriod.
  private async searchIssues(params: Params) {
    try {
      return await this.getJson("/api/issues/search", params)
    } catch (err) {
      const rejected =
        params.inNewCodePeriod &&
        err instanceof SonarQubeHttpError &&
        err.status === 400
      if (!rejected) throw err
      const { inNewCodePeriod, ...rest } = params
      return this.getJson("/api/issues/search", {
        ...rest,
        sinceLeakPeriod: true,
      })
    }
  }

  /** Source lines around an issue, or null when the source cannot be fetched. */
  async getIssueSource(
    issue: Pick<Issue, "component" | "line" | "textRange">,
    contextLines = 5,
  ): Promise<IssueSource | null> {
    if (!issue?.component) return null
    const content = await this.fetchSourceContent(issue.component)
    if (!content) return null

    const focus = issue.line || issue.textRange?.startLine
    if (!focus) return { content, snippet: null }

    const lines = content.split(/\r?\n/)
    const start = Math.max(1, focus - contextLines)
    const end = Math.min(lines.length, focus + contextLines)
    const snippet: string[] = []
    for (let ln = start; ln <= end; ln++) {
      const marker = ln === focus ? ">" : " "
      snippet.push(`${marker} ${String(ln).padStart(4)} | ${lines[ln - 1]}`)
    }
    return { content, snippet: snippet.join("\n"), start, end, focus }
  }

  private async fetchSourceContent(key: string): Promise<string | null> {
    try {
      return await this.getText("/api/sources/raw", { key })
    } catch {
      try {
        const show = await this.getJson("/api/sources/show", { key })
        if (!Array.isArray(show.sources)) return null
        return show.sources.map((l: { code: string }) => l.code).join("\n")
      } catch {
        return null
      }
    }
  }

  async getBranches(project: string): Promise<Branch[]> {
    const res = await this.getJson("/api/project_branches/list", { project })
    return res.branches ?? []
  }

  /** One issue by key, or null when the server does not know it. */
  async getIssue(key: string): Promise<Issue | null> {
    const res = await this.getJson("/api/issues/search", { issues: key, ps: 1 })
    return res.issues?.[0] ?? null
  }

  /** Issue counts per facet; the list itself is not fetched. */
  async getIssuesSummary(query: IssuesSummaryQuery): Promise<IssuesSummary> {
    const facets = asList(query.facets) || DEFAULT_FACETS
    const res = await this.getJson("/api/issues/search", {
      componentKeys: query.project,
      branch: query.branch,
      pullRequest: query.pullRequest,
      p: 1,
      ps: 1,
      facets,
    })
    const counts: Record<string, Record<string, number>> = {}
    for (const facet of res.facets ?? []) {
      counts[facet.property] = Object.fromEntries(
        (facet.values ?? []).map((v: { val: string; count: number }) => [v.val, v.count]),
      )
    }
    return {
      projectKey: query.project,
      branch: query.branch,
      total: res.paging?.total ?? res.total ?? 0,
      facets: counts,
      requestedFacets: facets.split(","),
    }
  }

  async searchHotspots(query: HotspotsQuery): Promise<HotspotsResult> {
    const res = await this.getJson("/api/hotspots/search", {
      projectKey: query.project,
      branch: query.branch,
      pullRequest: query.pullRequest,
      status: query.status,
      severity: query.severity,
      p: query.page ?? 1,
      ps: Math.min(query.limit ?? 50, MAX_PAGE_SIZE),
    })
    return {
      projectKey: query.project,
      branch: query.branch,
      paging: res.paging,
      hotspots: res.hotspots ?? [],
    }
  }

  async getHotspot(key: string): Promise<Hotspot | null> {
    const res = await this.getJson("/api/hotspots/show", { hotspot: key })
    return res && res.key ? res : (res?.hotspot ?? null)
  }

  async searchRules(query: RulesQuery = {}): Promise<RulesResult> {
    const res = await this.getJson("/api/rules/search", {
      q: query.query,
      languages: asList(query.languages),
      tags: asList(query.tags),
      repositories: asList(query.repositories),
      severities: asList(query.severities),
      p: query.page ?? 1,
      ps: Math.min(query.limit ?? 50, MAX_PAGE_SIZE),
    })
    return { paging: res.paging, rules: res.rules ?? [] }
  }

  async getRule(key: string): Promise<Rule | null> {
    const res = await this.getJson("/api/rules/show", { key })
    return res.rule ?? null
  }

  async getMeasuresHistory(query: MeasuresHistoryQuery): Promise<MeasuresHistory> {
    const res = await this.getJson("/api/measures/search_history", {
      component: query.component,
      metrics: asList(query.metrics),
      branch: query.branch,
      pullRequest: query.pullRequest,
      from: query.from,
      to: query.to,
      ps: Math.min(query.limit ?? 100, MAX_PAGE_SIZE),
    })
    return { paging: res.paging, measures: res.measures ?? [] }
  }

  /** Measures come back only when metricKeys are given (a different endpoint). */
  async getComponentTree(query: ComponentTreeQuery): Promise<ComponentTree> {
    const metricKeys = asList(query.metricKeys)
    const path = metricKeys ? "/api/measures/component_tree" : "/api/components/tree"
    const res = await this.getJson(path, {
      component: query.component,
      branch: query.branch,
      pullRequest: query.pullRequest,
      qualifiers: asList(query.qualifiers) ?? "FIL",
      metricKeys,
      strategy: query.strategy ?? "leaves",
      ps: Math.min(query.limit ?? 100, MAX_PAGE_SIZE),
    })
    return {
      paging: res.paging,
      baseComponent: res.baseComponent,
      components: res.components ?? [],
    }
  }

  async getDuplications(query: {
    key: string
    branch?: string
    pullRequest?: string
  }): Promise<Duplications> {
    const res = await this.getJson("/api/duplications/show", {
      key: query.key,
      branch: query.branch,
      pullRequest: query.pullRequest,
    })
    return { duplications: res.duplications ?? [], files: res.files ?? {} }
  }

  async searchQualityProfiles(
    query: { language?: string; project?: string } = {},
  ): Promise<QualityProfile[]> {
    const res = await this.getJson("/api/qualityprofiles/search", {
      language: query.language,
      project: query.project,
    })
    return res.profiles ?? []
  }

  async searchProjects(
    query: { query?: string; limit?: number; page?: number } = {},
  ): Promise<ProjectsResult> {
    const res = await this.getJson("/api/components/search", {
      qualifiers: "TRK",
      q: query.query,
      p: query.page ?? 1,
      ps: Math.min(query.limit ?? 50, MAX_PAGE_SIZE),
    })
    return { paging: res.paging, projects: res.components ?? [] }
  }
}
