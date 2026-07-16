import { expect, test } from "../fixtures";

test.describe("calendar responsive smoke", () => {
  test("uses a phone agenda and retains desktop calendar views", async ({
    loggedInPage: page,
  }) => {
    const today = new Date();
    const dateKey = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");
    const dueAt = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 16).toISOString();
    const startsAt = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10).toISOString();
    const endsAt = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 11).toISOString();
    await page.route("**/api/assignments**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status: 200, json: [{
          id: "assignment-1", canvas_course_id: null, title: "Calendar smoke task",
          description: null, course_name: "Testing", course_color: "#6366f1",
          due_at: dueAt, status: "upcoming", estimated_hours: 1, logged_hours: 0,
          source: "manual", submitted_at: null, score: null, points_possible: null,
          created_at: dueAt, updated_at: dueAt,
        }] });
        return;
      }
      await route.continue();
    });
    await page.route("**/api/time-blocks**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status: 200, json: [{
          id: "block-1", assignment_id: null, title: "Revision block",
          starts_at: startsAt, ends_at: endsAt, pomodoro_count: 0, completed: false,
        }] });
        return;
      }
      await route.continue();
    });
    await page.route("**/api/quiz/review-dates**", async (route) => {
      await route.fulfill({ status: 200, json: { dates: [] } });
    });

    await page.goto("/calendar");
    await expect(page.getByRole("main", { name: "Calendar" })).toBeVisible();

    const width = page.viewportSize()?.width ?? 1280;
    if (width < 1024) {
      await page.getByRole("button", { name: "Tasks" }).click();
      const tasksDrawer = page.getByRole("dialog").first();
      await expect(tasksDrawer.getByText("All Courses")).toBeVisible();
      await tasksDrawer.getByRole("button", { name: "New Task" }).first().click();

      const taskDialog = page.getByRole("dialog").last();
      await expect(taskDialog.getByRole("heading", { name: "New Task" })).toBeVisible();
      const box = await taskDialog.getByTestId("new-task-panel").boundingBox();
      if (box) {
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(
          page.viewportSize()?.height ?? 1000,
        );
      }
      await taskDialog.getByRole("button", { name: "Close" }).click();
      await tasksDrawer.getByRole("button", { name: "Close" }).click();
    } else {
      await expect(page.getByText("All Courses")).toBeVisible();
      await expect(page.getByRole("button", { name: "Tasks" })).not.toBeVisible();
    }

    if (width < 768) {
      await expect(page.getByLabel("Month view")).toHaveCount(0);
      await expect(page.getByLabel("Week view")).toHaveCount(0);
      await expect(page.getByText("Calendar smoke task")).toBeVisible();
      await expect(page.getByText("Revision block")).toBeVisible();
      await expect(page.locator('input[type="date"]')).toHaveValue(dateKey);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.getByRole("button", { name: "Previous period" }).click();
      await expect(page.locator('input[type="date"]')).not.toHaveValue(dateKey);
      await page.getByRole("button", { name: "Today" }).click();
      await expect(page.locator('input[type="date"]')).toHaveValue(dateKey);
      await page.getByRole("button", { name: "Add study block" }).first().click();
      await expect(page.getByRole("dialog").getByRole("heading", { name: "Add study block" })).toBeVisible();
    } else {
      await expect(page.getByLabel("Month view")).toBeVisible();
      await page.getByRole("button", { name: "Month" }).click();
      await page.getByRole("menuitem", { name: "Week view" }).click();
      await expect(page.getByLabel("Week view")).toBeVisible();
      await expect(page.getByText("Calendar smoke task")).toBeVisible();
    }
  });
});
