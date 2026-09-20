import { expect } from "@playwright/test";
import { test } from "./fixtures";

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
