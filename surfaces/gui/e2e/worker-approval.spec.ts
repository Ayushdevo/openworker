import { expect } from "@playwright/test";
import { test, sendSessionEvent } from "./fixtures";

test("ordinary approval answered elsewhere retires on exact tool completion", async ({ page }) => {
  await page.goto("/");
  await sendSessionEvent(page, { type: "permission_required", data: {
    name: "github_clone", tool_call_id: "clone-old", arguments: { owner: "acme", repo: "billing-service" },
  } });
  await expect(page.getByRole("button", { name: "Allow once", exact: true })).toBeVisible();
  await sendSessionEvent(page, { type: "tool_finished", data: {
    name: "github_clone", tool_call_id: "unrelated", status: "ok",
  } });
  await expect(page.getByRole("button", { name: "Allow once", exact: true })).toBeVisible();
  await sendSessionEvent(page, { type: "tool_finished", data: {
    name: "github_clone", tool_call_id: "clone-old", status: "ok",
  } });
  await expect(page.getByRole("button", { name: "Allow once", exact: true })).toHaveCount(0);
});

test("ordinary approval answered elsewhere retires through poll when completion is missed", async ({ page }) => {
  let resolved = false;
  await page.route("**/v1/inbox?**", async route => {
    await route.fulfill({ json: { items: resolved ? [{ id: "clone-gate", kind: "approval", state: "resolved",
      tool_call_id: "clone-poll", resolution: "deny" }] : [] } });
  });
  await page.goto("/");
  await sendSessionEvent(page, { type: "permission_required", data: {
    name: "github_clone", tool_call_id: "clone-poll", arguments: { owner: "acme", repo: "billing-service" },
  } });
  await expect(page.getByRole("button", { name: "Allow once", exact: true })).toBeVisible();
  resolved = true;
  await expect(page.getByRole("button", { name: "Allow once", exact: true })).toHaveCount(0, { timeout: 10000 });
});

for (const suggestion of ["allow", "deny"]) {
  test(`overriding a lead ${suggestion} answers the exact worker request`, async ({ page }) => {
    const answers: Array<{ id: string; resolution: string }> = [];
    await page.route("**/v1/inbox/*/resolve", async route => {
      const id = new URL(route.request().url()).pathname.split("/").at(-2)!;
      answers.push({ id, resolution: route.request().postDataJSON().resolution });
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto("/");
    await sendSessionEvent(page, { type: "permission_required", data: {
      name: "decide_worker_call",
      arguments: { worker: "Maya", call_id: "sample-worker-prompt", decision: suggestion, note: "Verify the assigned task." },
      worker_call: { worker: "Maya", tool: "run_shell", arguments: { command: "npm test" }, state: "pending" },
    } });
    await page.getByTestId("workerdec-override").click();
    await expect.poll(() => answers.some(a => a.id === "sample-worker-prompt" &&
      a.resolution === (suggestion === "allow" ? "deny" : "allow"))).toBe(true);
  });
}

test("a background lead approval shows the command and disappears when the worker request resolves", async ({ page }) => {
  let send: ((event: unknown) => void) | undefined;
  const args = { worker: "maya", call_id: "sample-worker-prompt", decision: "allow", note: "Run the acceptance tests." };
  await page.routeWebSocket("**/ws/session/**", ws => {
    send = event => ws.send(JSON.stringify(event));
    ws.send(JSON.stringify({ type: "ready", data: { running: false, agent: "cowork" } }));
    ws.onMessage(raw => {
      const message = JSON.parse(String(raw));
      if (message.type !== "user_message") return;
      send!({ type: "turn_start", data: {} });
      send!({ type: "tool_proposed", data: { name: "decide_worker_call", arguments: args } });
      send!({ type: "permission_required", data: {
        name: "decide_worker_call", arguments: args, reason: "requires approval", category: "team",
        worker_call: { worker: "maya", tool: "run_shell", arguments: { command: "python -m unittest -v" }, state: "pending" },
      } });
    });
  });
  await page.goto("/");
  await page.getByPlaceholder(/Ask the coworker/).fill("Check the worker approval.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("python -m unittest -v", { exact: true })).toBeVisible();
  const allow = page.getByRole("button", { name: "Allow it, as the lead suggests" });
  await expect(allow).toBeVisible();
  // The real server emits this after its linked worker prompt is resolved elsewhere.
  send!({ type: "tool_finished", data: {
    name: "decide_worker_call", status: "ok", superseded_worker_call: "sample-worker-prompt",
    result_preview: '{"skipped":true,"reason":"The worker request was already resolved."}',
  } });
  await expect(allow).toHaveCount(0);
  await expect(page.getByText("The action itself isn’t available here.", { exact: false })).toHaveCount(0);
});
