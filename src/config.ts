import fs from "fs"
import path from "path"
import os from "os"
import type { ResolveConfigOptions, SonarQubeConfig } from "./types.js"

const CONFIG_DIR_NAME = "sonarqube-dash-cli"

const TOKEN_ENV = ["SONARQUBE_DASH_TOKEN", "SONARQUBE_TOKEN", "SONAR_TOKEN"]
const HOST_ENV = ["SONARQUBE_DASH_HOST", "SONAR_HOST_URL"]

/** Resolved on every call so XDG_CONFIG_HOME changes are honoured. */
export const configFilePath = (
  env: NodeJS.ProcessEnv = process.env,
): string => {
  const base = env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config")
  return path.join(base, CONFIG_DIR_NAME, "config.json")
}

const withoutEmpty = (obj: Record<string, unknown>): SonarQubeConfig =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== ""),
  ) as SonarQubeConfig

const firstSet = (env: NodeJS.ProcessEnv, names: string[]) =>
  names.map((name) => env[name]).find((value) => value)

export const readConfigFile = (file: string): SonarQubeConfig => {
  try {
    if (!fs.existsSync(file)) return {}
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"))
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

export const writeConfig = (
  data: SonarQubeConfig,
  file: string = configFilePath(),
): { path: string; data: SonarQubeConfig } => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const merged = { ...readConfigFile(file), ...data }
  fs.writeFileSync(file, JSON.stringify(merged, null, 2) + "\n", "utf8")
  return { path: file, data: merged }
}

/** The `sonar.projectKey` of a sonar-project.properties file in `dir`, if any. */
export const readSonarProjectKey = (
  dir: string = process.cwd(),
): string | undefined => {
  const file = path.join(dir, "sonar-project.properties")
  if (!fs.existsSync(file)) return undefined
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#") || line.startsWith("!")) continue
    const match = line.match(/^([^=:\s]+)\s*[=:]\s*(.*)$/)
    if (match && match[1] === "sonar.projectKey")
      return match[2].trim() || undefined
  }
  return undefined
}

/**
 * Layered: config file < environment < explicit options. Undefined or empty
 * values never overwrite. A missing project key falls back to
 * sonar-project.properties in `cwd`.
 */
export const resolveConfig = (
  options: ResolveConfigOptions = {},
): SonarQubeConfig => {
  const env = options.env ?? process.env
  const fromFile = withoutEmpty(
    { ...readConfigFile(options.configPath ?? configFilePath(env)) },
  )
  const fromEnv = withoutEmpty({
    token: firstSet(env, TOKEN_ENV),
    host: firstSet(env, HOST_ENV),
    project: env.SONARQUBE_DASH_PROJECT,
    branch: env.SONARQUBE_DASH_BRANCH,
  })
  const explicit = withoutEmpty({
    token: options.token,
    host: options.host,
    project: options.project,
    branch: options.branch,
  })
  const merged = { ...fromFile, ...fromEnv, ...explicit }
  if (!merged.project) {
    const key = readSonarProjectKey(options.cwd)
    if (key) merged.project = key
  }
  return merged
}

/** A copy of the config that is safe to print or log. */
export const redactConfig = (config: SonarQubeConfig): SonarQubeConfig => ({
  ...config,
  ...(config.token ? { token: "***" } : {}),
})

/** Replaces every occurrence of the token in `text`. */
export const redactToken = (text: string, token?: string): string =>
  token ? text.split(token).join("***") : text
