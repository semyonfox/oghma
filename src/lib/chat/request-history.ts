// the prompt window: the latest user and assistant turns, capped by count, per-message
// length and total bytes. the browser sends it as a hint and the server reapplies it
// to stored history
export function boundedChatHistory(
  history: readonly { role: string; content: string }[],
) {
  const recent: { role: "user" | "assistant"; content: string }[] = [];
  const encoder = new TextEncoder();
  let bytes = 0;
  for (const item of history.slice(-20).reverse()) {
    if (item.role !== "user" && item.role !== "assistant") continue;
    const entry: { role: "user" | "assistant"; content: string } = {
      role: item.role,
      content: item.content.slice(0, 20_000),
    };
    const size = encoder.encode(JSON.stringify(entry)).byteLength;
    if (size > 128 * 1024 - bytes) break;
    bytes += size;
    recent.unshift(entry);
  }
  return recent;
}
