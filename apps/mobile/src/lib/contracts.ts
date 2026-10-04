import { z } from "zod";

export const userSchema = z.object({
  user_id: z.string().uuid(),
  email: z.string(),
  displayName: z.string().nullish(),
});
export const profileSchema = z.object({ user: userSchema });
export const noteSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  content: z.string().optional(),
  isFolder: z.boolean().optional(),
  s3Key: z.string().nullish(),
  mimeType: z.string().nullish(),
});
export const treeSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      isFolder: z.boolean(),
      s3Key: z.string().nullish(),
      mimeType: z.string().nullish(),
    }),
  ),
});
export const sessionsSchema = z.object({
  sessions: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      generation_status: z.string(),
    }),
  ),
});
export const conversationSchema = z.object({
  session: z.object({
    id: z.string().uuid(),
    title: z.string(),
    active_generation_id: z.string().uuid().nullish(),
    generation_status: z.string(),
  }),
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    }),
  ),
});
export const generationSchema = z.object({
  generationId: z.string().uuid(),
  sessionId: z.string().uuid(),
});
export type User = z.infer<typeof userSchema>;
export type Note = z.infer<typeof noteSchema>;
export type TreeItem = z.infer<typeof treeSchema>["items"][number];
export type Conversation = z.infer<typeof conversationSchema>;

export function apiHeaders(
  origin: string,
  cookie: string | null,
  body?: BodyInit | null,
  initial?: HeadersInit,
): Headers {
  const headers = new Headers(initial);
  // The existing backend checks Origin on mutations, including sign-in.
  headers.set("Origin", apiOrigin(origin));
  if (cookie) headers.set("Cookie", cookie);
  else headers.delete("Cookie");
  if (typeof body === "string") headers.set("Content-Type", "application/json");
  return headers;
}

export function draftToPersist(
  server: { title: string; content?: string } | null,
  current: { title: string; content: string },
  recoveryResolved: boolean,
): string | null | undefined {
  if (!server || !recoveryResolved) return undefined;
  if (
    server.title === current.title &&
    (server.content || "") === current.content
  )
    return null;
  return JSON.stringify(current);
}

export function sessionCookie(header: string | null): string {
  // Extract only our session, never forward attributes or unrelated cookies.
  const match = header?.match(/(?:^|,\s*)session=([A-Za-z0-9_.-]+)(?:;|,|$)/);
  if (!match)
    throw new Error(
      "The server did not return a session. Please try signing in again.",
    );
  return `session=${match[1]}`;
}

export function apiOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("The mobile API must be an HTTPS origin.");
  }
  return url.origin;
}

export interface StreamEvent {
  id?: string;
  event: string;
  data: unknown;
}
export class EventDecoder {
  private buffer = "";
  push(chunk: string): StreamEvent[] {
    this.buffer += chunk;
    const events: StreamEvent[] = [];
    let boundary: RegExpExecArray | null;
    while ((boundary = /\r?\n\r?\n/.exec(this.buffer))) {
      const block = this.buffer.slice(0, boundary.index);
      this.buffer = this.buffer.slice(boundary.index + boundary[0].length);
      let event = "message";
      let id: string | undefined;
      const data: string[] = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("id:")) id = line.slice(3).trim();
        if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (data.length)
        events.push({ id, event, data: JSON.parse(data.join("\n")) });
    }
    return events;
  }
}
