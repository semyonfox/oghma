#!/usr/bin/env node

import http from "http";

const port = Number(process.env.PORT || 8081);

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function embeddingVector() {
  return Array.from({ length: 4096 }, (_, index) =>
    index === 0 ? 1 : Number((1 / (index + 1)).toFixed(8)),
  );
}

function streamChat(res) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  res.write(
    `data: ${JSON.stringify({
      id: "e2e-chat",
      object: "chat.completion.chunk",
      choices: [{ delta: { content: "E2E fake answer." }, index: 0 }],
    })}\n\n`,
  );
  res.write("data: [DONE]\n\n");
  res.end();
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && req.url?.includes("/embeddings")) {
      const body = await readJson(req);
      const inputs = Array.isArray(body.input) ? body.input : [body.input ?? ""];
      json(res, 200, {
        object: "list",
        model: body.model || "e2e-embedding",
        data: inputs.map((_, index) => ({
          object: "embedding",
          index,
          embedding: embeddingVector(),
        })),
      });
      return;
    }

    if (req.method === "POST" && req.url?.includes("/rerank")) {
      const body = await readJson(req);
      const documents = body.documents || [];
      json(res, 200, {
        results: documents.map((_, index) => ({ index, relevance_score: 1 - index / 100 })),
      });
      return;
    }

    if (req.method === "POST" && req.url?.includes("/chat/completions")) {
      const body = await readJson(req);
      if (body.stream) {
        streamChat(res);
        return;
      }
      json(res, 200, {
        id: "e2e-chat",
        object: "chat.completion",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "E2E fake answer." },
            finish_reason: "stop",
          },
        ],
      });
      return;
    }

    json(res, 404, { error: "not found" });
  } catch (error) {
    json(res, 500, { error: error.message });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[e2e-fake-ai] listening on ${port}`);
});

