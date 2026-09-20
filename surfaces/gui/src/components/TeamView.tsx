import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  getSessionMessages,
  getInbox,
  resolveInboxItem,
  Session,
  registerSessionMachine,
  getBoardItem,
  boardComment,
  boardTransition,
  fetchBoardAttachment,
  type Board,
  type BoardItemDetail,
  type InboxItem,
} from "../api";
import {
  type TeamSummary,
  type TeamTask,
  type TeamWorker,
  type Timing,
  type TokenKinds,
  GROUPS,
  tokenTotal,
} from "../teamView";
import { formatTokens } from "../usage";
import { itemsFromMessages } from "../itemsFromMessages";
import type { Item, SessionInfo } from "../types";
import { Transcript } from "./Transcript";
import { Markdown } from "./Markdown";
import { InboxItemCard } from "./InboxItemCard";
import { ItemDetail } from "./BoardPanel";
import { taskDot } from "./TaskChip";
import { Icon } from "./Icon";

export const minutes = (seconds: number) =>
  Math.max(0, Math.round(seconds / 60));
function Duration({ seconds }: { seconds: number }) {
  const { t } = useTranslation();
  if (seconds >= 3600)
    return (
      <>
        {t("teamview.hours_minutes", {
          hours: Math.floor(seconds / 3600),
          minutes: Math.floor((seconds % 3600) / 60),
        })}
      </>
    );
  return (
    <>
      {seconds < 60
        ? t("teamview.seconds", { count: Math.round(seconds) })
        : t("teamview.minutes", { count: minutes(seconds) })}
    </>
  );
}
export function TeamTotals({ summary: s }: { summary: TeamSummary }) {
  const { t } = useTranslation();
  return (
    <p className="team-totals">
      {t("teamview.done_count", { done: s.totals.done, total: s.totals.total })}{" "}
      · <Duration seconds={s.totals.elapsed_s} /> ·{" "}
      {t("teamview.tokens_count", {
        count: s.totals.tokens,
        value: formatTokens(s.totals.tokens),
      })}{" "}
      ·{" "}
      {t("teamview.asks_count", {
        count: s.totals.asks_answered + s.totals.asks_waiting,
      })}
      {s.totals.asks_waiting > 0 &&
        " " + t("teamview.asks_waiting", { count: s.totals.asks_waiting })}
    </p>
  );
}
function Headline({ count, asks = 0 }: { count: number; asks?: number }) {
  const { t } = useTranslation();
  return (
    <>
      {count
        ? t("teamview.waiting_count", { count })
        : asks
          ? t("teamview.answer_needed")
          : t("teamview.nothing_waiting")}
    </>
  );
}
export function TaskRow({
  item,
  onOpen,
  machine,
  now = Date.now() / 1000,
}: {
  item: TeamTask;
  onOpen: (id: number) => void;
  machine?: string;
  now?: number;
}) {
  const { t } = useTranslation();
  const line =
    item.waiting?.preview ||
    (item.group === "waiting" ? item.blocker : "") ||
    item.status ||
    t("teamview.state_" + item.group);
  return (
    <button
      type="button"
      className="team-task-row"
      onClick={() => onOpen(item.id)}
      data-testid={`team-task-${item.id}`}
    >
      <span className={taskDot(item.state, item.group === "waiting")} />
      <span className="team-task-main">
        <span className="team-task-title">{item.title}</span>
        <span
          className={
            "team-task-status" +
            (item.group === "waiting" ? " text-warnInk" : "")
          }
        >
          {line}
        </span>
      </span>
      {item.assignee && (
        <span className="team-worker-chip">
          {item.assignee}
          <small>{machine || t("teamview.this_machine")}</small>
        </span>
      )}
      {item.step && (
        <span className="team-pill">
          {Math.min(item.step.done + 1, item.step.total)}/{item.step.total}
        </span>
      )}
      {item.pr && <span className="team-pill">PR</span>}
      <time
        title={
          item.updated
            ? new Date(item.updated * 1000).toLocaleString()
            : undefined
        }
      >
        {item.updated ? (
          <Duration seconds={Math.max(0, now - item.updated)} />
        ) : (
          "—"
        )}
      </time>
    </button>
  );
}

