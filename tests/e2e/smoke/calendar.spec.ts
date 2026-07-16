import { expect, test } from "../fixtures";

test.describe("calendar responsive smoke", () => {
  test("keeps tasks accessible and calendar columns readable", async ({
    loggedInPage: page,
  }) => {
    await page.route("**/api/assignments**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status: 200, json: [] });
        return;
      }
      await route.continue();
    });
    await page.route("**/api/time-blocks**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status: 200, json: [] });
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
      await tasksDrawer.getByRole("button", { name: "New Task" }).click();

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
      const month = page.getByLabel("Month view");
      await expect(month).toBeVisible();
      expect(
        await month.evaluate((element) => element.scrollWidth > element.clientWidth),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);

      await page.getByRole("button", { name: "Month" }).click();
      await page.getByRole("menuitem", { name: "Week view" }).click();
      const week = page.getByLabel("Week view");
      await expect(week).toBeVisible();
      expect(
        await week.evaluate((element) => element.scrollWidth > element.clientWidth),
      ).toBe(true);
    }
  });
});
