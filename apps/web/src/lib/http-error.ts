/**
 * An expected failure the caller caused: input the server refuses (400), no
 * session (401), no permission (403), no record (404), a request the
 * records' current state refuses (409) or too many requests (429). Start
 * answers with its status, and Error Tracking skips it. A server function
 * sends the client its name, message and status.
 */
export class HttpError extends Error {
  readonly status: 400 | 401 | 403 | 404 | 409 | 429;

  constructor(status: HttpError["status"], message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/**
 * What a server function rethrows for a domain error written for the user.
 * A refusal becomes a 409 with only its message, which Error Tracking skips.
 * A fault (`fault: true`: missing configuration or reference data, an
 * unreachable service) is rethrown as it is, so it keeps its message and is
 * still reported.
 */
export function userFacingError(error: Error): Error {
  return "fault" in error && error.fault === true
    ? error
    : new HttpError(409, error.message);
}
