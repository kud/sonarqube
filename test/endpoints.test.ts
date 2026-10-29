import test from "node:test"
import assert from "node:assert/strict"
import { SonarQubeClient } from "../src/index.js"
import { startFakeSonarQube, type Handler } from "./fake-sonarqube.js"

const withFake = async (
  handler: Handler,
  run: (
    client: SonarQubeClient,
    requests: { path: string; query: Record<string, string> }[],
  ) => Promise<void>,
) => {
  const fake = await startFakeSonarQube(handler)
  try {
    await run(new SonarQubeClient({ host: fake.host }), fake.requests)
  } finally {
    await fake.close()
  }
}

test("getIssue searches by key and is null when absent", async () => {
  await withFake(
    (req) => ({
      body: { issues: req.query.issues === "AX1" ? [{ key: "AX1" }] : [] },
    }),
    async (client, requests) => {
      assert.equal((await client.getIssue("AX1"))?.key, "AX1")
      assert.equal(await client.getIssue("nope"), null)
      assert.equal(requests[0].path, "/api/issues/search")
      assert.deepEqual(requests[0].query, { issues: "AX1", ps: "1" })
    },
  )
})

test("issues summary turns facets into counts", async () => {
  await withFake(
    () => ({
      body: {
        paging: { total: 7 },
        facets: [
          {
            property: "severities",
            values: [
              { val: "MAJOR", count: 5 },
              { val: "MINOR", count: 2 },
            ],
          },
        ],
      },
    }),
    async (client, requests) => {
      const summary = await client.getIssuesSummary({
        project: "my-project",
        branch: "main",
      })
      assert.equal(summary.total, 7)
      assert.deepEqual(summary.facets, { severities: { MAJOR: 5, MINOR: 2 } })
      assert.deepEqual(summary.requestedFacets, [
        "severities",
        "types",
        "statuses",
      ])
      assert.deepEqual(requests[0].query, {
        componentKeys: "my-project",
        branch: "main",
        p: "1",
        ps: "1",
        facets: "severities,types,statuses",
      })
    },
  )
})

test("hotspots search and show", async () => {
  await withFake(
    (req) =>
      req.path === "/api/hotspots/show"
        ? { body: { key: "H1", component: { key: "my-project:src/a.ts" } } }
        : { body: { hotspots: [{ key: "H1" }], paging: { total: 1 } } },
    async (client, requests) => {
      const result = await client.searchHotspots({
        project: "my-project",
        status: "TO_REVIEW",
        limit: 900,
      })
      assert.equal(result.hotspots.length, 1)
      assert.deepEqual(requests[0].query, {
        projectKey: "my-project",
        status: "TO_REVIEW",
        p: "1",
        ps: "500",
      })
      assert.equal((await client.getHotspot("H1"))?.key, "H1")
      assert.deepEqual(requests[1].query, { hotspot: "H1" })
    },
  )
})

test("rules search and show", async () => {
  await withFake(
    (req) =>
      req.path === "/api/rules/show"
        ? { body: { rule: { key: "ts:S1" } } }
        : { body: { rules: [{ key: "ts:S1" }] } },
    async (client, requests) => {
      await client.searchRules({
        query: "regex",
        languages: ["ts", "js"],
        repositories: "typescript",
      })
      assert.deepEqual(requests[0].query, {
        q: "regex",
        languages: "ts,js",
        repositories: "typescript",
        p: "1",
        ps: "50",
      })
      assert.equal((await client.getRule("ts:S1"))?.key, "ts:S1")
      assert.equal(requests[1].path, "/api/rules/show")
    },
  )
})

test("measures history passes the window", async () => {
  await withFake(
    () => ({ body: { measures: [{ metric: "coverage", history: [] }] } }),
    async (client, requests) => {
      const history = await client.getMeasuresHistory({
        component: "my-project",
        metrics: ["coverage"],
        from: "2026-01-01",
      })
      assert.equal(history.measures[0].metric, "coverage")
      assert.equal(requests[0].path, "/api/measures/search_history")
      assert.deepEqual(requests[0].query, {
        component: "my-project",
        metrics: "coverage",
        from: "2026-01-01",
        ps: "100",
      })
    },
  )
})

test("component tree uses measures/component_tree only with metric keys", async () => {
  await withFake(
    () => ({ body: { components: [{ key: "my-project:a.ts" }] } }),
    async (client, requests) => {
      await client.getComponentTree({ component: "my-project" })
      await client.getComponentTree({
        component: "my-project",
        metricKeys: "coverage",
      })
      assert.equal(requests[0].path, "/api/components/tree")
      assert.equal(requests[0].query.qualifiers, "FIL")
      assert.equal(requests[1].path, "/api/measures/component_tree")
      assert.equal(requests[1].query.metricKeys, "coverage")
    },
  )
})

test("duplications and quality profiles", async () => {
  await withFake(
    (req) =>
      req.path === "/api/duplications/show"
        ? {
            body: {
              duplications: [{ blocks: [{ from: 1, size: 3, _ref: "1" }] }],
              files: { "1": { key: "f" } },
            },
          }
        : { body: { profiles: [{ key: "p", name: "Sonar way" }] } },
    async (client, requests) => {
      const dups = await client.getDuplications({
        key: "my-project:a.ts",
        branch: "main",
      })
      assert.equal(dups.duplications[0].blocks[0].size, 3)
      assert.deepEqual(requests[0].query, {
        key: "my-project:a.ts",
        branch: "main",
      })
      const profiles = await client.searchQualityProfiles({
        project: "my-project",
      })
      assert.equal(profiles[0].name, "Sonar way")
      assert.equal(requests[1].path, "/api/qualityprofiles/search")
    },
  )
})
