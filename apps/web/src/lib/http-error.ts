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
