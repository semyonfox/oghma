import { describe, expect, it } from "vitest";
import {
  displayFileName,
  noteAttachmentKey,
  storageFileName,
} from "@/lib/storage/file-names";

describe("storageFileName", () => {
  it("never produces an empty, hidden or traversing key segment", () => {
    expect(storageFileName("...")).toBe("file");
    expect(storageFileName("")).toBe("file");
    expect(storageFileName(".env")).toBe("env");
    expect(storageFileName("../../etc/passwd")).toBe("_._etc_passwd");
    expect(storageFileName("a/../b")).not.toContain("/");
  });

  it("keeps the extension when trimming a long name", () => {
    const name = storageFileName(`${"x".repeat(400)}.pdf`);
    expect(name).toHaveLength(200);
    expect(name.endsWith(".pdf")).toBe(true);
  });
});

describe("displayFileName", () => {
  it("keeps spaces and Irish fadas that key sanitising would mangle", () => {
    expect(displayFileName("Léacht 3 - Nótaí.pdf")).toBe("Léacht 3 - Nótaí.pdf");
  });

  it("normalises macOS NFD names and strips control characters", () => {
    const nfd = "Léacht\u0007.pdf";
    expect(displayFileName(nfd)).toBe("Léacht.pdf");
    expect(displayFileName(" \u0000 ")).toBe("unnamed");
  });

  it("keeps .pdf on long names so extraction pairing still works", () => {
    const name = displayFileName(`${"á".repeat(300)}.pdf`);
    expect(name).toHaveLength(255);
    expect(name.endsWith(".pdf")).toBe(true);
  });
});

describe("noteAttachmentKey", () => {
  it("scopes each upload to its own attachment directory", () => {
    expect(noteAttachmentKey("n", "a", "f.pdf")).toBe("notes/n/a/f.pdf");
  });
});
