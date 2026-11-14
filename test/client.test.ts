import test from "node:test"
import assert from "node:assert/strict"
import { SonarQubeClient, SonarQubeHttpError, SonarQubeAuthError } from "../src/index.js"
import { startFakeSonarQube } from "./fake-sonarqube.js"

test("sends the token as basic-auth username with an empty password", async () => {
  const fake = await startFakeSonarQube(() => ({
    body: { projectStatus: { status: "OK" } },
  }))
  try {
    const client = new SonarQubeClient({ host: fake.host, token: "tok123" })
    await client.getProjectStatus({ project: "my-project" })
    const expected = "Basic " + Buffer.from("tok123:").toString("base64")
    assert.equal(fake.requests[0].authorization, expected)
  } finally {
    await fake.close()
  }
})

test("sends no Authorization header without a token", async () => {
  const fake = await startFakeSonarQube(() => ({
    body: { projectStatus: { status: "OK" } },
  }))
  try {
    await new SonarQubeClient({ host: fake.host }).getProjectStatus({
      project: "my-project",
    })
    assert.equal(fake.requests[0].authorization, undefined)
  } finally {
    await fake.close()
  }
})

test("project status passes branch and pull request", async () => {
  const fake = await startFakeSonarQube(() => ({
    body: { projectStatus: { status: "ERROR" } },
  }))
  try {
    const client = new SonarQubeClient({ host: fake.host + "/" })
    const status = await client.getProjectStatus({
      project: "my-project",
      branch: "feature/x",
    })
    await client.getProjectStatus({ project: "my-project", pullRequest: "42" })
    assert.equal(status.status, "ERROR")
    assert.equal(fake.requests[0].path, "/api/qualitygates/project_status")
    assert.deepEqual(fake.requests[0].query, {
      projectKey: "my-project",
      branch: "feature/x",
    })
    assert.deepEqual(fake.requests[1].query, {
      projectKey: "my-project",
      pullRequest: "42",
    })
  } finally {
    await fake.close()
  }
})

test("measures join the metric list and pass the branch", async () => {
  const fake = await startFakeSonarQube(() => ({
    body: {
      component: {
        key: "my-project",
        measures: [{ metric: "bugs", value: "3" }],
      },
    },
  }))
  try {
    const client = new SonarQubeClient({ host: fake.host })
    const component = await client.getMeasures({
      project: "my-project",
      metricKeys: ["bugs", "coverage"],
      branch: "main",
    })
    assert.equal(component?.measures[0].value, "3")
    assert.equal(fake.requests[0].path, "/api/measures/component")
    assert.deepEqual(fake.requests[0].query, {
      component: "my-project",
      metricKeys: "bugs,coverage",
      branch: "main",
    })
  } finally {
    await fake.close()
  }
})

test("issues default to resolved=false when no statuses are given", async () => {
  const fake = await startFakeSonarQube(() => ({
    body: { issues: [], paging: { total: 0 } },
  }))
  try {
    const client = new SonarQubeClient({ host: fake.host })
    await client.getIssues({ project: "my-project" })
    await client.getIssues({
      project: "my-project",
      statuses: ["OPEN", "CONFIRMED"],
    })
    assert.equal(fake.requests[0].query.resolved, "false")
    assert.equal(fake.requests[1].query.resolved, undefined)
    assert.equal(fake.requests[1].query.statuses, "OPEN,CONFIRMED")
  } finally {
    await fake.close()
  }
})

test("issues pass filters, branch, paging and cap the page size", async () => {
  const fake = await startFakeSonarQube(() => ({
    body: {
      issues: [{ key: "a" }, { key: "b" }, { key: "c" }],
      paging: { total: 3 },
    },
  }))
  try {
    const client = new SonarQubeClient({ host: fake.host })
    const result = await client.getIssues({
      project: "my-project",
      branch: "feature/x",
      severities: "BLOCKER,CRITICAL",
      types: ["BUG"],
      limit: 2,
      page: 3,
    })
    assert.equal(result.issues.length, 2)
    assert.deepEqual(fake.requests[0].query, {
      componentKeys: "my-project",
      p: "3",
      ps: "2",
      branch: "feature/x",
      severities: "BLOCKER,CRITICAL",
      types: "BUG",
      resolved: "false",
    })
    await client.getIssues({ project: "my-project", limit: 9999 })
    assert.equal(fake.requests[1].query.ps, "500")
  } finally {
    await fake.close()
  }
})

test("newCode sends inNewCodePeriod=true", async () => {
  const fake = await startFakeSonarQube(() => ({ body: { issues: [] } }))
  try {
    await new SonarQubeClient({ host: fake.host }).getIssues({
      project: "my-project",
      newCode: true,
    })
    assert.equal(fake.requests.length, 1)
    assert.equal(fake.requests[0].query.inNewCodePeriod, "true")
    assert.equal(fake.requests[0].query.sinceLeakPeriod, undefined)
  } finally {
    await fake.close()
  }
})

