import { lookup } from "node:dns/promises";
import type { LookupFunction } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import { canvasHostFromInput } from "./institution-search";

const MAX_FILE_REDIRECTS = 3;
const FILE_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function isPublicIpv4(address: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) return false;
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  const [a, b, c] = octets;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

const publicIpv4Lookup: LookupFunction = (hostname, options, callback) => {
  // IPv6-only Canvas hosts cannot connect until IPv6 public-range checks are
  // added here. Keep resolution to IPv4 so an unchecked AAAA record cannot
  // bypass the private-address guard.
  void lookup(hostname, { all: true, family: 4 }).then(
    (addresses) => {
      if (
        addresses.length === 0 ||
        addresses.some(({ address }) => !isPublicIpv4(address))
      ) {
        callback(
          new Error("Canvas host must resolve to a public IPv4 address"),
          [],
        );
        return;
      }

      // The connector uses this answer for the socket, so a later DNS change
      // cannot swap in an internal address between validation and connection.
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0].address, 4);
    },
    (error: unknown) => {
      callback(
        error instanceof Error ? error : new Error("Canvas DNS lookup failed"),
        [],
      );
    },
  );
};

const publicAddressAgent = new Agent({
  connect: { lookup: publicIpv4Lookup, timeout: 15_000 },
  connections: 8,
});

function safeHttpsUrl(value: string): URL {
  const authority = value.match(/^https:\/\/([^/?#]+)/i)?.[1];
  const url = new URL(value);
  if (
    !authority ||
    authority.includes(":") ||
    authority.includes("@") ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    canvasHostFromInput(url.origin) !== url.hostname
  ) {
    throw new Error("Canvas returned an unsafe URL");
  }
  return url;
}

export async function safeCanvasFetch(
  value: string,
  headers: Record<string, string>,
  followFileRedirects = false,
  request?: { method?: string; body?: string; signal?: AbortSignal },
) {
  let url = safeHttpsUrl(value);
  let requestHeaders = headers;

  for (let redirects = 0; ; redirects++) {
    let response;
    try {
      response = await undiciFetch(url, {
        ...request,
        headers: requestHeaders,
        dispatcher: publicAddressAgent,
        redirect: "manual",
      });
    } catch (error) {
      const cause = error instanceof Error ? error.cause : null;
      if (
        cause instanceof Error &&
        cause.message === "Canvas host must resolve to a public IPv4 address"
      ) {
        throw cause;
      }
      throw error;
    }

    if (!followFileRedirects || !FILE_REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location || redirects >= MAX_FILE_REDIRECTS) {
      await response.body?.cancel();
      throw new Error("Canvas file redirected too many times");
    }

    let next: URL;
    try {
      if (location.startsWith("//")) safeHttpsUrl(`https:${location}`);
      else if (/^https:\/\//i.test(location)) safeHttpsUrl(location);
      next = safeHttpsUrl(new URL(location, url).href);
    } finally {
      await response.body?.cancel();
    }
    if (next.origin !== url.origin) {
      requestHeaders = Object.fromEntries(
        Object.entries(requestHeaders).filter(
          ([name]) => name.toLowerCase() !== "authorization",
        ),
      );
    }
    url = next;
  }
}
