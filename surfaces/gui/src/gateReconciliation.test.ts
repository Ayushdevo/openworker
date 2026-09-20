import { describe, expect, it } from "vitest";
import { teamItemFromPayload, workItemsItemFromPayload } from "./cardPayloads";
import { reconcileResolvedGates, retireFinishedGate } from "./gateReconciliation";
import type { InboxItem } from "./api";

describe("cross-surface gate reconciliation", () => {
  const old = teamItemFromPayload({ tool_call_id: "old", members: [] });
  const newer = teamItemFromPayload({ tool_call_id: "new", members: [] });
  const split = workItemsItemFromPayload({ tool_call_id: "split", items: [] });
  const legacy = teamItemFromPayload({ members: [] });

  it("retains server identity and retires only the exact completed proposal", () => {
    expect(old.toolCallId).toBe("old");
    expect(retireFinishedGate([old, newer, split, legacy], "propose_team", "old"))
      .toEqual([newer, split, legacy]);
    expect(retireFinishedGate([old, split], "propose_work_items", "split")).toEqual([old]);
  });
  it("does not guess for old servers, unrelated results, or unknown IDs", () => {
    const items = [old, newer, legacy];
    expect(retireFinishedGate(items, "propose_team")).toBe(items);
    expect(retireFinishedGate(items, "run_shell", "old")).toBe(items);
    expect(retireFinishedGate(items, "propose_team", "missing")).toEqual(items);
  });
  it.each([JSON.stringify({ approved: true }), JSON.stringify({ approved: false }), "interrupted"])(
    "reconciles a persisted resolution (%s) without dismissing a pending replacement", resolution => {
      const inbox = [
        { state: "resolved", tool_call_id: "old", resolution },
        { state: "pending", tool_call_id: "new" },
      ] as InboxItem[];
      expect(reconcileResolvedGates([old, newer, split, legacy], inbox)).toEqual([newer, split, legacy]);
    },
  );
  it("does not infer resolution from a missing Inbox row", () => {
    const items = [old, split, legacy];
    expect(reconcileResolvedGates(items, [])).toBe(items);
    expect(reconcileResolvedGates(items, [{ state: "resolved" }] as InboxItem[])).toBe(items);
  });
});
