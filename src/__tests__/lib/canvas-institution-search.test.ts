import { describe, expect, it } from "vitest";
import { canvasHostFromInput } from "@/lib/canvas/institution-search";

describe("Canvas host input", () => {
  it.each([
    ["school.instructure.com", "school.instructure.com"],
    ["https://Canvas.University.EDU/courses/123", "canvas.university.edu"],
    ["canvas.university.ac.uk", "canvas.university.ac.uk"],
  ])("accepts a public HTTPS school host %s", (input, host) => {
    expect(canvasHostFromInput(input)).toBe(host);
  });

  it.each([
    "http://canvas.university.edu",
    "https://canvas.university.edu:443",
    "https://canvas.university.edu:3000",
    "https://user:pass@canvas.university.edu",
    "https://127.0.0.1",
    "https://169.254.169.254",
    "https://[::1]",
    "localhost",
    "canvas.local",
    "canvas.instructure.com.attacker.test",
    "canvas_university.edu",
  ])("rejects unsafe host %s", (input) => {
    expect(canvasHostFromInput(input)).toBeNull();
  });
});
