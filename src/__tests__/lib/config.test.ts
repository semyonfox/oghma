import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

async function loadConfig() {
    vi.resetModules();
    return (await import("@/lib/config")).config;
}

describe("runtime config", () => {
    it("treats an empty env file entry as unset", async () => {
        vi.stubEnv("UPLOAD_MAX_FILE_SIZE", "");
        vi.stubEnv("CANVAS_POLL_INTERVAL_MS", "  ");

        const config = await loadConfig();

        expect(config.upload.maxFileSizeBytes).toBe(50 * 1024 * 1024);
        expect(config.canvas.pollIntervalMs).toBe(3000);
    });

    it("reads a valid upload limit", async () => {
        vi.stubEnv("UPLOAD_MAX_FILE_SIZE", "104857600");

        expect((await loadConfig()).upload.maxFileSizeBytes).toBe(104857600);
    });

    // parseInt used to read "100MB" as 100 bytes and "0" as zero, rejecting every upload
    it.each(["100MB", "0", "-5"])("rejects a malformed upload limit %s", async (value) => {
        vi.stubEnv("UPLOAD_MAX_FILE_SIZE", value);

        await expect(loadConfig()).rejects.toThrow(
            "UPLOAD_MAX_FILE_SIZE must be a positive integer",
        );
    });

    it("fails startup validation on a malformed numeric setting", async () => {
        vi.stubEnv("CANVAS_POLL_INTERVAL_MS", "3s");
        vi.resetModules();

        await expect(import("@/lib/validate-env")).rejects.toThrow(
            "CANVAS_POLL_INTERVAL_MS must be a positive integer",
        );
    });
});
