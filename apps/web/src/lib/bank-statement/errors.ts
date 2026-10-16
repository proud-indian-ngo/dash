/** A refusal from the bank statement server whose message is safe to show. */
export class StatementInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatementInputError";
  }
}