test("newCode retries once with sinceLeakPeriod on HTTP 400", async () => {
  const fake = await startFakeSonarQube((req) =>
    req.query.inNewCodePeriod
      ? { status: 400, body: { errors: [{ msg: "unknown parameter" }] } }
      : { body: { issues: [{ key: "legacy" }] } },
  )
  try {
    const result = await new SonarQubeClient({ host: fake.host }).getIssues({
      project: "my-project",
      newCode: true,
    })
    assert.equal(result.issues[0].key, "legacy")
    assert.equal(fake.requests.length, 2)
    assert.equal(fake.requests[1].query.inNewCodePeriod, undefined)
    assert.equal(fake.requests[1].query.sinceLeakPeriod, "true")
  } finally {
    await fake.close()
  }
})

test("a 400 without newCode is not retried", async () => {
  const fake = await startFakeSonarQube(() => ({ status: 400 }))
  try {
    await assert.rejects(
      new SonarQubeClient({ host: fake.host }).getIssues({
        project: "my-project",
      }),
      (err: unknown) => err instanceof SonarQubeHttpError && err.status === 400,
    )
    assert.equal(fake.requests.length, 1)
  } finally {
    await fake.close()
  }
})

test("HTTP errors never carry the token", async () => {
  const fake = await startFakeSonarQube(() => ({ status: 401 }))
  try {
    await assert.rejects(
      new SonarQubeClient({
        host: fake.host,
        token: "tok123",
      }).getProjectStatus({ project: "my-project" }),
      (err: Error) =>
        !err.message.includes("tok123") && err.message.includes("401"),
    )
  } finally {
    await fake.close()
  }
})

test("a 401 throws SonarQubeAuthError naming the token env var", async () => {
  const fake = await startFakeSonarQube(() => ({ status: 401 }))
  try {
    const client = new SonarQubeClient({
      host: fake.host,
      token: "tok123",
      tokenEnv: "SONAR_TOKEN",
    })
    await assert.rejects(
      client.getProjectStatus({ project: "my-project" }),
      (err: unknown) => {
        assert.ok(err instanceof SonarQubeAuthError)
        assert.ok(err instanceof SonarQubeHttpError)
        const authErr = err as SonarQubeAuthError
        assert.equal(authErr.status, 401)
        assert.ok(authErr.message.includes("SONAR_TOKEN"))
        assert.ok(!authErr.message.includes("tok123"))
        return true
      },
    )
  } finally {
    await fake.close()
  }
})

test("issue source returns a marked snippet from the raw endpoint", async () => {
  const source = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join(
    "\n",
  )
  const fake = await startFakeSonarQube(() => ({ text: source }))
  try {
    const client = new SonarQubeClient({ host: fake.host })
    const result = await client.getIssueSource(
      { component: "my-project:src/a.ts", line: 10 },
      2,
    )
    assert.equal(fake.requests[0].path, "/api/sources/raw")
    assert.equal(fake.requests[0].query.key, "my-project:src/a.ts")
    assert.equal(result?.start, 8)
    assert.equal(result?.end, 12)
    assert.match(result!.snippet!, /> {3}10 \| line 10/)
    assert.match(result!.snippet!, /^ {5}8 \| line 8/m)
  } finally {
    await fake.close()
  }
})

test("issue source falls back to sources/show, and is null on failure", async () => {
  const fake = await startFakeSonarQube((req) =>
    req.path === "/api/sources/raw"
      ? { status: 404 }
      : { body: { sources: [{ code: "one" }, { code: "two" }] } },
  )
  try {
    const client = new SonarQubeClient({ host: fake.host })
    const result = await client.getIssueSource(
      { component: "my-project:a.ts", line: 2 },
      1,
    )
    assert.equal(result?.content, "one\ntwo")
    assert.equal(fake.requests[1].path, "/api/sources/show")
  } finally {
    await fake.close()
  }
  const broken = await startFakeSonarQube(() => ({ status: 500 }))
  try {
    const client = new SonarQubeClient({ host: broken.host })
    assert.equal(await client.getIssueSource({ component: "x", line: 1 }), null)
  } finally {
    await broken.close()
  }
})

test("branches and project search hit the right endpoints", async () => {
  const fake = await startFakeSonarQube((req) =>
    req.path === "/api/project_branches/list"
      ? { body: { branches: [{ name: "main", isMain: true }] } }
      : {
          body: {
            paging: { total: 1 },
            components: [{ key: "my-project", name: "My Project" }],
          },
        },
  )
  try {
    const client = new SonarQubeClient({ host: fake.host })
    const branches = await client.getBranches("my-project")
    const projects = await client.searchProjects({ query: "my", limit: 5 })
    assert.equal(branches[0].name, "main")
    assert.deepEqual(fake.requests[0].query, { project: "my-project" })
    assert.equal(projects.projects[0].key, "my-project")
    assert.deepEqual(fake.requests[1].query, {
      qualifiers: "TRK",
      q: "my",
      p: "1",
      ps: "5",
    })
  } finally {
    await fake.close()
  }
})

test("explainGate fetches the status and models it", async () => {
  const fake = await startFakeSonarQube(() => ({
    body: {
      projectStatus: {
        status: "ERROR",
        conditions: [
          {
            status: "ERROR",
            metricKey: "new_coverage",
            comparator: "LT",
            errorThreshold: "80",
            actualValue: "42.5",
          },
        ],
      },
    },
  }))
  try {
    const why = await new SonarQubeClient({ host: fake.host }).explainGate({
      project: "my-project",
    })
    assert.equal(why.status, "FAILED")
    assert.equal(why.conditions[0].actual, "42.5")
  } finally {
    await fake.close()
  }
})
