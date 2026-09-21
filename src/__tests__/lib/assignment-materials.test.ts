import { describe, expect, it, vi } from "vitest";
import { assignmentFileIds, discoverAssignmentMaterials } from "@/lib/canvas/assignment-materials";
import { normalizeCanvasCourseSelection } from "@/lib/canvas/id";
import { canvasRequestFingerprint, canonicalCanvasCourses } from "@/lib/canvas/import-runs";
vi.mock("@/database/pgsql", () => ({ default: vi.fn() }));

const base = "https://canvas.example.edu/courses/7/assignments/8";
describe("assignment materials", () => {
  it("finds deduplicated Canvas file IDs in attachments and instruction links", () => {
    expect(assignmentFileIds({ id: "8", name: "Work", attachments: [{ id: "10", display_name: "Brief.pdf" }], description: `
      <a href="/courses/7/files/10/download?download_frd=1&amp;x=1">Brief</a>
      <a href='/files/9007199254740993/preview'>Reading</a>
      <img src="/courses/7/files/12/preview" data-api-endpoint="https://canvas.example.edu/api/v1/courses/7/files/12">
      <a href="https://evil.test/courses/7/files/20">External</a>
      <a href="/courses/9/files/21">Different course</a>
      <a href="javascript:alert(1)">Unsafe</a>
      <a href="/files/9223372036854775808">Out of range</a>
    ` }, base, "7")).toEqual(["10", "9007199254740993", "12"]);
  });
  it("gets metadata through the course API and preserves restricted files", async () => {
    const getFile = vi.fn().mockResolvedValueOnce({ data: { id: "10", display_name: "Brief.pdf" }, forbidden: false }).mockResolvedValueOnce({ data: null, forbidden: true, error: "Restricted" });
    const result = await discoverAssignmentMaterials({ baseUrl: "https://canvas.example.edu/api/v1", getFile }, "7", { id: "8", name: "Work", description: '<a href="/files/10">One</a><a href="/files/11">Two</a>' });
    expect(getFile.mock.calls).toEqual([["7", "10"], ["7", "11"]]);
    expect(result.map(file => [file.id, file.unavailable])).toEqual([["10", false], ["11", true]]);
  });
  it("does not claim an empty list when Canvas is unavailable", async () => {
    await expect(discoverAssignmentMaterials({ baseUrl: "https://canvas.example.edu/api/v1", getFile: vi.fn().mockResolvedValue({ data: null, error: "Timeout", forbidden: false }) }, "7", { id: "8", name: "Work", description: '<a href="/files/10">One</a>' })).rejects.toThrow("Could not load");
  });
  it("preserves assignment scope and gives it a distinct job fingerprint", () => {
    const course = normalizeCanvasCourseSelection({ id: "7", assignmentId: "9007199254740993" });
    expect(course.assignmentId).toBe("9007199254740993");
    expect(canonicalCanvasCourses([course, course])).toEqual([course]);
    expect(canvasRequestFingerprint([course], "import")).not.toBe(canvasRequestFingerprint([normalizeCanvasCourseSelection("7")], "import"));
    expect(() => canonicalCanvasCourses([course, normalizeCanvasCourseSelection("7")])).toThrow("different assignment scopes");
  });
});
