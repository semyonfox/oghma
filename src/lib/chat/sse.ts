export interface SseFrame {
  id?: string;
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
  state.buffer += chunk;
  const frames: SseFrame[] = [];

  let divider = /\r?\n\r?\n/.exec(state.buffer);
  while (divider) {
    const block = state.buffer.slice(0, divider.index);
    state.buffer = state.buffer.slice(divider.index + divider[0].length);

    const lines = block.split(/\r?\n/);
    const event = lines
      .find((line) => line.startsWith("event:"))
      ?.slice(6)
      .trim();
    const id = lines
      .find((line) => line.startsWith("id:"))
      ?.slice(3)
      .trim();
    const dataLines = lines.filter((line) => line.startsWith("data:"));
    const data = dataLines
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");

    if (dataLines.length > 0) {
      frames.push({ ...(id && { id }), event: event || "message", data });
    }

    divider = /\r?\n\r?\n/.exec(state.buffer);
  }

  return frames;
}