export function TeamQuickLook({
  summary: s,
  onOpen,
  machine,
}: {
  summary: TeamSummary;
  onOpen: (id?: number) => void;
  machine?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null);
  const attention = s.counts.waiting > 0 || s.totals.asks_waiting > 0,
    working = s.workers.some((w) => w.running) || s.lead.running;
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const enter = (id?: number) => {
    setOpen(false);
    onOpen(id);
  };
  const rows = GROUPS.flatMap((g) => s.items.filter((i) => i.group === g));
  const roles = [...new Set(s.workers.map((w) => w.role))];
  return (
    <div className="team-icon-row max-w-3xl mx-auto" ref={root}>
      <button
        ref={button}
        type="button"
        className="team-icon-button"
        aria-label={t("teamview.quick_look")}
        aria-expanded={open}
        aria-controls="team-quick-look"
        onClick={() => setOpen(!open)}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5" />
        </svg>
        <span
          className={
            "team-presence " +
            (attention ? "attention" : working ? "working" : "idle")
          }
        />
        <span className="team-hover-line">
          {t("teamview.counts", {
            working: s.counts.working,
            review: s.counts.review,
            queued: s.counts.queued,
          })}
          <Icon name="chevronDown" size={12} />
        </span>
      </button>
      {open && (
        <section
          id="team-quick-look"
          className="team-quick-look"
          aria-label={t("teamview.quick_look")}
        >
          <h3>
            <Headline count={s.counts.waiting} asks={s.totals.asks_waiting} />
          </h3>
          <TeamTotals summary={s} />
          <div className="team-quick-rows">
            {(s.workers.length > 30
              ? rows.filter((i) => i.group === "waiting")
              : rows
            ).map((item) => (
              <TaskRow
                key={item.id}
                item={item}
                onOpen={enter}
                machine={machine}
                now={s.generated_at}
              />
            ))}
            {s.workers.length > 30 &&
              roles.map((role) => (
                <button
                  className="team-role-peek"
                  key={role}
                  onClick={() => enter()}
                >
                  {role} × {s.workers.filter((w) => w.role === role).length}
                  <span>
                    {t("teamview.working_count", {
                      count: s.workers.filter(
                        (w) => w.role === role && w.running,
                      ).length,
                    })}
                  </span>
                </button>
              ))}
          </div>
          <button className="team-open-link" onClick={() => enter()}>
            {t("teamview.open_view")} →
          </button>
        </section>
      )}
    </div>
  );
}

const TIME_KEYS: (keyof Timing)[] = [
  "model_ms",
  "tool_ms",
  "waited_ms",
  "queued_ms",
];
const TOKEN_KEYS: (keyof TokenKinds)[] = [
  "input",
  "cache_read",
  "output",
  "cache_write",
];
export function MetricBar({
  values,
  kind,
  partial,
}: {
  values?: Timing | TokenKinds | null;
  kind: "time" | "tokens";
  partial?: boolean;
}) {
  const { t } = useTranslation();
  if (!values)
    return <p className="team-totals">{t("teamview.timing_unavailable")}</p>;
  const keys = kind === "time" ? TIME_KEYS : TOKEN_KEYS;
  const rows = keys.map((k) => ({
    key: k,
    value: Math.max(
      0,
      Number((values as unknown as Record<string, number>)[k]) || 0,
    ),
  }));
  const total = rows.reduce((n, r) => n + r.value, 0);
  return (
    <div className={"team-metric " + kind}>
      <div className="team-metric-bar" aria-hidden="true">
        {rows.map((r, i) => (
          <span
            key={r.key}
            className={`segment-${i}`}
            style={{ width: `${total ? (r.value / total) * 100 : 0}%` }}
          />
        ))}
      </div>
      <div className="team-legend">
        {rows.map((r, i) => (
          <span key={r.key}>
            <i className={`segment-${i}`} />
            {t("teamview." + r.key)}{" "}
            {kind === "tokens" ? (
              formatTokens(r.value)
            ) : (
              <Duration seconds={r.value / 1000} />
            )}
          </span>
        ))}
      </div>
      {partial && (
        <p className="team-totals">
          {t(
            kind === "time"
              ? "teamview.timing_partial"
              : "teamview.usage_partial",
          )}
        </p>
      )}
    </div>
  );
}

