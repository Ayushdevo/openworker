import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TeamView } from "./TeamView";
import { sampleTeam } from "../gallery/states/team-view";
import { Composer } from "./Composer";

const calls = vi.hoisted(() => ({
  connect: vi.fn(),
  close: vi.fn(),
  messages: vi.fn(),
  detail: vi.fn(),
  send: vi.fn(),
  interrupt: vi.fn(),
}));
vi.mock("../api", async (original) => ({
  ...(await original<typeof import("../api")>()),
  getBoardItem: calls.detail,
  getSessionMessages: calls.messages,
  getInbox: async () => [],
  Session: class {
    constructor(id: string, _workspace: string, _role: string, handlers: any) {
      calls.connect(id);
      queueMicrotask(() => handlers.onOpen());
    }
    close = calls.close;
    userMessage = calls.send;
    interrupt = calls.interrupt;
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  calls.messages.mockResolvedValue([
    { role: "assistant", content: "Worker session transcript." },
  ]);
  calls.detail.mockImplementation(async (_session: string, id: number) => ({
    ...sampleTeam().items.find((i) => i.id === id),
    timeline: [
      {
        seq: 1,
        kind: "comment",
        actor: "maya",
        body: "Task-specific review note.",
      },
    ],
  }));
});
afterEach(cleanup);

it("task detail loads the task timeline, never a worker transcript or socket", async () => {
  const s = sampleTeam();
  render(
    <TeamView
      summary={s}
      sessionId={s.lead_session}
      sessions={[]}
      initialItem={1}
      onClose={() => {}}
      onRefresh={() => {}}
    />,
  );
  expect(await screen.findByText("Task-specific review note.")).toBeTruthy();
  expect(calls.connect).not.toHaveBeenCalled();
  expect(calls.messages).not.toHaveBeenCalled();
  expect(screen.queryByTestId("team-worker-transcript")).toBeNull();
  expect(screen.queryByPlaceholderText("Message sam…")).toBeNull();
  const related = screen.getByText(
    "Related worker conversations",
  ).parentElement!;
  fireEvent.click(within(related).getByRole("button", { name: "maya ↗" }));
  expect(await screen.findByText("Worker session transcript.")).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "maya" }),
  ).toBeTruthy();
  expect(screen.queryByText("Task-specific review note.")).toBeNull();
});

it("a worker with multiple tasks opens by identity and navigates to either task", async () => {
  const s = sampleTeam();
  s.workers[0].items = [1, 3];
  s.items[2].assignee = "sam";
  render(
    <TeamView
      summary={s}
      sessionId={s.lead_session}
      sessions={[]}
      onClose={() => {}}
      onRefresh={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("tab", { name: "Workers" }));
  fireEvent.click(screen.getByTestId("team-worker-sam"));
  await screen.findByText("Worker session transcript.");
  expect(
    screen.getByRole("heading", { name: "sam" }),
  ).toBeTruthy();
  expect(calls.detail).not.toHaveBeenCalled();
  expect(screen.queryByTestId("board-detail")).toBeNull();
  fireEvent.click(screen.getByText("Assigned tasks (2)"));
  fireEvent.click(
    screen.getByRole("button", {
      name: "Backfill affected invoices",
    }),
  );
  await screen.findByTestId("board-detail");
  expect(calls.detail).toHaveBeenCalledWith(s.lead_session, 3);
  expect(calls.close).toHaveBeenCalled();
  expect(screen.queryByTestId("team-worker-transcript")).toBeNull();
});

it("an unassigned worker still has a conversation and no invented task", async () => {
  const s = sampleTeam();
  s.workers[0].items = [];
  render(
    <TeamView
      summary={s}
      sessionId={s.lead_session}
      sessions={[]}
      onClose={() => {}}
      onRefresh={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("tab", { name: "Workers" }));
  fireEvent.click(screen.getByTestId("team-worker-sam"));
  await screen.findByText("Worker session transcript.");
  expect(calls.detail).not.toHaveBeenCalled();
  expect(screen.queryByText(/Assigned tasks/)).toBeNull();
});

it("the compact shared composer retains a disconnected draft and sends after reconnect", () => {
  const p = {
    compact: true,
    followsLead: true,
    mode: "interactive",
    model: "sample-model",
    models: ["sample-model"],
    running: false,
    connected: false,
    onSend: calls.send,
    onInterrupt: calls.interrupt,
    onModeChange: vi.fn(),
    onModelChange: vi.fn(),
    placeholder: "Message Sam",
    sessionId: "sam",
    workspace: "/workspace/acme",
  };
  const view = render(<Composer {...p} />);
  const input = screen.getByRole("textbox", {
    name: "Message Sam",
  }) as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: "Check the rounding." } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(calls.send).not.toHaveBeenCalled();
  expect(input.value).toBe("Check the rounding.");
  expect(screen.getByTestId("mode-follows-lead")).toBeTruthy();
  expect(screen.queryByText("sample-model")).toBeNull();
  view.rerender(<Composer {...p} connected />);
  fireEvent.keyDown(input, { key: "Enter" });
  expect(calls.send).toHaveBeenCalledWith("Check the rounding.", [], undefined);
  expect(input.value).toBe("");
});
