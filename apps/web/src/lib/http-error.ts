/**
 * An expected failure the caller caused. Start answers with its status, and
 * Error Tracking skips it. A server function sends the client its name,
 * message and status.
 */
export class HttpError extends Error {
  readonly status: 401 | 403 | 404;

  constructor(status: 401 | 403 | 404, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}
