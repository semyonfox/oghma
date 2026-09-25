export type CanvasInstitution = {
  name: string;
  domain: string;
  supported: boolean;
};

const INSTRUCTURE_HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.instructure\.com$/i;

export function canvasHostFromInput(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port
    ) {
      return null;
    }

    const host = url.hostname.toLowerCase();
    return INSTRUCTURE_HOST.test(host) ? host : null;
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
