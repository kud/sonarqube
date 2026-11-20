export class MissingHostError extends Error {
  constructor() {
    super(
      "No SonarQube host configured. Set SONARQUBE_HOST or SONAR_HOST_URL, add `host` to the config file (~/.config/sonarqube/config.json), or pass it explicitly.",
    )
    this.name = "MissingHostError"
  }
}

export class SonarQubeHttpError extends Error {
  readonly status: number
  readonly path: string

  constructor(status: number, path: string, detail?: string, message?: string) {
    super(
      message ??
        `SonarQube request to ${path} failed with HTTP ${status}${detail ? `: ${detail}` : ""}`,
    )
    this.name = "SonarQubeHttpError"
    this.status = status
    this.path = path
  }
}

export class SonarQubeAuthError extends SonarQubeHttpError {
  constructor(path: string, tokenSent: boolean, tokenEnv?: string) {
    super(
      401,
      path,
      undefined,
      tokenSent
        ? tokenEnv
          ? `SonarQube rejected the token from ${tokenEnv} (HTTP 401 on ${path}). Set ${tokenEnv} to a valid user token.`
          : `SonarQube rejected the token (HTTP 401 on ${path}). Set SONARQUBE_TOKEN or SONAR_TOKEN to a valid user token.`
        : `SonarQube requires authentication (HTTP 401 on ${path}). Set SONARQUBE_TOKEN or SONAR_TOKEN to a user token.`,
    )
    this.name = "SonarQubeAuthError"
  }
}
