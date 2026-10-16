/**
 * A provider refused a Marker job before any conversion could have started.
 *
 * Unlike a timeout or lost response this outcome is not ambiguous: no GPU
 * worker can still be producing a result, so the durable row can fail at once
 * instead of waiting out the result grace window.
 */
export class MarkerDispatchRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarkerDispatchRejectedError";
  }
}
