/**
 * An expected failure the caller caused. Start answers with its status, and
 * Error Tracking skips it. Server functions send the client only the message.
 */
export class HttpError extends Error {
  readonly status: 401 | 403 | 404;

  constructor(status: 401 | 403 | 404, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}
