import { describe, expect, it } from "vitest";
import { detectMimeType } from "@/lib/uploads/detect-mime";

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
});
