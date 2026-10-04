import { z } from "zod";
import { ApiError } from "@/lib/api-errors";

export async function readStudyBody<Schema extends z.ZodType>(request: Request, schema: Schema): Promise<z.output<Schema>> {
  const maxBytes = 4_000_000;
  if (Number(request.headers.get("content-length")) > maxBytes) throw new ApiError(413, "This request is too large");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "A JSON body is required");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ApiError(413, "This request is too large");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "Invalid JSON body");
  } finally {
    reader.releaseLock();
  }
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new ApiError(400, "Invalid JSON body"); }
  const result = schema.safeParse(body);
  if (!result.success) throw new ApiError(400, result.error.issues[0]?.message ?? "Invalid study map data");
  return result.data;
}

export type StudyMapRouteContext = { params: Promise<{ id: string }> };
