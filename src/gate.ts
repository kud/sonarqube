import type {
  GateConditionExplanation,
  GateExplanation,
  ProjectStatus,
  QualityGateCondition,
} from "./types.js"

const STATUS_WORDS: Record<string, string> = {
  OK: "OK",
  ERROR: "FAILED",
  WARN: "warning",
  NONE: "no gate result",
}

const RATING_LETTERS = ["A", "B", "C", "D", "E"]

export const gateStatusWord = (status?: string): string =>
  (status && STATUS_WORDS[status]) || "no gate result"

/** SonarQube stores ratings as 1..5; people read them as A..E. */
export const formatMetricValue = (
  metricKey: string,
  value?: string,
): string | undefined => {
  if (value === undefined || value === null) return undefined
  if (!metricKey.endsWith("_rating")) return String(value)
  const letter = RATING_LETTERS[Math.round(Number(value)) - 1]
  return letter ?? String(value)
}

const explainCondition = (
  condition: QualityGateCondition,
): GateConditionExplanation => ({
  metric: condition.metricKey,
  status: condition.status,
  failing: condition.status !== "OK",
  comparator: condition.comparator,
  threshold: formatMetricValue(condition.metricKey, condition.errorThreshold),
  actual: formatMetricValue(condition.metricKey, condition.actualValue),
})

/** Answers "why is the gate red": status word, new-code period, failing conditions first. */
export const explainGate = (projectStatus: ProjectStatus): GateExplanation => {
  const period = projectStatus.period ?? projectStatus.periods?.[0]
  const conditions = (projectStatus.conditions ?? []).map(explainCondition)
  const failingFirst = [
    ...conditions.filter((c) => c.failing),
    ...conditions.filter((c) => !c.failing),
  ]
  return {
    status: gateStatusWord(projectStatus.status),
    rawStatus: projectStatus.status,
    newCodePeriod: period
      ? { mode: period.mode, parameter: period.parameter, date: period.date }
      : undefined,
    conditions: failingFirst,
  }
}
