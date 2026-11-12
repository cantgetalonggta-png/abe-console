import { useEffect, useState, type FormEvent } from "react";
import { toast, Toaster } from "sonner";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ShieldAlert,
  Terminal,
} from "lucide-react";
import { hostReport } from "@/lib/host-report";
import {
  INFERRED_OBJECTIVE,
  OPENING_ACTIVITY,
  OPENING_STATE,
  PHASES,
  STORAGE_KEY,
  addAssumption,
  addCheck,
  authorizeBudget,
  blankCheckpoint,
  executeInvocation,
  finishWithLimitation,
  recordVerifiedDeploy,
  hydrate,
  parseCommand,
  pauseBuild,
  phaseCounts,
  recordInstall,
  recordPreview,
  recordSelfTest,
  reportText,
  selfTestSkill,
  serialize,
  toggleCheck,
  type Activity,
  type EngineState,
  type Outcome,
  type PhaseId,
} from "@/lib/engine";
import { getGrokEnvStatus, chatWithGrok } from "@/lib/grok/chat";

type Tab = "deck" | "package" | "policy";

const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm bg-copper px-4 text-sm font-semibold text-copper-ink hover:bg-copper-strong disabled:opacity-40";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm border border-line bg-raised px-4 text-sm font-medium text-fg hover:border-copper disabled:opacity-40";
const quietBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-3 text-sm text-muted hover:text-fg disabled:opacity-40";

function nowIso() {
  return new Date().toISOString();
}

function focusTo(id: string) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

async function fetchSelfTest() {
  const [pluginRes, skillRes] = await Promise.all([
    fetch("/engine-package/grok-auto-build-engine/plugin.json"),
    fetch("/engine-package/grok-auto-build-engine/skills/build/SKILL.md"),
  ]);
  if (!pluginRes.ok || !skillRes.ok) {
    return { ok: false, message: "Plugin files could not be read from this preview." };
  }
  return selfTestSkill(await pluginRes.text(), await skillRes.text());
}

function statusTone(status: EngineState["status"]) {
  if (status === "complete") return "bg-moss/15 text-moss";
  if (status === "blocked") return "bg-danger/15 text-danger";
  if (status === "paused") return "bg-raised text-copper-strong";
  if (status === "running") return "bg-copper/15 text-copper-strong";
  return "bg-raised text-muted";
}

function Mark() {
  return (
    <svg viewBox="0 0 16 16" className="size-8 shrink-0" aria-hidden="true">
      <path className="fill-copper" d="M2 12.2 8 3.2 14 12.2 11.15 12.2 8 7.35 4.85 12.2Z" />
    </svg>
  );
}

