export interface SseFrame {
  event: string;
  data: string;
}

export function toSseEvent(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export function parseSseBlocks(
  chunk: string,
  state: { buffer: string },
): SseFrame[] {
  state.buffer += chunk.replace(/\r\n/g, "\n");
  const frames: SseFrame[] = [];

  let divider = state.buffer.indexOf("\n\n");
  while (divider !== -1) {
    const block = state.buffer.slice(0, divider);
    state.buffer = state.buffer.slice(divider + 2);

    const lines = block.split("\n");
    const event = lines
      .find((line) => line.startsWith("event:"))
      ?.slice(6)
      .trim();
    const data = lines
      .find((line) => line.startsWith("data:"))
      ?.slice(5)
      .trim();

    if (data !== undefined) {
      frames.push({ event: event || "message", data });
    }

    divider = state.buffer.indexOf("\n\n");
  }

  return frames;
}
