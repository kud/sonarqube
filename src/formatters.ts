/** The part of an issue author before the `@`. */
export const formatIssueAuthor = (author?: string | null): string =>
  author ? author.split("@")[0] : ""

/** YYYY-MM-DD from a SonarQube timestamp; empty when unparseable. */
export const formatDate = (value?: string | null): string => {
  if (!value) return ""
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
  if (match) return match[1]
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10)
}
