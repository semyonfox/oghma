import { describe, expect, it } from "vitest";
import { chooseWeightedClass } from "@/lib/canvas/import-scheduler";

describe("import weighted fair scheduling", () => {
  it("gives paid classes more turns without starving free work", () => {
    let state = { free: 0, semester: 0, academic_year: 0 };
    const counts = { free: 0, semester: 0, academic_year: 0 };
    for (let index = 0; index < 90; index += 1) {
      const result = chooseWeightedClass(state, ["free", "semester", "academic_year"]);
      expect(result).not.toBeNull();
      state = result!.next;
      counts[result!.chosen] += 1;
    }
    expect(counts).toEqual({ free: 10, semester: 30, academic_year: 50 });
  });

  it("uses all capacity when only one class has eligible work", () => {
    let state = { free: -4, semester: 2, academic_year: 2 };
    for (let index = 0; index < 10; index += 1) {
      const result = chooseWeightedClass(state, ["free"]);
      expect(result?.chosen).toBe("free");
      state = result!.next;
    }
  });
});
