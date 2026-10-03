// safe domain errors shared by HTTP handlers and background workers
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public userMessage: string,
    public internalDetails?: string,
  ) {
    super(userMessage);
    this.name = "ApiError";
  }
}
