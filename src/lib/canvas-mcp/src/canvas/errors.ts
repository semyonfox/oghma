export class CanvasError extends Error {
    readonly status: number;
    readonly canvasCode: string | undefined;
    readonly body: unknown;

    constructor(status: number, message: string, opts: { canvasCode?: string; body?: unknown } = {}) {
        super(message);
        this.name = "CanvasError";
        this.status = status;
        this.canvasCode = opts.canvasCode;
        this.body = opts.body;
    }
}
