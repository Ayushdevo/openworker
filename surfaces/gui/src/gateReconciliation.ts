import type { InboxItem } from "./api";
import type { Item } from "./types";

/** Completion is authoritative, regardless of which surface supplied the answer.
 * Never match by title, roster or "last proposal": a newer gate can look identical. */
export function retireFinishedGate(items: Item[], name: string, toolCallId?: string): Item[] {
  const kind = name === "propose_team" ? "teamreq" : name === "propose_work_items" ? "itemsreq" : null;
  if (!kind || !toolCallId) return items;
  return items.filter(item => !(item.kind === kind && item.toolCallId === toolCallId));
}

/** Poll fallback for a missed socket event. Absence from the pending list is NOT
 * proof of resolution: a proposal event can arrive before the Inbox row exists. */
export function reconcileResolvedGates(items: Item[], inbox: InboxItem[]): Item[] {
  const resolved = new Set(inbox.filter(i => i.state === "resolved" && i.tool_call_id)
    .map(i => i.tool_call_id));
  if (!resolved.size) return items;
  return items.filter(item => !((item.kind === "teamreq" || item.kind === "itemsreq")
    && item.toolCallId && resolved.has(item.toolCallId)));
}