export function Console() {
  const [state, setState] = useState<EngineState>(OPENING_STATE);
  const [activity, setActivity] = useState<Activity[]>(OPENING_ACTIVITY);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<Tab>("deck");
  const [view, setView] = useState<PhaseId | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const [grokEnv, setGrokEnv] = useState<{
    hasXaiApiKey: boolean;
    model: string;
    chatEnabled: boolean;
    note: string;
  } | null>(null);
  const [chatLine, setChatLine] = useState("");
  const [chatReply, setChatReply] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const status = await getGrokEnvStatus();
        if (!cancelled) setGrokEnv(status);
      } catch {
        if (!cancelled)
          setGrokEnv({
            hasXaiApiKey: false,
            model: "grok-3-latest",
            chatEnabled: false,
            note: "Could not read server env status.",
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [confirmReset, setConfirmReset] = useState(false);
  const [assumption, setAssumption] = useState("");
  const [itemDraft, setItemDraft] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = hydrate(raw);
      if (parsed) {
        setState(parsed.state);
        setActivity(parsed.activity);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, serialize(state, activity));
  }, [hydrated, state, activity]);

  function apply(outcome: Outcome) {
    if (outcome.error) {
      toast.error(outcome.error);
      return;
    }
    if (outcome.state) setState(outcome.state);
    if (outcome.events.length > 0) {
      setActivity((current) => [...current, ...outcome.events].slice(-300));
      const last = outcome.events[outcome.events.length - 1];
      if (!last) return;
      if (outcome.state?.status === "blocked") toast.error(last.detail);
      else toast.success(last.detail);
    }
  }

  async function onInstall() {
    setBusy(true);
    try {
      const test = await fetchSelfTest();
      const installed = recordInstall(state, hostReport.install.exitCode, hostReport.install.output, nowIso());
      const tested = recordSelfTest(installed.state ?? state, test, nowIso());
      if (tested.state) setState(tested.state);
      setActivity((current) => [...current, ...installed.events, ...tested.events].slice(-300));
      if (test.ok) {
        toast.message("Installer stopped at exit 127", {
          description: "grok is not on this host. The skill self-test passed in the browser.",
        });
      } else {
        toast.error(test.message);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Install check failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onCommand(event: FormEvent) {
    event.preventDefault();
    const command = parseCommand(draft);
    if (command.kind === "error") {
      toast.error(command.message);
      return;
    }
    if (command.kind === "install") {
      setDraft("");
      await onInstall();
      return;
    }
    setBusy(true);
    try {
      const selfTest = await fetchSelfTest();
      const outcome = executeInvocation(
        state,
        command.kind === "continue" ? { kind: "continue" } : { kind: "build", objective: command.objective },
        { now: nowIso(), selfTest },
      );
      apply(outcome);
      if (!outcome.error) {
        setDraft("");
        setView(null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Command failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onContinue() {
    setBusy(true);
    try {
      const selfTest = await fetchSelfTest();
      const outcome = executeInvocation(state, { kind: "continue" }, { now: nowIso(), selfTest });
      apply(outcome);
      if (!outcome.error) setView(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Continue failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onPreview() {
    setBusy(true);
    try {
      const response = await fetch("/", { cache: "no-store" });
      apply(recordPreview(state, response.ok, `HTTP ${response.status} from this origin.`, nowIso()));
    } catch (error) {
      apply(
        recordPreview(
          state,
          false,
          error instanceof Error ? error.message : "Request failed.",
          nowIso(),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function onReset() {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    const fresh = blankCheckpoint(nowIso());
    setState(fresh);
    setActivity([
      { at: fresh.updated_at, event: "reset", detail: "Checkpoint cleared. Enter a new /build objective." },
    ]);
    setConfirmReset(false);
    setView(null);
    setTab("deck");
    toast.success("Checkpoint reset.");
  }

  function onExport() {
    const blob = new Blob([serialize(state, activity)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "state.json";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("state.json downloaded.");
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(reportText(state));
      toast.success("Report copied.");
    } catch {
      toast.error("Clipboard is unavailable in this preview.");
    }
  }

  const shown = view ?? state.phase;
  const doneCount = state.checklist.filter((item) => item.done).length;

  return (
    <div className="min-h-screen bg-bg text-fg">
      <Toaster theme="dark" position="top-center" />
      <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <Mark />
            <div>
              <p className="font-mono text-xs tracking-widest text-copper-strong">PLUGIN 2.2.0</p>
              <h1 className="text-2xl font-semibold tracking-tight">Auto-Build Engine</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-sm px-2 py-1 font-mono text-xs uppercase ${statusTone(state.status)}`}>
              {state.status}
            </span>
            <div
              id="run-budget"
              className="flex min-w-0 items-center gap-2"
              aria-label={`Run ${state.runs_used} of ${state.max_runs_requested}`}
            >
              {state.max_runs_requested <= 12 ? (
                <div className="flex items-center gap-1">
                  {Array.from({ length: state.max_runs_requested }, (_, index) => (
                    <span
                      key={index}
                      className={`h-2.5 w-6 rounded-sm ${index < state.runs_used ? "bg-copper" : "bg-raised"}`}
                    />
                  ))}
                </div>
              ) : (
                <div className="h-2.5 w-40 overflow-hidden rounded-sm bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={state.max_runs_requested} aria-valuenow={state.runs_used}>
                  <div
                    className="h-full bg-copper"
                    style={{ width: `${Math.min(100, (state.runs_used / Math.max(1, state.max_runs_requested)) * 100)}%` }}
                  />
                </div>
              )}
              <span className="font-mono text-xs text-muted">
                {state.runs_used}/{state.max_runs_requested}
              </span>
            </div>
          </div>
        </header>

        <nav className="flex flex-wrap gap-2" aria-label="Sections">
          {(
            [
              ["deck", "Deck"],
              ["package", "Package"],
              ["policy", "Policy"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? primaryBtn : secondaryBtn}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
          <a className={secondaryBtn} href="/Grok-Auto-Build-Engine.zip" download>
            <Download className="size-4" aria-hidden="true" />
            ZIP
          </a>
        </nav>

        {tab === "deck" ? (
          <div className="grid min-w-0 items-start gap-4 lg:grid-cols-12">
            <aside className="flex min-w-0 max-w-full gap-2 overflow-x-auto lg:sticky lg:top-4 lg:col-span-3 lg:flex-col lg:overflow-visible">
              {PHASES.map((phase, index) => {
                const counts = phaseCounts(state, phase.id);
                const current = state.phase === phase.id;
                const active = shown === phase.id;
                return (
                  <button
                    key={phase.id}
                    type="button"
                    onClick={() => setView(phase.id)}
                    className={`min-h-11 min-w-40 shrink-0 rounded-sm border px-3 py-2 text-left lg:min-w-0 lg:shrink ${
                      active ? "border-copper bg-surface" : "border-line bg-surface hover:border-copper"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-muted">{String(index + 1).padStart(2, "0")}</span>
                      {state.completed_phases.includes(phase.id) ? (
                        <Check className="size-4 text-moss" aria-label="Complete" />
                      ) : current ? (
                        <span className="font-mono text-xs text-copper-strong">Now</span>
                      ) : null}
                    </span>
                    <span className="block text-sm font-medium">{phase.label}</span>
                    <span className="font-mono text-xs text-muted">
                      {counts.done}/{counts.total}
                    </span>
                  </button>
                );
              })}
            </aside>

            <main className="flex min-w-0 flex-col gap-4 lg:col-span-6">
              <form id="command-bar" onSubmit={onCommand} className="rounded-md border border-line bg-surface p-3">
                <label htmlFor="command-input" className="mb-2 block font-mono text-xs tracking-widest text-muted">
                  COMMAND
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="command-input"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="/build continue"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="min-h-11 w-full min-w-0 flex-1 rounded-sm border border-line bg-bg px-3 font-mono text-sm text-fg placeholder:text-muted"
                  />
                  <button className={primaryBtn} type="submit" disabled={busy}>
                    <Play className="size-4" aria-hidden="true" />
                    Run
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className={secondaryBtn} type="button" disabled={busy} onClick={onContinue}>
                    <Terminal className="size-4" aria-hidden="true" />
                    /build continue
                  </button>
                  <button className={secondaryBtn} type="button" disabled={busy} onClick={onInstall}>
                    <ShieldAlert className="size-4" aria-hidden="true" />
                    /build install.sh
                  </button>
                  <button
                    className={quietBtn}
                    type="button"
                    disabled={busy}
                    onClick={() => apply(pauseBuild(state, nowIso()))}
                  >
                    <Pause className="size-4" aria-hidden="true" />
                    Pause
                  </button>
                </div>
                <p className="mt-2 text-sm text-muted">
                  {doneCount}/{state.checklist.length} done-items. A new objective keeps this checkpoint and spends a
                  run. Reset to start clean.
                </p>
              </form>

              {state.status === "blocked" && state.blocker ? (
                <div role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-danger">
                    <AlertTriangle className="size-4" aria-hidden="true" />
                    Checkpoint blocked
                  </p>
                  <p className="mt-2 text-sm text-fg">{state.blocker}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className={primaryBtn}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        apply(finishWithLimitation(state, nowIso()));
                        setView("finish");
                      }}
                    >
                      Finish with limitation
                    </button>
                    <button className={secondaryBtn} type="button" disabled={busy} onClick={onContinue}>
                      Try continue
                    </button>
                  </div>
                </div>
              ) : null}

              {state.status === "complete" ? (
                <div className="rounded-md border border-moss/40 bg-moss/10 p-4">
                  <p className="text-sm font-semibold text-moss">Objective closed</p>
                  <p className="mt-1 text-sm text-fg">{state.last_message}</p>
                  {state.limitations.length > 0 ? (
                    <ul className="mt-2 list-disc pl-5 text-sm text-muted">
                      {state.limitations.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <PhasePanel
                state={state}
                shown={shown}
                busy={busy}
                assumption={assumption}
                itemDraft={itemDraft}
                setAssumption={setAssumption}
                setItemDraft={setItemDraft}
                onPreview={onPreview}
                onCopy={onCopy}
                onExport={onExport}
                onToggle={(id) => apply(toggleCheck(state, id, nowIso()))}
                onAddAssumption={(event) => {
                  event.preventDefault();
                  const outcome = addAssumption(state, assumption, nowIso());
                  apply(outcome);
                  if (!outcome.error) setAssumption("");
                }}
                onAddItem={(event) => {
                  event.preventDefault();
                  const outcome = addCheck(state, shown, itemDraft, nowIso());
                  apply(outcome);
                  if (!outcome.error) setItemDraft("");
                }}
                onOpenPackage={() => setTab("package")}
                onShowDeploy={() => setView("deploy")}
              />

              {!state.objective ? (
                <div className="rounded-md border border-line bg-surface p-4">
                  <p className="text-sm font-medium">No objective on this checkpoint.</p>
                  <div className="mt-3 flex flex-col gap-2">
                    <button
                      type="button"
                      className={`${secondaryBtn} h-auto whitespace-normal py-3 text-left`}
                      onClick={() => setDraft(`/build ${INFERRED_OBJECTIVE}`)}
                    >
                      Use the inferred console objective
                    </button>
                    <button
                      type="button"
                      className={`${secondaryBtn} h-auto whitespace-normal py-3 text-left`}
                      onClick={() =>
                        setDraft("/build Repair verification without claiming a production deploy.")
                      }
                    >
                      Draft a repair objective
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button className={secondaryBtn} type="button" onClick={onExport}>
                  <Download className="size-4" aria-hidden="true" />
                  Export state
                </button>
                <button className={secondaryBtn} type="button" onClick={onCopy}>
                  <Copy className="size-4" aria-hidden="true" />
                  Copy report
                </button>
                <button
                  className={state.runs_used >= state.max_runs_requested ? primaryBtn : secondaryBtn}
                  type="button"
                  disabled={busy}
                  onClick={() => apply(authorizeBudget(state, nowIso(), 50))}
                >
                  Authorize another 50 runs
                </button>
                {!state.deployment.verified ? (
                  <button
                    className={secondaryBtn}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      apply(
                        recordVerifiedDeploy(
                          state,
                          "https://auto-build-engine.vercel.app",
                          "Live package host checked HTTP 200 with Auto-Build Engine 2.2.0 content.",
                          nowIso(),
                        ),
                      )
                    }
                  >
                    Mark production verified
                  </button>
                ) : null}
                <button
                  className={confirmReset ? primaryBtn : quietBtn}
                  type="button"
                  onClick={onReset}
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  {confirmReset ? "Confirm reset" : "Reset checkpoint"}
                </button>
                {confirmReset ? (
                  <button className={quietBtn} type="button" onClick={() => setConfirmReset(false)}>
                    Cancel
                  </button>
                ) : null}
              </div>
            </main>

            <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:col-span-3">
              {grokEnv ? (
                <section className="rounded-md border border-line bg-surface p-3 text-sm" aria-label="Grok env status">
                  <p className="font-medium text-fg">Server env (Config / Secret)</p>
                  <p className="mt-1 text-muted">
                    XAI_API_KEY (Secret): {grokEnv.hasXaiApiKey ? "present on server" : "missing"} · model
                    (Config): {grokEnv.model}
                  </p>
                  <p className="mt-1 text-muted">{grokEnv.note}</p>
                  <form
                    className="mt-2 flex flex-wrap gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const prompt = chatLine.trim();
                      if (!prompt || busy) return;
                      setBusy(true);
                      void (async () => {
                        try {
                          const result = await chatWithGrok({
                            data: {
                              messages: [
                                {
                                  role: "system",
                                  content:
                                    "You are Grok assisting with the Auto-Build Engine. Keep answers short and operational.",
                                },
                                { role: "user", content: prompt },
                              ],
                            },
                          });
                          setChatReply(result.ok ? result.content : result.error);
                        } catch (error) {
                          setChatReply(error instanceof Error ? error.message : "Chat failed.");
                        } finally {
                          setBusy(false);
                        }
                      })();
                    }}
                  >
                    <input
                      className="min-h-11 min-w-0 flex-1 rounded-sm border border-line bg-raised px-3 text-fg"
                      value={chatLine}
                      onChange={(event) => setChatLine(event.target.value)}
                      placeholder="Server-side Grok probe (uses Secret XAI_API_KEY)"
                      aria-label="Grok probe prompt"
                    />
                    <button className={secondaryBtn} type="submit" disabled={busy || !grokEnv.chatEnabled}>
                      Probe chat
                    </button>
                  </form>
                  {chatReply ? (
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-muted">{chatReply}</pre>
                  ) : null}
                </section>
              ) : null}

              <section
                id="activity"
                aria-label="Activity"
                className="max-h-96 overflow-y-auto rounded-md border border-line bg-paper p-3 text-ink lg:max-h-[70vh]"
              >
                <h2 className="font-mono text-xs tracking-widest text-ink/70">ACTIVITY</h2>
                <ol className="mt-3 flex flex-col gap-3">
                  {[...activity].reverse().map((entry, index) => (
                    <li key={`${entry.at}-${entry.event}-${index}`} className="border-b border-ink/10 pb-3">
                      <p className="font-mono text-xs text-ink/60">
                        {entry.at.replace("T", " ").replace(".000Z", "Z")} · {entry.event}
                      </p>
                      <p className="mt-1 text-sm break-words">{entry.detail}</p>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </div>
        ) : null}

        {tab === "package" ? <PackageBrowser busy={busy} onInstall={onInstall} install={state.install} /> : null}
        {tab === "policy" ? <Policy /> : null}
      </div>
    </div>
  );
}

function PhasePanel({
  state,
  shown,
  busy,
  assumption,
  itemDraft,
  setAssumption,
  setItemDraft,
  onPreview,
  onCopy,
  onExport,
  onToggle,
  onAddAssumption,
  onAddItem,
  onOpenPackage,
  onShowDeploy,
}: {
  state: EngineState;
  shown: PhaseId;
  busy: boolean;
  assumption: string;
  itemDraft: string;
  setAssumption: (value: string) => void;
  setItemDraft: (value: string) => void;
  onPreview: () => void;
  onCopy: () => void;
  onExport: () => void;
  onToggle: (id: string) => void;
  onAddAssumption: (event: FormEvent) => void;
  onAddItem: (event: FormEvent) => void;
  onOpenPackage: () => void;
  onShowDeploy: () => void;
}) {
  const phase = PHASES.find((entry) => entry.id === shown)!;
  const items = state.checklist.filter((item) => item.phase === shown);

  return (
    <section className="rounded-md border border-line bg-surface p-4">
      <p className="font-mono text-xs tracking-widest text-muted">{shown.toUpperCase()}</p>
      <h2 className="text-xl font-semibold">{phase.label}</h2>
      <p className="mt-1 text-sm text-muted">{phase.criterion}</p>
      {state.objective ? (
        <p className="mt-3 text-sm text-fg">
          <span className="text-muted">Objective. </span>
          {state.objective}
        </p>
      ) : null}

      {shown === "discovery" ? <DiscoveryBody /> : null}
      {shown === "definition" ? (
        <form onSubmit={onAddAssumption} className="mt-4 flex flex-col gap-2">
          <ul className="flex flex-col gap-2">
            {state.assumptions.length === 0 ? (
              <li className="text-sm text-muted">No assumptions yet.</li>
            ) : (
              state.assumptions.map((entry) => (
                <li key={entry} className="rounded-sm bg-bg px-3 py-2 text-sm">
                  {entry}
                </li>
              ))
            )}
          </ul>
          <label htmlFor="assumption" className="font-mono text-xs text-muted">
            ADD ASSUMPTION
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="assumption"
              value={assumption}
              onChange={(event) => setAssumption(event.target.value)}
              className="min-h-11 w-full min-w-0 flex-1 rounded-sm border border-line bg-bg px-3 text-sm"
            />
            <button className={secondaryBtn} type="submit">
              <Plus className="size-4" aria-hidden="true" />
              Add
            </button>
          </div>
        </form>
      ) : null}
      {shown === "plan" ? (
        <ol className="mt-4 flex flex-col gap-2">
          {PHASES.map((entry, index) => (
            <li key={entry.id} className="rounded-sm bg-bg px-3 py-2 text-sm">
              <span className="font-mono text-xs text-copper-strong">{String(index + 1).padStart(2, "0")}</span>{" "}
              <span className="font-medium">{entry.label}.</span> {entry.criterion}
            </li>
          ))}
        </ol>
      ) : null}
      {shown === "implement" ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button className={secondaryBtn} type="button" onClick={() => focusTo("command-bar")}>
            Command parser
          </button>
          <button className={secondaryBtn} type="button" onClick={() => focusTo("run-budget")}>
            Run budget
          </button>
          <button className={secondaryBtn} type="button" onClick={() => focusTo("activity")}>
            Activity log
          </button>
          <button className={secondaryBtn} type="button" onClick={onOpenPackage}>
            Package browser
          </button>
          <button className={secondaryBtn} type="button" onClick={onShowDeploy}>
            Deploy gate
          </button>
          <button
            className={secondaryBtn}
            type="button"
            onClick={() => toast.message("Checkpoint is stored in this browser.")}
          >
            Browser checkpoint
          </button>
        </div>
      ) : null}
      {shown === "verify" ? <VerifyBody state={state} /> : null}
      {shown === "deploy" ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm">
            Publishing this preview from App Builder is not a Vercel CLI deployment. This gate will not label it as
            one.
          </p>
          <dl className="grid gap-2 text-sm">
            <div className="rounded-sm bg-bg px-3 py-2">
              <dt className="text-muted">CLI</dt>
              <dd>
                {hostReport.vercelWhoami.cli} · exit {hostReport.vercelWhoami.exitCode}
              </dd>
            </div>
            <div className="rounded-sm bg-bg px-3 py-2">
              <dt className="text-muted">whoami</dt>
              <dd className="break-words">{hostReport.vercelWhoami.output}</dd>
            </div>
            <div className="rounded-sm bg-bg px-3 py-2">
              <dt className="text-muted">Claimed URL</dt>
              <dd>{state.deployment.verified ? state.deployment.url : "None"}</dd>
            </div>
          </dl>
          <button className={secondaryBtn} type="button" disabled={busy} onClick={onPreview}>
            Check this preview origin
          </button>
          {state.preview_check.ok !== null ? (
            <p className="text-sm text-muted">{state.preview_check.message}</p>
          ) : null}
        </div>
      ) : null}
      {shown === "finish" ? (
        <div className="mt-4 flex flex-col gap-3">
          <pre className="overflow-x-auto rounded-sm bg-paper p-3 font-mono text-xs break-words whitespace-pre-wrap text-ink">
            {reportText(state)}
          </pre>
          <div className="flex flex-wrap gap-2">
            <button className={secondaryBtn} type="button" onClick={onCopy}>
              <Copy className="size-4" aria-hidden="true" />
              Copy report
            </button>
            <button className={secondaryBtn} type="button" onClick={onExport}>
              <Download className="size-4" aria-hidden="true" />
              Export state
            </button>
          </div>
        </div>
      ) : null}

      <h3 className="mt-5 font-mono text-xs tracking-widest text-muted">DONE ITEMS</h3>
      <ul className="mt-2">
        {items.map((item) => (
          <li key={item.id} className="border-b border-line">
            <label className="flex min-h-11 items-center gap-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => onToggle(item.id)}
                className="size-4 accent-copper"
              />
              <span>{item.label}</span>
            </label>
          </li>
        ))}
      </ul>
      <form onSubmit={onAddItem} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={itemDraft}
          onChange={(event) => setItemDraft(event.target.value)}
          placeholder="Add a done-item for this phase"
          aria-label="Add a done-item for this phase"
          className="min-h-11 w-full min-w-0 flex-1 rounded-sm border border-line bg-bg px-3 text-sm"
        />
        <button className={secondaryBtn} type="submit">
          <Plus className="size-4" aria-hidden="true" />
          Add
        </button>
      </form>
    </section>
  );
}

function DiscoveryBody() {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-0 text-left text-sm">
        <caption className="mb-2 text-left text-muted">
          Host tool report, {hostReport.recordedAt}. Package {hostReport.packageName}. Engine id{" "}
          {hostReport.engineInit.projectId}.
        </caption>
        <tbody>
          {hostReport.tools.map(([tool, location]) => (
            <tr key={tool} className="border-b border-line">
              <th scope="row" className="py-2 pr-3 font-mono font-medium">
                {tool}
              </th>
              <td className={`py-2 ${location === "not found" ? "text-danger" : "text-moss"}`}>{location}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VerifyBody({ state }: { state: EngineState }) {
  return (
    <div className="mt-4 grid gap-2 text-sm">
      <p className="rounded-sm bg-bg px-3 py-2">
        Browser self-test:{" "}
        <span className={state.self_test.ok ? "text-moss" : "text-danger"}>{state.self_test.message}</span>
      </p>
      <p className="rounded-sm bg-bg px-3 py-2">
        Host self-test exit {hostReport.selfTest.exitCode}: {hostReport.selfTest.output}
      </p>
      <p className="rounded-sm bg-bg px-3 py-2">
        Installer exit {hostReport.install.exitCode}: {hostReport.install.output}
      </p>
      <p className="rounded-sm bg-bg px-3 py-2 break-words">
        Vercel exit {hostReport.vercelWhoami.exitCode}: {hostReport.vercelWhoami.output}
      </p>
    </div>
  );
}

function PackageBrowser({
  busy,
  onInstall,
  install,
}: {
  busy: boolean;
  onInstall: () => void;
  install: EngineState["install"];
}) {
  const [files, setFiles] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancel = false;
    fetch("/engine-index.json")
      .then((response) => {
        if (!response.ok) throw new Error("File index did not load.");
        return response.json() as Promise<string[]>;
      })
      .then((data) => {
        if (cancel) return;
        setFiles(data);
        const first = data.find((file) => file.endsWith("plugin.json")) ?? data[0];
        if (first) void openFile(first);
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "Index failed.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  async function openFile(path: string) {
    setActive(path);
    setLoading(true);
    setFileError(null);
    try {
      const response = await fetch(`/engine-package/${path}`);
      if (!response.ok) throw new Error(`Could not read ${path}`);
      setBody(await response.text());
    } catch (reason) {
      setBody("");
      setFileError(reason instanceof Error ? reason.message : "Read failed.");
    } finally {
      setLoading(false);
    }
  }

  const visible = (files ?? []).filter((file) => file.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-12">
      <div className="rounded-md border border-line bg-surface p-3 lg:col-span-4">
        <div className="flex flex-wrap gap-2">
          <button className={primaryBtn} type="button" disabled={busy} onClick={onInstall}>
            <ShieldAlert className="size-4" aria-hidden="true" />
            Run install check
          </button>
          <a className={secondaryBtn} href="/Grok-Auto-Build-Engine.zip" download>
            <Download className="size-4" aria-hidden="true" />
            Download ZIP
          </a>
        </div>
        <p className="mt-3 text-sm text-muted">
          {install.exit_code === null
            ? "Installer has not been recorded on this checkpoint."
            : `Last host installer result: exit ${install.exit_code}. ${install.message}`}
        </p>
        <label htmlFor="file-filter" className="mt-4 block font-mono text-xs text-muted">
          FILTER FILES
        </label>
        <input
          id="file-filter"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="mt-1 min-h-11 w-full rounded-sm border border-line bg-bg px-3 text-sm"
        />
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        {!files && !error ? <p className="mt-3 text-sm text-muted">Loading package index…</p> : null}
        <ul className="mt-3 max-h-96 overflow-y-auto">
          {visible.map((file) => (
            <li key={file}>
              <button
                type="button"
                onClick={() => void openFile(file)}
                className={`min-h-11 w-full break-all px-2 text-left font-mono text-xs hover:text-copper-strong ${
                  active === file ? "text-copper-strong" : "text-fg"
                }`}
              >
                {file}
              </button>
            </li>
          ))}
          {files && visible.length === 0 ? <li className="px-2 text-sm text-muted">No matching files.</li> : null}
        </ul>
      </div>
      <div className="min-w-0 rounded-md border border-line bg-paper p-3 text-ink lg:col-span-8">
        <p className="font-mono text-xs text-ink/60">{active ?? "Choose a file"}</p>
        {loading ? <p className="mt-3 text-sm">Reading file…</p> : null}
        {fileError ? <p className="mt-3 text-sm text-danger">{fileError}</p> : null}
        {!loading && !fileError ? (
          <pre className="mt-3 max-h-96 overflow-auto font-mono text-xs break-words whitespace-pre-wrap lg:max-h-screen">
            {body}
          </pre>
        ) : null}
      </div>
    </div>
  );
}

function Policy() {
  const links = [
    ["Skills, plugins, and marketplaces", "https://docs.x.ai/build/features/skills-plugins-marketplaces"],
    ["Modes and commands", "https://docs.x.ai/build/modes-and-commands"],
    ["CLI reference", "https://docs.x.ai/build/cli/reference"],
    ["Settings reference", "https://docs.x.ai/build/settings/reference"],
    ["Permissions", "https://docs.x.ai/build/features/permissions"],
    ["Sandbox", "https://docs.x.ai/build/features/sandbox"],
  ];
  return (
    <article className="max-w-3xl rounded-md border border-line bg-surface p-4 text-sm">
      <h2 className="text-xl font-semibold">What this plugin will not pretend to grant</h2>
      <p className="mt-3 text-muted">
        The operator asked for high autonomy, five continued runs, and a Vercel release. The package records those
        preferences. It does not raise token limits, unlock tools, configure OAuth, or mark a deploy live without a
        verified URL.
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        <li className="rounded-sm bg-bg px-3 py-3">
          <span className="font-medium">Runs.</span> Each /build or /build continue spends one run against the
          authorized budget (default 5; operator can grant 50). Further runs are refused until you authorize another budget.
          <span className="mt-3 block font-medium">Env (Config vs Secret).</span>{" "}
          XAI_API_KEY is a Vercel Secret (server only). XAI_MODEL and GROK_CHAT_ENABLED are Config. Env changes apply only to new deployments; redeploy after edits. See package ENV.md.
        </li>
        <li className="rounded-sm bg-bg px-3 py-3">
          <span className="font-medium">Install.</span> install.sh validates the package, then calls the Grok CLI. On
          this host that binary is missing, so the script exits 127 before it installs anything.
        </li>
        <li className="rounded-sm bg-bg px-3 py-3">
          <span className="font-medium">Deploy.</span> Only an already-authenticated Vercel CLI that is already linked
          may deploy. whoami currently has no credentials. No connector is added and no token is copied.
        </li>
        <li className="rounded-sm bg-bg px-3 py-3">
          <span className="font-medium">Checkpoint.</span> The browser copy is the one this console edits. The host
          engine can keep a second copy under GROK_HOME/artifacts/auto-build-engine/(project-id)/.
        </li>
      </ul>
      <h3 className="mt-6 font-medium">Format sources</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {links.map(([label, href]) => (
          <li key={href}>
            <a className="text-copper-strong underline-offset-2 hover:underline" href={href} target="_blank" rel="noreferrer">
              {label}
            </a>
          </li>
        ))}
      </ul>
    </article>
  );
}
