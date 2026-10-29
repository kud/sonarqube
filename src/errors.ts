export class MissingHostError extends Error {
  constructor() {
    super(
      "No SonarQube host configured. Set SONARQUBE_DASH_HOST or SONAR_HOST_URL, add `host` to the config file, or pass it explicitly.",
    )
    this.name = "MissingHostError"
  }
}

export class SonarQubeHttpError extends Error {
  readonly status: number
  readonly path: string

  constructor(status: number, path: string, detail?: string) {
    super(`SonarQube request to ${path} failed with HTTP ${status}${detail ? `: ${detail}` : ""}`)
    this.name = "SonarQubeHttpError"
    this.status = status
    this.path = path
  }
}
