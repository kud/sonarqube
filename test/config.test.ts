import test, { beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  resolveConfig,
  readSonarProjectKey,
  configFilePath,
  writeConfig,
  redactConfig,
  redactToken,
  SonarQubeClient,
  MissingHostError,
} from "../src/index.js"

const ENV_KEYS = [
  "SONARQUBE_DASH_TOKEN",
  "SONARQUBE_TOKEN",
  "SONAR_TOKEN",
  "SONARQUBE_DASH_HOST",
  "SONAR_HOST_URL",
  "SONARQUBE_DASH_PROJECT",
  "SONARQUBE_DASH_BRANCH",
  "XDG_CONFIG_HOME",
]

let saved: Record<string, string | undefined>
let tmp: string

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
  for (const k of ENV_KEYS) delete process.env[k]
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sonarqube-core-"))
  process.env.XDG_CONFIG_HOME = path.join(tmp, "xdg")
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  fs.rmSync(tmp, { recursive: true, force: true })
})

const writeFile = (data: object) => {
  const file = configFilePath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data))
}

test("config file lives under XDG_CONFIG_HOME/sonarqube-dash-cli", () => {
  assert.equal(
    configFilePath(),
    path.join(tmp, "xdg", "sonarqube-dash-cli", "config.json"),
  )
})

test("file < env < explicit options", () => {
  writeFile({ host: "https://file.example.com", token: "file", project: "from-file" })
  assert.equal(resolveConfig({ cwd: tmp }).host, "https://file.example.com")

  process.env.SONARQUBE_DASH_HOST = "https://env.example.com"
  assert.equal(resolveConfig({ cwd: tmp }).host, "https://env.example.com")
  assert.equal(resolveConfig({ cwd: tmp }).project, "from-file")

  const explicit = resolveConfig({ cwd: tmp, host: "https://flag.example.com" })
  assert.equal(explicit.host, "https://flag.example.com")
})

test("undefined and empty values never overwrite", () => {
  writeFile({ host: "https://file.example.com" })
  process.env.SONARQUBE_DASH_HOST = ""
  const cfg = resolveConfig({ cwd: tmp, host: undefined, token: "" })
  assert.equal(cfg.host, "https://file.example.com")
  assert.equal(cfg.token, undefined)
})

test("token env order: DASH, then SONARQUBE_TOKEN, then SONAR_TOKEN", () => {
  process.env.SONAR_TOKEN = "c"
  assert.equal(resolveConfig({ cwd: tmp }).token, "c")
  process.env.SONARQUBE_TOKEN = "b"
  assert.equal(resolveConfig({ cwd: tmp }).token, "b")
  process.env.SONARQUBE_DASH_TOKEN = "a"
  assert.equal(resolveConfig({ cwd: tmp }).token, "a")
})

test("host env order: SONARQUBE_DASH_HOST, then SONAR_HOST_URL", () => {
  process.env.SONAR_HOST_URL = "https://second.example.com"
  assert.equal(resolveConfig({ cwd: tmp }).host, "https://second.example.com")
  process.env.SONARQUBE_DASH_HOST = "https://first.example.com"
  assert.equal(resolveConfig({ cwd: tmp }).host, "https://first.example.com")
})

test("an injected env takes precedence over process.env", () => {
  process.env.SONARQUBE_DASH_HOST = "https://process.example.com"
  const cfg = resolveConfig({
    cwd: tmp,
    env: { SONAR_HOST_URL: "https://injected.example.com", XDG_CONFIG_HOME: tmp },
  })
  assert.equal(cfg.host, "https://injected.example.com")
})

test("project key falls back to sonar-project.properties", () => {
  fs.writeFileSync(
    path.join(tmp, "sonar-project.properties"),
    [
      "# sonar.projectKey=commented-out",
      "! sonar.projectKey=also-commented",
      "sonar.sources=src",
      "sonar.projectKey = my-project",
    ].join("\n"),
  )
  assert.equal(readSonarProjectKey(tmp), "my-project")
  assert.equal(resolveConfig({ cwd: tmp }).project, "my-project")
  assert.equal(resolveConfig({ cwd: tmp, project: "explicit" }).project, "explicit")
})

test("no properties file means no project key", () => {
  assert.equal(readSonarProjectKey(tmp), undefined)
  assert.equal(resolveConfig({ cwd: tmp }).project, undefined)
})

test("writeConfig merges into the existing file", () => {
  writeConfig({ host: "https://sonarqube.example.com" })
  writeConfig({ project: "my-project" })
  assert.deepEqual(resolveConfig({ cwd: tmp }), {
    host: "https://sonarqube.example.com",
    project: "my-project",
  })
})

test("a missing host is a typed error, never a silent default", () => {
  const cfg = resolveConfig({ cwd: tmp })
  assert.equal(cfg.host, undefined)
  assert.throws(() => new SonarQubeClient(cfg), MissingHostError)
})

test("redaction hides the token", () => {
  assert.equal(redactConfig({ host: "h", token: "secret" }).token, "***")
  assert.equal(redactToken("auth secret failed secret", "secret"), "auth *** failed ***")
  assert.equal(redactToken("nothing", undefined), "nothing")
})
