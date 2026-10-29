import test from "node:test"
import assert from "node:assert/strict"
import {
  explainGate,
  gateStatusWord,
  formatMetricValue,
  formatIssueAuthor,
  formatDate,
} from "../src/index.js"

test("status words", () => {
  assert.equal(gateStatusWord("OK"), "OK")
  assert.equal(gateStatusWord("ERROR"), "FAILED")
  assert.equal(gateStatusWord("WARN"), "warning")
  assert.equal(gateStatusWord("NONE"), "no gate result")
  assert.equal(gateStatusWord(undefined), "no gate result")
})

test("failing conditions sort first, order otherwise preserved", () => {
  const why = explainGate({
    status: "ERROR",
    conditions: [
      { status: "OK", metricKey: "new_bugs", comparator: "GT", errorThreshold: "0", actualValue: "0" },
      { status: "ERROR", metricKey: "new_coverage", comparator: "LT", errorThreshold: "80", actualValue: "42.5" },
      { status: "OK", metricKey: "new_vulnerabilities", comparator: "GT", errorThreshold: "0", actualValue: "0" },
      { status: "WARN", metricKey: "new_duplicated_lines_density", comparator: "GT", errorThreshold: "3", actualValue: "5.1" },
    ],
  })
  assert.deepEqual(
    why.conditions.map((c) => c.metric),
    ["new_coverage", "new_duplicated_lines_density", "new_bugs", "new_vulnerabilities"],
  )
  assert.deepEqual(
    why.conditions.map((c) => c.failing),
    [true, true, false, false],
  )
  assert.deepEqual(why.conditions[0], {
    metric: "new_coverage",
    status: "ERROR",
    failing: true,
    comparator: "LT",
    threshold: "80",
    actual: "42.5",
  })
})

test("rating metrics map 1..5 to A..E", () => {
  const why = explainGate({
    status: "ERROR",
    conditions: [
      { status: "ERROR", metricKey: "new_security_rating", comparator: "GT", errorThreshold: "1", actualValue: "3" },
      { status: "ERROR", metricKey: "new_reliability_rating", comparator: "GT", errorThreshold: "1", actualValue: "5" },
    ],
  })
  assert.equal(why.conditions[0].threshold, "A")
  assert.equal(why.conditions[0].actual, "C")
  assert.equal(why.conditions[1].actual, "E")
  assert.equal(formatMetricValue("coverage", "3"), "3")
  assert.equal(formatMetricValue("sqale_rating", "9"), "9")
  assert.equal(formatMetricValue("sqale_rating", undefined), undefined)
})

test("new-code period comes from period, else periods[0]", () => {
  const single = explainGate({
    status: "OK",
    period: { mode: "PREVIOUS_VERSION", date: "2026-09-01T10:00:00+0000" },
  })
  assert.deepEqual(single.newCodePeriod, {
    mode: "PREVIOUS_VERSION",
    parameter: undefined,
    date: "2026-09-01T10:00:00+0000",
  })

  const list = explainGate({
    status: "OK",
    periods: [
      { index: 1, mode: "days", parameter: "30", date: "2026-10-01T00:00:00+0000" },
      { index: 2, mode: "other" },
    ],
  })
  assert.deepEqual(list.newCodePeriod, { mode: "days", parameter: "30", date: "2026-10-01T00:00:00+0000" })

  assert.equal(explainGate({ status: "NONE" }).newCodePeriod, undefined)
})

test("status word and raw status are both reported", () => {
  const why = explainGate({ status: "WARN" })
  assert.equal(why.status, "warning")
  assert.equal(why.rawStatus, "WARN")
  assert.deepEqual(why.conditions, [])
})

test("issue author is the part before @", () => {
  assert.equal(formatIssueAuthor("jane.doe@example.com"), "jane.doe")
  assert.equal(formatIssueAuthor("plain"), "plain")
  assert.equal(formatIssueAuthor(undefined), "")
})

test("dates format as YYYY-MM-DD", () => {
  assert.equal(formatDate("2026-10-01T10:15:00+0200"), "2026-10-01")
  assert.equal(formatDate("2026-10-01"), "2026-10-01")
  assert.equal(formatDate("Oct 3 2026 12:00 UTC"), "2026-10-03")
  assert.equal(formatDate(undefined), "")
  assert.equal(formatDate("nonsense"), "")
})
