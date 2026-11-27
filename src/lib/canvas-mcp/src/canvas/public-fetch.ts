import { lookup } from "node:dns/promises";
import type { LookupFunction } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import type { FetchLike } from "./client.ts";

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
        a === undefined || b === undefined || c === undefined ||
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
    void lookup(hostname, { all: true, family: 4 }).then(
        (addresses) => {
            if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIpv4(address))) {
                callback(new Error("Canvas host must resolve to a public IPv4 address"), []);
                return;
            }
            if (options.all) callback(null, addresses);
            else callback(null, addresses[0]?.address ?? "", 4);
        },
        (error: unknown) => {
            callback(error instanceof Error ? error : new Error("Canvas DNS lookup failed"), []);
        },
    );
};

const publicAddressAgent = new Agent({
    connect: { lookup: publicIpv4Lookup, timeout: 15_000 },
    connections: 8,
});

function headerRecord(headers: HeadersInit | undefined): Record<string, string> {
    const result: Record<string, string> = {};
    if (!headers) return result;
    new Headers(headers).forEach((value, key) => {
        result[key] = value;
    });
    return result;
}

export const publicCanvasFetch: FetchLike = (url, init) => {
    const body = typeof init?.body === "string" ? init.body : undefined;
    const signal = init?.signal;
    return undiciFetch(url, {
        method: init?.method ?? "GET",
        headers: headerRecord(init?.headers),
        ...(signal !== undefined ? { signal } : {}),
        ...(body !== undefined ? { body } : {}),
        dispatcher: publicAddressAgent,
    });
};
