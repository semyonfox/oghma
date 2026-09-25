export type CanvasInstitution = {
  name: string;
  domain: string;
  supported: boolean;
};

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PRIVATE_TLDS = new Set([
  "arpa",
  "corp",
  "example",
  "home",
  "internal",
  "invalid",
  "lan",
  "local",
  "localhost",
  "onion",
  "test",
]);

export function canvasHostFromInput(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  try {
    const authority = value.replace(/^https:\/\//i, "").split(/[/?#]/, 1)[0];
    if (authority.includes(":") || authority.includes("@")) return null;

    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (url.protocol !== "https:" || url.username || url.port) {
      return null;
    }

    const host = url.hostname.toLowerCase();
    const labels = host.split(".");
    if (
      host.length > 253 ||
      labels.length < 2 ||
      labels.some((label) => !DNS_LABEL.test(label)) ||
      (labels.length === 4 && labels.every((label) => /^\d+$/.test(label))) ||
      !/^[a-z]{2,63}$/.test(labels.at(-1) ?? "") ||
      PRIVATE_TLDS.has(labels.at(-1) ?? "")
    ) {
      return null;
    }
    return host;
  } catch {
    return null;
  }
}

export function parseCanvasInstitutions(value: unknown): CanvasInstitution[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (item): item is { name: string; domain: string } =>
        item !== null &&
        typeof item === "object" &&
        typeof item.name === "string" &&
        typeof item.domain === "string" &&
        item.name.trim().length > 0 &&
        item.domain.trim().length > 0,
    )
    .slice(0, 10)
    .map(({ name, domain }) => {
      const host = domain.trim().toLowerCase();
      return {
        name: name.trim(),
        domain: host,
        supported: canvasHostFromInput(host) === host,
      };
    });
}
