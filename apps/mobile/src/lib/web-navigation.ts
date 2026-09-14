import { z } from "zod";

const bridgeMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("oghma:oauth"), provider: z.enum(["google", "github"]) }).strict(),
  z.object({ type: z.literal("oghma:updates") }).strict(),
  z.object({ type: z.literal("oghma:theme"), theme: z.enum(["dark", "light"]) }).strict(),
]);

export function isWorkspaceUrl(value: string, origin: string) {
  try {
    const url = new URL(value);
    return url.origin === origin && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function parseWebMessage(data: string, source: string, origin: string) {
  if (!isWorkspaceUrl(source, origin) || data.length > 512) return null;
  try {
    const parsed = bridgeMessage.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function navigationAction(value: string, origin: string) {
  try {
    const url = new URL(value);
    if (url.username || url.password) return "block";
    if (isWorkspaceUrl(value, origin)) {
      if (url.pathname === "/downloads/oghmanotes-alpha.apk") return "update";
      return "workspace";
    }
    if (["https:", "http:", "mailto:", "tel:"].includes(url.protocol)) return "external";
  } catch {
    // File, content, intent and JavaScript URLs never leave the WebView sandbox.
  }
  return "block";
}