function WorkerRows({
  summary: s,
  onWorker,
  machine,
}: {
  summary: TeamSummary;
  onWorker: (worker: TeamWorker) => void;
  machine?: string;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<string[]>([]);
  const row = (w: TeamWorker) => (
    <button
      className="team-task-row"
      key={w.actor}
      onClick={() => onWorker(w)}
      data-testid={`team-worker-${w.actor}`}
    >
      <span className={taskDot(w.running ? "in_progress" : "open")} />
      <span className="team-task-main">
        <span className="team-task-title">
          {w.actor} <small>· {w.role}</small>
        </span>
        <span className="team-task-status">
          {s.items
            .filter(
              (i) =>
                w.items.includes(i.id) &&
                !["done", "canceled"].includes(i.group),
            )
            .map((i) => i.status || i.title)
            .join(" · ") || t("teamview.idle")}
        </span>
      </span>
      <span className="team-worker-chip">
        {machine || t("teamview.this_machine")}
      </span>
      <span>{formatTokens(tokenTotal(w.tokens))}</span>
    </button>
  );
  if (s.workers.length <= 8) return <>{s.workers.map(row)}</>;
  return (
    <>
      {[...new Set(s.workers.map((w) => w.role))].map((role) => {
        const workers = s.workers.filter((w) => w.role === role);
        const items = s.items.filter((i) =>
          workers.some((w) => w.items.includes(i.id)),
        );
        const done = items.filter((i) => i.group === "done").length;
        return (
          <section key={role}>
            <div className="team-group-heading">
              {role} × {workers.length}
              {s.workers.length > 30 && (
                <>
                  <progress
                    value={done}
                    max={Math.max(1, items.length)}
                    aria-label={t("teamview.done_count", {
                      done,
                      total: items.length,
                    })}
                  />
                  <span>
                    {formatTokens(
                      workers.reduce((n, w) => n + tokenTotal(w.tokens), 0),
                    )}
                  </span>
                  <button
                    onClick={() =>
                      setExpanded((x) =>
                        x.includes(role)
                          ? x.filter((r) => r !== role)
                          : [...x, role],
                      )
                    }
                  >
                    {t(
                      expanded.includes(role)
                        ? "teamview.hide_workers"
                        : "teamview.show_workers",
                    )}
                  </button>
                </>
              )}
            </div>
            {(s.workers.length <= 30 || expanded.includes(role)) &&
              workers.map(row)}
          </section>
        );
      })}
    </>
  );
}

function Stats({ summary: s }: { summary: TeamSummary }) {
  const { t } = useTranslation();
  const [by, setBy] = useState<"worker" | "role">("worker"),
    [chart, setChart] = useState(false);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const roles = [...new Set(s.workers.map((w) => w.role))];
  const rows =
    by === "role"
      ? roles.map((role) => ({
          label: role,
          value: s.workers
            .filter((w) => w.role === role)
            .reduce((n, w) => n + tokenTotal(w.tokens), 0),
        }))
      : s.workers.map((w) => ({ label: w.actor, value: tokenTotal(w.tokens) }));
  rows.sort((a, b) => b.value - a.value);
  const shown = by === "worker" && rows.length > 30 ? rows.slice(0, 5) : rows;
  const max = Math.max(1, ...rows.map((r) => r.value));
  const workTime = s.timing
    ? s.timing.model_ms + s.timing.tool_ms + s.timing.waited_ms
    : 0;
  const timelineRoles = [...new Set(s.usage_points.map((p) => p.role))];
  const start = s.usage_points[0]?.ts || 0,
    end = s.usage_points[s.usage_points.length - 1]?.ts || start + 1;
  const samples = Array.from(
    { length: 41 },
    (_, i) => start + ((end - start) * i) / 40,
  );
  let baseline = samples.map(() => 0);
  const paths = timelineRoles.map((role, ri) => {
    const top = samples.map(
      (ts, i) =>
        baseline[i] +
        s.usage_points
          .filter((p) => p.role === role && p.ts <= ts)
          .reduce((n, p) => n + p.tokens, 0),
    );
    const point = (v: number, i: number) =>
      `${(i / 40) * 500},${120 - (v / Math.max(1, s.totals.tokens)) * 120}`;
    const path =
      "M" +
      top.map(point).join(" L") +
      " L" +
      baseline.map(point).reverse().join(" L") +
      " Z";
    baseline = top;
    return <path key={role} d={path} className={`role-color-${ri % 5}`} />;
  });
  return (
    <>
      <div className="team-stat-cards">
        <Stat
          label={t("teamview.tokens")}
          value={formatTokens(s.totals.tokens)}
        />
        <Stat
          label={t("teamview.elapsed")}
          value={<Duration seconds={s.totals.elapsed_s} />}
        />
        <Stat
          label={t("teamview.needed_you")}
          value={s.totals.asks_answered + s.totals.asks_waiting}
        />
        <Stat
          label={t("teamview.tasks")}
          value={`${s.totals.done} / ${s.totals.total}`}
        />
      </div>
      <section className="team-stats-section">
        <h3>{t("teamview.tokens")}</h3>
        <div className="team-metric-bar">
          <span
            className="lead-segment"
            style={{
              width: `${(tokenTotal(s.lead.tokens) / Math.max(1, s.totals.tokens)) * 100}%`,
            }}
          />
          <span className="worker-segment" style={{ flex: 1 }} />
        </div>
        <p className="team-legend">
          {t("teamview.lead")} {formatTokens(tokenTotal(s.lead.tokens))} ·{" "}
          {t("teamview.workers")}{" "}
          {formatTokens(s.totals.tokens - tokenTotal(s.lead.tokens))}
        </p>
        <MetricBar
          kind="tokens"
          values={s.totals.tokens_by_kind}
          partial={s.usage_partial}
        />
      </section>
      <section className="team-stats-section">
        <div className="team-section-title">
          <h3>{t("teamview.where_tokens")}</h3>
          <div className="team-tabs">
            <button
              aria-pressed={by === "worker"}
              onClick={() => setBy("worker")}
            >
              {t("teamview.by_worker")}
            </button>
            <button aria-pressed={by === "role"} onClick={() => setBy("role")}>
              {t("teamview.by_role")}
            </button>
          </div>
        </div>
        {shown.length < rows.length && (
          <p className="team-totals">
            {t("teamview.top_five", { count: rows.length })}
          </p>
        )}
        {shown.map((r) => (
          <div key={r.label}>
            <button
              className="team-usage-row"
              disabled={by !== "role"}
              onClick={() =>
                setExpandedRole(expandedRole === r.label ? null : r.label)
              }
            >
              <span>{r.label}</span>
              <span className="team-usage-track">
                <i style={{ width: `${(r.value / max) * 100}%` }} />
              </span>
              <span>{formatTokens(r.value)}</span>
            </button>
            {by === "role" &&
              expandedRole === r.label &&
              s.workers
                .filter((w) => w.role === r.label)
                .map((w) => (
                  <p className="team-totals" key={w.actor}>
                    {w.actor} · {formatTokens(tokenTotal(w.tokens))}
                  </p>
                ))}
          </div>
        ))}
        <button
          className="team-open-link"
          onClick={() => setChart(!chart)}
          aria-expanded={chart}
        >
          {t(chart ? "teamview.hide_chart" : "teamview.show_chart")}
        </button>
        {chart &&
          (s.usage_points.length ? (
            <>
              <svg
                viewBox="0 0 500 130"
                role="img"
                aria-label={t("teamview.tokens_over_time")}
              >
                {paths}
              </svg>
              <div className="team-legend">
                {timelineRoles.map((role, i) => (
                  <span key={role}>
                    <i className={`role-color-${i % 5}`} />
                    {role === "lead" ? t("teamview.lead") : role}
                  </span>
                ))}
              </div>
              <p className="team-totals">
                {new Date(start * 1000).toLocaleTimeString()} —{" "}
                {new Date(end * 1000).toLocaleTimeString()}
              </p>
            </>
          ) : (
            <p>{t("teamview.no_usage")}</p>
          ))}
      </section>
      <section className="team-stats-section">
        <h3>{t("teamview.needed_you")}</h3>
        <table className="team-asks">
          <thead>
            <tr>
              <th></th>
              <th>{t("teamview.answered")}</th>
              <th>{t("teamview.waiting")}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(s.asks).map(([kind, a]) => (
              <tr key={kind}>
                <th>{t("teamview.ask_" + kind)}</th>
                <td>{a.answered}</td>
                <td>{a.waiting}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {s.median_answer_s != null && (
          <p className="team-totals">
            {t("teamview.median_answer")}{" "}
            <Duration seconds={s.median_answer_s} />
          </p>
        )}
        {s.totals.done > 0 && (
          <p className="team-totals">
            {t("teamview.asks_per_task", {
              value: (
                (s.totals.asks_answered + s.totals.asks_waiting) /
                s.totals.done
              ).toFixed(1),
            })}
          </p>
        )}
      </section>
      <section className="team-stats-section">
        <h3>{t("teamview.where_time")}</h3>
        <MetricBar kind="time" values={s.timing} partial={s.timing_partial} />
        {s.timing && (
          <p className="team-totals">
            <Duration seconds={s.totals.elapsed_s} /> {t("teamview.elapsed")} ·{" "}
            <Duration seconds={workTime / 1000} /> {t("teamview.worker_time")} ·{" "}
            {s.totals.elapsed_s > 0
              ? (workTime / 1000 / s.totals.elapsed_s).toFixed(1)
              : "0"}
            ×
          </p>
        )}
      </section>
    </>
  );
}
function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

export function TeamView({
  summary,
  board,
  initialItem,
  openKey = 0,
  sessionId,
  sessions,
  machine,
  machineName,
  onClose,
  onRefresh,
}: {
  summary: TeamSummary | null;
  openKey?: number;
  board?: Board | null;
  initialItem?: number | null;
  sessionId: string;
  sessions: SessionInfo[];
  machine?: string | null;
  machineName?: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"work" | "workers" | "stats">("work");
  const [selected, setSelected] = useState<number | null>(initialItem ?? null);
  const [selectedWorker, setSelectedWorker] = useState<TeamWorker | null>(null);
  useEffect(() => {
    setSelected(initialItem ?? null);
    setSelectedWorker(null);
  }, [initialItem, sessionId, openKey]);
  const fallbackItems: TeamTask[] = (board?.items || []).map((i) => ({
    ...i,
    group: i.waiting
      ? "waiting"
      : i.state === "in_progress"
        ? "working"
        : i.state === "blocked"
          ? "waiting"
          : i.state === "open"
            ? "queued"
            : (i.state as TeamTask["group"]),
    updated: 0,
    elapsed_s: 0,
    tokens: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
  }));
  const shownItems = summary?.items || fallbackItems;
  const task = shownItems.find((i) => i.id === selected);
  const knownWorker = sessions.find(
    (w) =>
      w.team?.actor === task?.assignee && w.team?.lead_session === sessionId,
  );
  const worker =
    selectedWorker ||
    summary?.workers.find((w) => w.actor === task?.assignee) ||
    (knownWorker
      ? {
          actor: knownWorker.team!.actor!,
          role: knownWorker.agent,
          session_id: knownWorker.session_id,
          model: knownWorker.model,
          workspace: knownWorker.workspace,
          running: knownWorker.liveness === "working",
          tokens: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
          items: [selected!],
        }
      : undefined);
  const goBack = () => {
    setSelected(null);
    setSelectedWorker(null);
  };
  const openWorker = (w: TeamWorker) => {
    setSelectedWorker(w);
    setSelected(w.items[0] ?? null);
  };
  return (
    <section
      className="team-view"
      aria-label={t("teamview.title")}
      data-testid="team-view"
      onKeyDown={(e) => {
        if (
          e.key === "Escape" &&
          !(e.target instanceof HTMLTextAreaElement) &&
          !(e.target instanceof HTMLInputElement)
        ) {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="team-pane-header">
        {selected != null || selectedWorker ? (
          <button onClick={goBack}>← {t("teamview.title")}</button>
        ) : (
          <div className="team-tabs" role="tablist">
            {(["work", "workers", "stats"] as const)
              .filter((name) => !!summary || name === "work")
              .map((name) => (
                <button
                  role="tab"
                  key={name}
                  aria-selected={tab === name}
                  onClick={() => setTab(name)}
                >
                  {t("teamview." + name)}
                  {name === "work" && !!summary?.counts.waiting && (
                    <span className="team-attention-count">
                      {summary.counts.waiting}
                    </span>
                  )}
                </button>
              ))}
          </div>
        )}
        <button
          className="team-close"
          onClick={onClose}
          aria-label={t("teamview.close")}
        >
          ×
        </button>
      </header>
      {selected != null || selectedWorker ? (
        <TaskConversation
          key={`${sessionId}:${selected}:${worker?.session_id}`}
          task={task}
          worker={worker}
          leadSession={sessionId}
          machine={
            sessions.find((s) => s.session_id === worker?.session_id)
              ?.machine ?? machine
          }
          machineName={machineName}
          onRefresh={onRefresh}
        />
      ) : (
        <div className="team-pane-body">
          {!summary ? (
            <>
              <p role="status">{t("teamview.summary_unavailable")}</p>
              {GROUPS.map((group) => {
                const tasks = shownItems.filter((i) => i.group === group);
                return (
                  !!tasks.length && (
                    <section key={group}>
                      <h3 className="team-group-heading">
                        {t("teamview.state_" + group)}
                      </h3>
                      {tasks.map((item) => (
                        <TaskRow
                          key={item.id}
                          item={item}
                          onOpen={setSelected}
                        />
                      ))}
                    </section>
                  )
                );
              })}
            </>
          ) : tab === "work" ? (
            <>
              <h2>
                <Headline
                  count={summary.counts.waiting}
                  asks={summary.totals.asks_waiting}
                />
              </h2>
              <TeamTotals summary={summary} />
              {!summary.totals.total && <p>{t("teamview.no_tasks")}</p>}
              {GROUPS.map((group) => {
                const tasks = summary.items.filter((i) => i.group === group);
                if (!tasks.length) return null;
                const rows = tasks.map((item) => (
                  <TaskRow
                    key={item.id}
                    item={item}
                    machine={machineName}
                    onOpen={setSelected}
                    now={summary.generated_at}
                  />
                ));
                return group === "done" ? (
                  <details className="team-done" key={group}>
                    <summary className="team-group-heading">
                      {t("teamview.state_done")} <span>{tasks.length}</span>
                    </summary>
                    {rows}
                  </details>
                ) : (
                  <section key={group}>
                    <h3 className="team-group-heading">
                      {t("teamview.state_" + group)} <span>{tasks.length}</span>
                    </h3>
                    {rows}
                  </section>
                );
              })}
            </>
          ) : tab === "workers" ? (
            <>
              <h2>
                {t("teamview.workers_count", { count: summary.workers.length })}
              </h2>
              <TeamTotals summary={summary} />
              <WorkerRows
                summary={summary}
                onWorker={openWorker}
                machine={machineName}
              />
            </>
          ) : (
            <Stats summary={summary} />
          )}
        </div>
      )}
    </section>
  );
}

function TaskConversation({
  task,
  worker,
  leadSession,
  machine,
  machineName,
  onRefresh,
}: {
  task?: TeamTask;
  worker?: TeamWorker;
  leadSession: string;
  machine?: string | null;
  machineName?: string;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Item[]>([]),
    [stream, setStream] = useState(""),
    [running, setRunning] = useState(false);
  const [connected, setConnected] = useState(false),
    [draft, setDraft] = useState(""),
    [error, setError] = useState("");
  const [pending, setPending] = useState<InboxItem[]>([]),
    [detail, setDetail] = useState<BoardItemDetail | null>(null);
  const socket = useRef<Session | null>(null);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  useEffect(() => {
    let canceled = false;
    if (!task) return;
    getBoardItem(leadSession, task.id)
      .then((d) => {
        if (!canceled && !("error" in d)) setDetail(d);
      })
      .catch(() => {
        if (!canceled) setError(t("teamview.load_error"));
      });
    return () => {
      canceled = true;
    };
  }, [leadSession, task?.id, task?.updated, t]);
  useEffect(() => {
    if (!worker) return;
    let canceled = false,
      generation = 0;
    registerSessionMachine(worker.session_id, machine);
    const load = async () => {
      const current = ++generation;
      try {
        const [messages, prompts] = await Promise.all([
          getSessionMessages(worker.session_id),
          getInbox(worker.session_id, "pending"),
        ]);
        if (!canceled && current === generation) {
          setItems(itemsFromMessages(messages));
          setPending(prompts);
          setError("");
        }
      } catch {
        if (!canceled) setError(t("teamview.load_error"));
      }
    };
    const session = new Session(
      worker.session_id,
      worker.workspace,
      worker.role,
      {
        onOpen: () => {
          if (!canceled) {
            setConnected(true);
            void load();
          }
        },
        onClose: () => {
          if (!canceled) setConnected(false);
        },
        onEvent: ({ type, data }) => {
          if (canceled) return;
          if (type === "ready") {
            setRunning(!!data.running);
            void load();
          }
          if (type === "turn_start") {
            setRunning(true);
            setStream("");
          }
          if (type === "assistant_delta")
            setStream((s) => s + (data.text || ""));
          if (type === "assistant_message") {
            setStream("");
            if (data.text)
              setItems((x) => [...x, { kind: "assistant", text: data.text }]);
          }
          if (
            [
              "permission_required",
              "question_requested",
              "directory_requested",
              "tool_requested",
              "plan_proposed",
              "tool_finished",
              "turn_done",
            ].includes(type)
          )
            void load();
          if (["turn_done", "error", "interrupted"].includes(type)) {
            setRunning(false);
            setStream("");
            refreshRef.current();
          }
          if (type === "error" || type === "input_rejected")
            setError(
              String(data.error || data.reason || t("teamview.send_error")),
            );
        },
      },
      machine,
    );
    socket.current = session;
    void load();
    // Permission events precede parking the durable prompt. Reuse the app's
    // five-second refresh cadence so a suspended worker's card cannot be missed.
    const refresh = window.setInterval(() => void load(), 5000);
    return () => {
      canceled = true;
      generation++;
      window.clearInterval(refresh);
      session.close();
      socket.current = null;
    };
  }, [worker?.session_id, machine, t]);
  const reloadDetail = async () => {
    if (!task) return;
    const d = await getBoardItem(leadSession, task.id);
    if ("error" in d) throw new Error(d.error);
    setDetail(d);
    onRefresh();
  };
  return (
    <>
      <div className="team-worker-header">
        <h2>
          {task?.title || worker?.actor || t("teamview.task_unavailable")}
        </h2>
        <p className="team-totals">
          {worker?.actor} {worker && "· " + worker.role} ·{" "}
          {machineName || t("teamview.this_machine")}
        </p>
        {task && task.elapsed_s > 0 && (
          <>
            <MetricBar
              kind="time"
              values={task.timing}
              partial={task.timing_partial}
            />
            <MetricBar
              kind="tokens"
              values={task.tokens}
              partial={task.usage_partial}
            />
          </>
        )}
      </div>
      <div className="team-pane-body team-worker-transcript">
        {detail && (
          <details className="team-task-detail">
            <summary>{t("teamview.task_details")}</summary>
            <ItemDetail
              detail={detail}
              onTransition={(id, to, comment) => {
                void boardTransition(leadSession, id, to, comment)
                  .then((result) => {
                    if ("error" in result) throw new Error(result.error);
                    return reloadDetail();
                  })
                  .catch(() => setError(t("teamview.action_error")));
              }}
              onAddNote={async (id, body) => {
                try {
                  const result = await boardComment(leadSession, id, body);
                  if (result.error) throw new Error(result.error);
                  await reloadDetail();
                } catch (e) {
                  setError(t("teamview.action_error"));
                  throw e;
                }
              }}
              loadAttachment={(stored) =>
                fetchBoardAttachment(leadSession, stored)
              }
            />
          </details>
        )}
        {worker ? (
          <>
            <Transcript
              items={items}
              running={running}
              onApprove={(d) => socket.current?.approve(d)}
            />
            {stream && <Markdown text={stream} />}
          </>
        ) : (
          <p>{t("teamview.unassigned")}</p>
        )}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </div>
      {worker && (
        <div className="team-worker-composer">
          {pending[0] && (
            <InboxItemCard
              item={pending[0]}
              compact
              onResolve={async (id, answer) => {
                try {
                  await resolveInboxItem(id, answer);
                  setPending((p) => p.filter((i) => i.id !== id));
                  onRefresh();
                } catch {
                  setError(t("teamview.action_error"));
                }
              }}
            />
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!connected || !draft.trim()) return;
              socket.current?.userMessage(
                draft.trim(),
                undefined,
                worker.model,
              );
              setItems((x) => [...x, { kind: "user", text: draft.trim() }]);
              setDraft("");
            }}
          >
            <textarea
              aria-label={t("teamview.message_worker", {
                worker: worker.actor,
              })}
              placeholder={t("teamview.message_worker", {
                worker: worker.actor,
              })}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!connected}
            />
            <button
              type="submit"
              className="btn primary"
              disabled={!connected || !draft.trim()}
            >
              {t("teamview.send")}
            </button>
          </form>
          {!connected && (
            <p className="team-totals">{t("teamview.worker_offline")}</p>
          )}
        </div>
      )}
    </>
  );
}
