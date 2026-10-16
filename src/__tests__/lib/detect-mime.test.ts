import { describe, expect, it } from "vitest";
import { detectMimeType } from "@/lib/ingestion/detect-mime";

describe("detectMimeType", () => {
  it("detects an extensionless PDF from its bytes without a browser MIME type", () => {
    const pdf = Buffer.from("%PDF-1.7\n");
    expect(
      detectMimeType(
        pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength),
        "",
      ),
    ).toBe("application/pdf");
  });

  it("accepts a declared MIME type when the signature matches", () => {
    const pdf = Buffer.from("%PDF-1.7\n");
    expect(
      detectMimeType(
        pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength),
        "application/pdf",
      ),
    ).toBe("application/pdf");
  });

  it("replaces a generic browser MIME type with the detected PDF type", () => {
    const pdf = Buffer.from("%PDF-1.7\n");
    expect(
      detectMimeType(
        pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength),
        "application/octet-stream",
      ),
    ).toBe("application/pdf");
  });

  it("rejects a declared MIME type that conflicts with the bytes", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    expect(
      detectMimeType(
        png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
        "application/pdf",
      ),
    ).toBeNull();
  });

  const bytes = (...parts: (string | number[])[]) =>
    Buffer.concat(parts.map((part) => (typeof part === "string" ? Buffer.from(part, "latin1") : Buffer.from(part))));

  it("accepts MP4 files whatever the size of their ftyp box", () => {
    // 0x18 is the most common box size and was rejected by fixed-prefix matching
    for (const size of [0x18, 0x1c, 0x20]) {
      const mp4 = bytes([0, 0, 0, size], "ftypisom", [0, 0, 2, 0]);
      expect(detectMimeType(mp4, "video/mp4")).toBe("video/mp4");
      expect(detectMimeType(mp4, "")).toBe("video/mp4");
    }
  });

  it("does not classify HEIC photos as MP4 video", () => {
    expect(detectMimeType(bytes([0, 0, 0, 0x18], "ftypheic"), "")).toBeNull();
  });

  it("recognises AVIF stills and sequences without mistaking them for video", () => {
    expect(detectMimeType(bytes([0, 0, 0, 0x1c], "ftypavif"), "")).toBe("image/avif");
    expect(detectMimeType(bytes([0, 0, 0, 0x20], "ftypavis"), "")).toBe("image/avif");
    expect(detectMimeType(bytes([0, 0, 0, 0x1c], "ftypavif"), "video/mp4")).toBeNull();
  });

  it("tells WebP and WAV apart instead of trusting the declared RIFF type", () => {
    const wav = bytes("RIFF", [0x24, 0, 0, 0], "WAVEfmt ");
    const webp = bytes("RIFF", [0x24, 0, 0, 0], "WEBPVP8 ");
    expect(detectMimeType(wav, "image/webp")).toBeNull();
    expect(detectMimeType(wav, "")).toBe("audio/wav");
    expect(detectMimeType(webp, "image/webp")).toBe("image/webp");
  });

  it("recognises MP3 frames but not AAC streams", () => {
    expect(detectMimeType(bytes([0xff, 0xfb, 0x90, 0x00]), "audio/mpeg")).toBe("audio/mpeg");
    expect(detectMimeType(bytes("ID3", [3, 0]), "")).toBe("audio/mpeg");
    expect(detectMimeType(bytes([0xff, 0xf1, 0x50, 0x80]), "audio/mpeg")).toBeNull();
  });

  it("accepts text files the browser sent without a type, by extension", () => {
    // Windows browsers often send "" for .md
    const markdown = Buffer.from("# Léacht 3\n\nNótaí");
    expect(detectMimeType(markdown, "", "Léacht 3.md")).toBe("text/markdown");
    expect(detectMimeType(markdown, "application/octet-stream", "notes.txt")).toBe("text/plain");
    expect(detectMimeType(markdown, "", "notes")).toBeNull();
    expect(detectMimeType(markdown, "", "md")).toBeNull();
  });

  it("rejects binary content declared or named as text", () => {
    const binary = bytes("abc", [0, 1, 2]);
    expect(detectMimeType(binary, "text/plain")).toBeNull();
    expect(detectMimeType(binary, "", "notes.md")).toBeNull();
    expect(detectMimeType(Buffer.from("%PDF-1.7\n"), "text/markdown")).toBeNull();
    expect(detectMimeType(Buffer.from("plain words"), "text/plain; charset=utf-8")).toBe("text/plain");
  });
});
