import assert from "node:assert/strict";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { it } from "node:test";
import { ARCHIVE, createBridgeServer, isRecord } from "./bridge.ts";
it("blocks foreign origins and keeps serving after a cancelled job returns late", async (t) => {
  const server = createBridgeServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const job = {
    kind: "form",
    url: ARCHIVE + "/regexam/paper_index_search_form.asp",
  };
  const foreign = await fetch(base + "/next", {
    headers: { Origin: "https://other.test" },
  });
  assert.equal(foreign.status, 403);
  const injection = await fetch(base + "/request", {
    method: "POST",
    headers: { Origin: ARCHIVE },
    body: JSON.stringify(job),
  });
  assert.equal(injection.status, 404);
  const bad = await fetch(base + "/request", {
    method: "POST",
    body: JSON.stringify({ kind: "pdf", url: "https://other.test/private" }),
  });
  assert.equal(bad.status, 400);
  assert.match(await bad.text(), /Unsupported archive URL/);
  async function nextId(): Promise<string> {
    for (let i = 0; i < 30; i++) {
      const next = await fetch(base + "/next", {
        headers: { Origin: ARCHIVE },
      });
      if (next.status === 204) {
        await delay(10);
        continue;
      }
      const value: unknown = await next.json();
      assert.ok(isRecord(value) && typeof value.id === "string");
      return value.id;
    }
    throw new Error("Test job was not queued");
  }
  const controller = new AbortController();
  const cancelled = fetch(base + "/request", {
    method: "POST",
    body: JSON.stringify(job),
    signal: controller.signal,
  });
  const rejection = assert.rejects(cancelled, /abort/i);
  const first = await nextId();
  controller.abort();
  await rejection;
  await delay(20);
  const late = await fetch(base + "/result/" + first, {
    method: "POST",
    headers: { Origin: ARCHIVE },
    body: '{"years":["2025"]}',
  });
  assert.equal(late.status, 204);
  const pending = fetch(base + "/request", {
    method: "POST",
    body: JSON.stringify(job),
  });
  const second = await nextId();
  await fetch(base + "/result/" + second, {
    method: "POST",
    headers: { Origin: ARCHIVE },
    body: '{"years":["2025"]}',
  });
  assert.deepEqual(await (await pending).json(), { years: ["2025"] });
});
