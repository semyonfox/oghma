import { describe, expect, it } from "vitest";
import {
  CANVAS_COURSE_STATUS,
  buildCanvasSyncCourses,
  discoverCanvasCourses,
  resolveAccessibleCanvasCourses,
} from "@/lib/canvas/sync-courses";

describe("Canvas course discovery contract", () => {
  it("adds an enrollment-only historical course that was never imported locally", async () => {
    const client = {
      getCourse: async (id: string) => ({
        data: {
          id,
          name: "Archived Algorithms",
          course_code: "CT216",
          concluded: true,
        },
      }),
    };

    await expect(
      resolveAccessibleCanvasCourses(
        client,
        [{ id: "42", name: "Current" }],
        [
          {
            course_id: "9007199254740993",
            enrollment_state: "completed",
          },
        ],
      ),
    ).resolves.toEqual([
      {
        id: "42",
        name: "Current",
        canvasStatus: CANVAS_COURSE_STATUS.CURRENT,
      },
      {
        id: "9007199254740993",
        name: "Archived Algorithms",
        course_code: "CT216",
        concluded: true,
        historical: true,
        canvasStatus: CANVAS_COURSE_STATUS.PAST,
      },
    ]);
  });

  it("keeps an inaccessible enrollment visible without making it importable", async () => {
    await expect(
      resolveAccessibleCanvasCourses(
        { getCourse: async () => ({ data: null, forbidden: true }) },
        [],
        [{ course_id: "42", enrollment_state: "inactive" }],
      ),
    ).resolves.toEqual([
      {
        id: "42",
        name: "Canvas course unavailable",
        course_code: "",
        term: null,
        historical: true,
        canvasStatus: CANVAS_COURSE_STATUS.INACCESSIBLE,
        canvasStatusReason: "inactive_enrollment",
      },
    ]);
  });

  it("uses the enrollment ledger even when the regular course list fails", async () => {
    const client = {
      getDiscoverableCourses: async () => ({
        data: [],
        error: "Canvas API error: 500",
      }),
      getSelfEnrollments: async () => ({
        data: [{ course_id: "9007199254740993", enrollment_state: "active" }],
      }),
      getCourse: async (id: string) => ({
        data: { id, name: "Only in the ledger" },
      }),
    };

    await expect(discoverCanvasCourses(client)).resolves.toEqual({
      data: [
        {
          id: "9007199254740993",
          name: "Only in the ledger",
          historical: true,
          canvasStatus: CANVAS_COURSE_STATUS.CURRENT,
        },
      ],
      forbidden: false,
      degraded: false,
    });
  });

  it("falls back to Canvas's regular list when enrollment records are scoped", async () => {
    const client = {
      getDiscoverableCourses: async () => ({
        data: [{ id: "42", name: "Current" }],
      }),
      getSelfEnrollments: async () => ({
        forbidden: true,
        error: "Access restricted by lecturer",
      }),
      getCourse: async () => ({ data: null }),
    };

    await expect(discoverCanvasCourses(client)).resolves.toEqual({
      data: [
        {
          id: "42",
          name: "Current",
          canvasStatus: CANVAS_COURSE_STATUS.CURRENT,
        },
      ],
      forbidden: false,
      degraded: true,
    });
  });

  it("marks a transient course lookup as unavailable rather than inaccessible", async () => {
    await expect(
      resolveAccessibleCanvasCourses(
        { getCourse: async () => ({ error: "Canvas API error: 500" }) },
        [],
        [{ course_id: "42", enrollment_state: "active" }],
      ),
    ).resolves.toEqual([
      {
        id: "42",
        name: "Canvas course unavailable",
        course_code: "",
        term: null,
        historical: true,
        canvasStatus: CANVAS_COURSE_STATUS.UNAVAILABLE,
        canvasStatusReason: "lookup_failed",
      },
    ]);
  });

  it("lets an active enrollment win over an inactive duplicate", async () => {
    await expect(
      resolveAccessibleCanvasCourses(
        { getCourse: async () => ({ data: null }) },
        [{ id: "42", name: "Shared course" }],
        [
          { course_id: "42", enrollment_state: "inactive" },
          { course_id: "42", enrollment_state: "active" },
        ],
      ),
    ).resolves.toEqual([
      {
        id: "42",
        name: "Shared course",
        canvasStatus: CANVAS_COURSE_STATUS.CURRENT,
      },
    ]);
  });

  it("marks a future accessible course as pending", async () => {
    await expect(
      resolveAccessibleCanvasCourses(
        { getCourse: async () => ({ data: null }) },
        [
          {
            id: "42",
            name: "Future course",
            start_at: "2099-01-01T00:00:00.000Z",
          },
        ],
        [{ course_id: "42", enrollment_state: "active" }],
      ),
    ).resolves.toEqual([
      {
        id: "42",
        name: "Future course",
        start_at: "2099-01-01T00:00:00.000Z",
        canvasStatus: CANVAS_COURSE_STATUS.PENDING,
      },
    ]);
  });
});

describe("Canvas resync course contract", () => {
  it("keeps exact 64-bit IDs and excludes inaccessible Canvas records", () => {
    expect(
      buildCanvasSyncCourses(
        new Set(["9007199254740993", "42"]),
        [
          {
            id: "42",
            name: "Software Engineering",
            course_code: "CT216",
            canvasStatus: CANVAS_COURSE_STATUS.CURRENT,
          },
          {
            id: "9007199254740993",
            name: "Unavailable",
            canvasStatus: CANVAS_COURSE_STATUS.UNAVAILABLE,
          },
        ],
      ),
    ).toEqual([
      {
        id: "42",
        name: "Software Engineering",
        course_code: "CT216",
        term: null,
      },
    ]);
  });

  it("does not requeue a missing course as a guessed local fallback", () => {
    expect(
      buildCanvasSyncCourses(new Set(["9007199254740993"]), []),
    ).toEqual([]);
  });

  it("rejects prior IDs outside the database range", () => {
    expect(() =>
      buildCanvasSyncCourses(new Set(["9223372036854775808"]), []),
    ).toThrow("supported Canvas ID range");
  });
});
