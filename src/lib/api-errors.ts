// safe domain errors shared by HTTP handlers and background workers
// kept apart from api-error.ts, which imports auth/session, because session
// itself throws ApiError and merging the two would create an import cycle
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
