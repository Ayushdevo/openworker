import { expect, test } from "@playwright/test";

test("team icon, task chip, worker message and all three tabs work together", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?scenario=team-view-5#/s/scn-team-view-5");
  await expect(page.getByTestId("team-created")).toBeVisible();
  await expect(page.getByTestId("team-update")).toHaveCount(1);
  await expect(page.getByTestId("team-update")).toContainText(
    "Team updates (2)",
  );
  await page
    .getByRole("button", { name: "Team quick look", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Team quick look" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open team view" }).click();
  const pane = page.getByTestId("team-view");
  await expect(pane).toBeVisible();
  await expect(pane.getByText("1 task is waiting on you.")).toBeVisible();
  await page.screenshot({ path: "test-results/team-view-work.png" });
  await pane.getByTestId("team-task-1").click();
  await expect(
    pane.getByText(/The regression covers partial refunds/),
  ).toBeVisible();
  const workerInput = pane.getByRole("textbox", { name: "Message sam…" });
  await workerInput.fill("Check keyboard navigation too.");
  await pane.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByTestId("scenario-sent-toggle").click();
  await expect(page.getByTestId("scenario-sent")).toContainText(
    "/ws/session/scn-team-view-5-sam",
  );
  await expect(page.getByTestId("scenario-sent")).toContainText(
    "Check keyboard navigation too.",
  );
  await page.getByTestId("scenario-sent-toggle").click();
  await page.screenshot({ path: "test-results/team-view-worker.png" });
  await pane.getByRole("button", { name: "← Team" }).click();
  await pane.getByRole("tab", { name: "Workers" }).click();
  await expect(pane.getByTestId("team-worker-sam")).toBeVisible();
  await pane.getByRole("tab", { name: "Stats" }).click();
  await pane.getByRole("button", { name: "Show tokens over time" }).click();
  await expect(pane.getByRole("img")).toBeVisible();
  await page.screenshot({ path: "test-results/team-view-stats.png" });
  await pane.getByRole("button", { name: "Close team view" }).click();
  await expect(pane).toHaveCount(0);
  await page
    .locator('.bubble-assistant [data-testid="task-chip-3"]')
    .first()
    .click();
  await expect(
    page
      .getByTestId("team-view")
      .getByRole("heading", { name: "Backfill affected invoices" }),
  ).toBeVisible();
});

test("large team groups workers and shows top five token consumers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?scenario=team-view-100#/s/scn-team-view-100");
  await page
    .getByRole("button", { name: "Team quick look", exact: true })
    .click();
  const quick = page.getByRole("region", { name: "Team quick look" });
  await expect(quick.getByTestId(/team-task-/)).toHaveCount(1);
  await expect(quick.getByText("swe-worker × 40")).toBeVisible();
  await page.screenshot({ path: "test-results/team-view-large-quick.png" });
  await quick.getByRole("button", { name: "Open team view" }).click();
  const pane = page.getByTestId("team-view");
  await pane.getByRole("tab", { name: "Workers" }).click();
  await expect(pane.getByRole("button", { name: "Show workers" })).toHaveCount(
    4,
  );
  await pane.getByRole("button", { name: "Show workers" }).first().click();
  await expect(pane.getByTestId("team-worker-sam")).toBeVisible();
  await pane.getByRole("tab", { name: "Stats" }).click();
  await expect(pane.getByText("Top five of 100 workers")).toBeVisible();
  await pane.getByRole("button", { name: "By role" }).click();
  await expect(pane.getByText("Top five of 100 workers")).toHaveCount(0);
  await page.screenshot({ path: "test-results/team-view-large-stats.png" });
});

test("quick look is keyboard controlled and does not move the composer", async ({
  page,
}) => {
  await page.goto("/?scenario=team-view-5#/s/scn-team-view-5");
  const icon = page.getByRole("button", {
    name: "Team quick look",
    exact: true,
  });
  const composer = page.getByPlaceholder(/Ask the coworker/);
  const before = await composer.boundingBox();
  await icon.hover();
  expect(await composer.boundingBox()).toEqual(before);
  await icon.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("region", { name: "Team quick look" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("region", { name: "Team quick look" }),
  ).toHaveCount(0);
  await expect(icon).toBeFocused();
});
