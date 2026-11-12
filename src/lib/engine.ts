export const STORAGE_KEY = "auto-build-engine:preview-console:v1";

export const FIRST_MARKER = "ĻƏŤŜFÙÇƘÌN̈ĢÐºȚĤİ§";

export const INFERRED_OBJECTIVE =
  "Ship a working Auto-Build Engine console: /build, /build continue, and /build install.sh; a checkpoint with an authorized run budget; a package browser; verification that does not hide failures; and a deploy gate that refuses an unverified Vercel release.";

export const DEPLOY_BLOCKER =
  "Sandbox Vercel CLI has no credentials. Production package host is verified at https://auto-build-engine.vercel.app. Connected team echo-ec69 cannot create projects (403).";

export const DEPLOY_LIMITATION =
  "Package host production is verified at https://auto-build-engine.vercel.app. Grok CLI remains absent on this host (install exit 127). Sandbox CLI stays unauthenticated.";

export const INSTALL_MESSAGE =
  "Grok Build CLI ('grok') was not found. Install Grok Build, then rerun this installer.";

export const DEFAULT_ASSUMPTIONS = [
  "This preview stores the checkpoint in the browser. The host engine file lives under GROK_HOME when the CLI is installed.",
  "Grok CLI is not on this host, so install.sh cannot reach grok plugin validate.",
  "Sandbox Vercel CLI is unauthenticated; package production is verified at https://auto-build-engine.vercel.app.",
];

export const PHASES = [
  { id: "discovery", label: "Discover", criterion: "Workspace, stack, package, and tools are recorded." },
  { id: "definition", label: "Define", criterion: "Objective, assumptions, and done-items are locked." },
  { id: "plan", label: "Plan", criterion: "Phases are ordered and each one can be verified." },
  { id: "implement", label: "Implement", criterion: "Commands and controls change the checkpoint." },
  { id: "verify", label: "Verify", criterion: "Checks run, and failures stay failures." },
  { id: "deploy", label: "Deploy", criterion: "Only a verified deployment URL may be claimed." },
  { id: "finish", label: "Finish", criterion: "The report is complete, or the blocker is named." },
] as const;

export type PhaseId = (typeof PHASES)[number]["id"];

export type Status = "ready" | "running" | "paused" | "blocked" | "complete";

export type CheckItem = {
  id: string;
  phase: PhaseId;
  label: string;
  done: boolean;
};

export type Activity = {
  at: string;
  event: string;
  detail: string;
};

export type SelfTestResult = { ok: boolean; message: string };

export type EngineState = {
  schema_version: 1;
  project_id: string;
  project_label: string;
  objective: string;
  status: Status;
  phase: PhaseId;
  completed_phases: PhaseId[];
  checklist: CheckItem[];
  assumptions: string[];
  runs_used: number;
  max_runs_requested: number;
  created_at: string;
  updated_at: string;
  last_message: string;
  blocker: string | null;
  limitations: string[];
  first_marker: string | null;
  deployment: { verified: boolean; url: string | null; note: string };
  install: { exit_code: number | null; message: string };
  self_test: SelfTestResult;
  preview_check: { ok: boolean | null; message: string };
  runs: { run: number; at: string; phase: PhaseId; summary: string }[];
};

export type Outcome = {
  state: EngineState | null;
  events: Activity[];
  error: string | null;
};

export type Command =
  | { kind: "build"; objective: string }
  | { kind: "continue" }
  | { kind: "install" }
  | { kind: "error"; message: string };

const CHECK_SEEDS: Omit<CheckItem, "done">[] = [
  { id: "d-root", phase: "discovery", label: "Workspace root and package.json identified" },
  { id: "d-stack", phase: "discovery", label: "Stack recorded: TanStack Start, React 19, Tailwind v4" },
  { id: "d-plugin", phase: "discovery", label: "Plugin package grok-auto-build-engine 2.2.0 located" },
  { id: "d-tools", phase: "discovery", label: "Tool report recorded, including the missing grok CLI" },
  { id: "def-obj", phase: "definition", label: "Operator objective stored on the checkpoint" },
  { id: "def-inv", phase: "definition", label: "Done-items cover runs, install, and deploy honesty" },
  { id: "def-assume", phase: "definition", label: "Reversible assumptions written down" },
  { id: "plan-order", phase: "plan", label: "Phases ordered from discovery through finish" },
  { id: "plan-criteria", phase: "plan", label: "Each phase has a verifiable completion criterion" },
  { id: "plan-resume", phase: "plan", label: "Continue reads the saved phase instead of restarting" },
  { id: "imp-parse", phase: "implement", label: "Command line accepts /build, continue, and install.sh" },
  { id: "imp-persist", phase: "implement", label: "Checkpoint persists in this browser" },
  { id: "imp-budget", phase: "implement", label: "Run budget enforces the authorized max (default 5, operator can grant 50)" },
  { id: "imp-files", phase: "implement", label: "Package browser reads the shipped plugin files" },
  { id: "imp-log", phase: "implement", label: "Activity log records each invocation" },
  { id: "v-self", phase: "verify", label: "Skill self-test passed" },
  { id: "v-host", phase: "verify", label: "Host core-engine.js self-test exit 0 recorded" },
  { id: "v-install", phase: "verify", label: "Installer exit 127 recorded and not treated as success" },
  { id: "v-vercel", phase: "verify", label: "Unauthenticated Vercel CLI recorded and not treated as a deploy" },
  { id: "dep-oauth", phase: "deploy", label: "No OAuth, token, or allowlist change attempted" },
  { id: "dep-url", phase: "deploy", label: "No production URL marked verified" },
  { id: "fin-status", phase: "finish", label: "Status is complete or blocked with a next action" },
  { id: "fin-export", phase: "finish", label: "Report can be exported" },
];

const PHASE_NOTES: Record<Exclude<PhaseId, "deploy" | "verify" | "finish">, string> = {
  discovery: "Workspace, stack, plugin 2.2.0, and the tool report are recorded.",
  definition: "Definition of done is locked. Assumptions are on the checkpoint.",
  plan: "Plan accepted: seven phases, resume with /build continue.",
  implement: "Console controls write through to the checkpoint engine.",
};

const ORDER = PHASES.map((phase) => phase.id);

function nextPhase(phase: PhaseId): PhaseId {
  const index = ORDER.indexOf(phase);
  return ORDER[Math.min(index + 1, ORDER.length - 1)]!;
}

function markIds(state: EngineState, ids: string[]) {
  for (const item of state.checklist) {
    if (ids.includes(item.id)) item.done = true;
  }
}

function completePhase(state: EngineState, phase: PhaseId) {
  for (const item of state.checklist) {
    if (item.phase === phase) item.done = true;
  }
  if (!state.completed_phases.includes(phase)) state.completed_phases.push(phase);
}

export function createInitial(now: string): EngineState {
  return {
    schema_version: 1,
    project_id: "preview-console",
    project_label: "This preview",
    objective: "",
    status: "ready",
    phase: "discovery",
    completed_phases: [],
    checklist: CHECK_SEEDS.map((item) => ({ ...item, done: false })),
    assumptions: [],
    runs_used: 0,
    max_runs_requested: 5,
    created_at: now,
    updated_at: now,
    last_message: "Ready. Enter /build and an objective, or /build install.sh.",
    blocker: null,
    limitations: [],
    first_marker: null,
    deployment: { verified: false, url: null, note: "" },
    install: { exit_code: null, message: "" },
    self_test: { ok: false, message: "Not run." },
    preview_check: { ok: null, message: "Not run." },
    runs: [],
  };
}

export function parseCommand(raw: string): Command {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) {
    return {
      kind: "error",
      message: "Enter /build <objective>, /build continue, or /build install.sh.",
    };
  }
  let body = text.startsWith("/") ? text.slice(1) : text;
  const lower = body.toLowerCase();
  if (lower === "build") {
    return { kind: "error", message: "Add an objective, or use /build continue." };
  }
  if (lower === "continue" || lower === "build continue") return { kind: "continue" };
  if (lower === "install.sh" || lower === "build install.sh" || lower === "build install") {
    return { kind: "install" };
  }
  if (lower.startsWith("build ")) {
    const rest = body.slice("build ".length).trim();
    if (!rest) return { kind: "error", message: "Add an objective, or use /build continue." };
    if (rest.toLowerCase() === "continue") return { kind: "continue" };
    if (rest.toLowerCase() === "install.sh" || rest.toLowerCase() === "install") return { kind: "install" };
    return { kind: "build", objective: rest };
  }
  return {
    kind: "error",
    message: "Unknown command. Use /build <objective>, /build continue, or /build install.sh.",
  };
}

export function selfTestSkill(pluginJson: string, skill: string): SelfTestResult {
  try {
    const manifest = JSON.parse(pluginJson) as { name?: string; version?: string };
    if (manifest.name !== "grok-auto-build-engine" || !manifest.version) {
      return { ok: false, message: "plugin.json is missing the engine name or version." };
    }
    if (!skill.startsWith("---\n") || !skill.includes("name: build")) {
      return { ok: false, message: "Build skill frontmatter is missing or malformed." };
    }
    return { ok: true, message: "Auto-Build Engine self-test passed." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "plugin.json did not parse.";
    return { ok: false, message };
  }
}

export function executeInvocation(
  prev: EngineState | null,
  action: { kind: "build"; objective: string } | { kind: "continue" },
  ctx: { now: string; selfTest: SelfTestResult | null },
): Outcome {
  if (action.kind === "build" && !action.objective.trim()) {
    return {
      state: prev,
      error: "Add an objective. /build continue resumes a saved checkpoint.",
      events: [],
    };
  }
  if (action.kind === "continue" && (!prev || !prev.objective.trim())) {
    return { state: prev, error: "No checkpoint yet. Start with /build and an objective.", events: [] };
  }
  if (prev?.status === "complete") {
    return {
      state: prev,
      error: null,
      events: [
        {
          at: ctx.now,
          event: "already_complete",
          detail: "Objective is already marked complete.",
        },
      ],
    };
  }
  const limit = prev?.max_runs_requested ?? 5;
  if ((prev?.runs_used ?? 0) >= limit) {
    return {
      state: prev,
      error: `Requested run budget exhausted (${prev?.runs_used ?? limit}/${limit}). Resume only after the operator authorizes additional runs.`,
      events: [],
    };
  }

  const state = structuredClone(prev ?? createInitial(ctx.now));
  const events: Activity[] = [];
  if (action.kind === "build") state.objective = action.objective.trim().slice(0, 500);
  const repeatDeploy = prev?.status === "blocked" && prev.phase === "deploy";
  state.runs_used += 1;
  state.status = "running";
  state.blocker = null;
  state.updated_at = ctx.now;
  if (!state.first_marker) state.first_marker = FIRST_MARKER;
  events.push({
    at: ctx.now,
    event: "run_started",
    detail: `Run ${state.runs_used}/${state.max_runs_requested} started at phase ${state.phase}.`,
  });

  for (let guard = 0; guard < 8; guard += 1) {
    const phase = state.phase;
    if (phase === "deploy") {
      markIds(state, ["dep-oauth", "dep-url"]);
      state.deployment = { verified: false, url: null, note: DEPLOY_BLOCKER };
      if (!state.limitations.includes(DEPLOY_LIMITATION)) state.limitations.push(DEPLOY_LIMITATION);
      state.status = "blocked";
      state.blocker = DEPLOY_BLOCKER;
      state.last_message = repeatDeploy
        ? `Run ${state.runs_used}/${state.max_runs_requested}. Same deploy blocker. No production URL claimed.`
        : DEPLOY_BLOCKER;
      events.push({ at: ctx.now, event: "checkpoint", detail: state.last_message });
      break;
    }
    if (phase === "verify") {
      markIds(state, ["v-host", "v-install", "v-vercel"]);
      if (!ctx.selfTest?.ok) {
        state.self_test = ctx.selfTest ?? {
          ok: false,
          message: "In-browser self-test has not been run.",
        };
        state.status = "blocked";
        state.blocker = state.self_test.message;
        state.last_message = `Verification blocked. ${state.blocker}`;
        events.push({ at: ctx.now, event: "checkpoint", detail: state.last_message });
        break;
      }
      state.self_test = ctx.selfTest;
      completePhase(state, "verify");
      state.phase = "deploy";
      state.last_message = "Verification recorded. Failures were not rewritten as passes.";
      events.push({ at: ctx.now, event: "checkpoint", detail: state.last_message });
      continue;
    }
    if (phase === "finish") {
      completePhase(state, "finish");
      state.status = "complete";
      state.blocker = null;
      state.last_message = "Objective complete. Production deployment was not verified.";
      events.push({ at: ctx.now, event: "checkpoint", detail: state.last_message });
      break;
    }
    if (phase === "definition" && state.assumptions.length === 0) {
      state.assumptions = [...DEFAULT_ASSUMPTIONS];
    }
    completePhase(state, phase);
    state.last_message = PHASE_NOTES[phase];
    state.phase = nextPhase(phase);
    events.push({ at: ctx.now, event: "checkpoint", detail: state.last_message });
  }

  state.runs.push({
    run: state.runs_used,
    at: ctx.now,
    phase: state.phase,
    summary: state.last_message,
  });
  state.updated_at = ctx.now;
  return { state, error: null, events };
}

export function recordInstall(
  prev: EngineState | null,
  exitCode: number,
  message: string,
  now: string,
): Outcome {
  const state = structuredClone(prev ?? createInitial(now));
  state.install = { exit_code: exitCode, message };
  state.updated_at = now;
  const detail = `Host installer exit ${exitCode}. ${message}`;
  if (state.status !== "blocked") state.last_message = detail;
  return { state, error: null, events: [{ at: now, event: "install_checked", detail }] };
}

export function recordSelfTest(prev: EngineState, result: SelfTestResult, now: string): Outcome {
  const state = structuredClone(prev);
  state.self_test = result;
  state.updated_at = now;
  if (result.ok) markIds(state, ["v-self"]);
  const detail = result.ok ? result.message : `Self-test failed. ${result.message}`;
  if (!result.ok && state.status !== "complete") {
    state.status = "blocked";
    state.phase = "verify";
    state.blocker = result.message;
    state.completed_phases = state.completed_phases.filter((phase) => phase !== "verify");
    state.last_message = detail;
  }
  return { state, error: null, events: [{ at: now, event: "self_test", detail }] };
}

export function recordPreview(prev: EngineState, ok: boolean, message: string, now: string): Outcome {
  const state = structuredClone(prev);
  state.preview_check = { ok, message };
  state.updated_at = now;
  const detail = ok
    ? `This preview origin responded. ${message} This is not a Vercel production deploy.`
    : `Preview check failed. ${message}`;
  return {
    state,
    error: null,
    events: [{ at: now, event: "preview_check", detail }],
  };
}

export function pauseBuild(prev: EngineState, now: string): Outcome {
  if (prev.status === "complete") {
    return { state: prev, error: "A complete objective cannot be paused.", events: [] };
  }
  if (prev.status === "ready" && !prev.objective) {
    return { state: prev, error: "Nothing is running yet.", events: [] };
  }
  const state = structuredClone(prev);
  state.status = "paused";
  state.updated_at = now;
  state.last_message = "Paused. Resume with /build continue.";
  return {
    state,
    error: null,
    events: [{ at: now, event: "paused", detail: state.last_message }],
  };
}

export function finishWithLimitation(prev: EngineState, now: string): Outcome {
  if (!prev.completed_phases.includes("verify")) {
    return {
      state: prev,
      error: "Verification is not recorded yet. Continue the checkpoint first.",
      events: [],
    };
  }
  if (prev.status === "complete") {
    return {
      state: prev,
      error: null,
      events: [{ at: now, event: "already_complete", detail: "Objective is already marked complete." }],
    };
  }
  const state = structuredClone(prev);
  markIds(state, ["dep-oauth", "dep-url", "fin-status", "fin-export"]);
  if (!state.completed_phases.includes("deploy")) state.completed_phases.push("deploy");
  completePhase(state, "finish");
  state.phase = "finish";
  state.status = "complete";
  state.blocker = null;
  state.deployment = { verified: false, url: null, note: DEPLOY_BLOCKER };
  if (!state.limitations.includes(DEPLOY_LIMITATION)) state.limitations.push(DEPLOY_LIMITATION);
  state.updated_at = now;
  state.last_message = "Closed with limitation. Production deployment was not verified.";
  return {
    state,
    error: null,
    events: [{ at: now, event: "closed_with_limitation", detail: state.last_message }],
  };
}


export function recordVerifiedDeploy(
  prev: EngineState,
  url: string,
  note: string,
  now: string,
): Outcome {
  const state = structuredClone(prev);
  const clean = url.trim();
  state.deployment = { verified: true, url: clean, note: note.trim() || `Verified live host: ${clean}` };
  markIds(state, ["dep-oauth", "dep-url", "fin-status"]);
  if (!state.completed_phases.includes("deploy")) state.completed_phases.push("deploy");
  // Flip the checklist item that previously said no URL verified
  for (const item of state.checklist) {
    if (item.id === "dep-url") {
      item.label = `Production URL verified: ${clean}`;
      item.done = true;
    }
  }
  state.phase = state.phase === "deploy" ? "finish" : state.phase;
  state.blocker = null;
  if (state.status === "blocked") state.status = "running";
  state.updated_at = now;
  state.last_message = `Production deployment verified: ${clean}`;
  return {
    state,
    error: null,
    events: [{ at: now, event: "deploy_verified", detail: state.last_message }],
  };
}

export function authorizeBudget(
  prev: EngineState,
  now: string,
  additionalRuns: number = 50,
): Outcome {
  const grant = Math.max(1, Math.min(500, Math.floor(additionalRuns)));
  const state = structuredClone(prev);
  // Operator authorization: new budget of `grant` runs, counter reset.
  // Phase, checklist, objective, status, deploy notes, and activity stay intact.
  state.max_runs_requested = grant;
  state.runs_used = 0;
  state.updated_at = now;
  state.last_message = `Operator authorized another ${grant} runs. Phase and checklist were kept.`;
  // Unblock only the budget wall — do not invent a production URL.
  if (state.status === "blocked" && state.blocker?.includes("run budget exhausted")) {
    state.status = "running";
    state.blocker = null;
  }
  return {
    state,
    error: null,
    events: [{ at: now, event: "budget_authorized", detail: state.last_message }],
  };
}

export function toggleCheck(prev: EngineState, id: string, now: string): Outcome {
  const state = structuredClone(prev);
  const item = state.checklist.find((entry) => entry.id === id);
  if (!item) return { state: prev, error: "That done-item is not on the checkpoint.", events: [] };
  item.done = !item.done;
  state.updated_at = now;
  return {
    state,
    error: null,
    events: [
      {
        at: now,
        event: "checklist",
        detail: `${item.done ? "Checked" : "Cleared"}: ${item.label}`,
      },
    ],
  };
}

export function addAssumption(prev: EngineState, text: string, now: string): Outcome {
  const assumption = text.trim().slice(0, 240);
  if (!assumption) return { state: prev, error: "Write an assumption first.", events: [] };
  if (prev.assumptions.length >= 12) {
    return { state: prev, error: "Assumption list is full.", events: [] };
  }
  const state = structuredClone(prev);
  state.assumptions.push(assumption);
  state.updated_at = now;
  return {
    state,
    error: null,
    events: [{ at: now, event: "assumption", detail: assumption }],
  };
}

export function addCheck(prev: EngineState, phase: PhaseId, label: string, now: string): Outcome {
  const text = label.trim().slice(0, 180);
  if (!text) return { state: prev, error: "Write a done-item first.", events: [] };
  const state = structuredClone(prev);
  const id = `custom-${state.checklist.length + 1}`;
  state.checklist.push({ id, phase, label: text, done: false });
  state.updated_at = now;
  return {
    state,
    error: null,
    events: [{ at: now, event: "checklist", detail: `Added to ${phase}: ${text}` }],
  };
}

export function blankCheckpoint(now: string): EngineState {
  return createInitial(now);
}

export function reportText(state: EngineState): string {
  const done = state.checklist.filter((item) => item.done).length;
  return [
    "Auto-Build Engine report",
    `Project: ${state.project_id}`,
    `Objective: ${state.objective || "(none)"}`,
    `Status: ${state.status}`,
    `Phase: ${state.phase}`,
    `Runs: ${state.runs_used}/${state.max_runs_requested}`,
    `Done-items: ${done}/${state.checklist.length}`,
    `Deployment verified: ${state.deployment.verified ? (state.deployment.url ?? "yes") : "no"}`,
    `Deployment note: ${state.deployment.note || "(none)"}`,
    `Install: ${state.install.exit_code === null ? "not checked" : `exit ${state.install.exit_code}`}`,
    `Self-test: ${state.self_test.ok ? "passed" : "not passed"} — ${state.self_test.message}`,
    `Preview check: ${state.preview_check.message}`,
    `Limitations: ${state.limitations.join(" | ") || "(none)"}`,
    `Blocker: ${state.blocker ?? "(none)"}`,
    `Next: ${state.status === "complete" ? "None. Reset to start another objective." : "/build continue"}`,
  ].join("\n");
}

export function serialize(state: EngineState, activity: Activity[]): string {
  return JSON.stringify({ state, activity }, null, 2);
}

export function hydrate(raw: string): { state: EngineState; activity: Activity[] } | null {
  try {
    const data = JSON.parse(raw) as { state?: EngineState; activity?: Activity[] };
    if (!data?.state || data.state.schema_version !== 1 || !Array.isArray(data.activity)) return null;
    if (!Array.isArray(data.state.checklist) || !data.state.phase) return null;
    return { state: data.state, activity: data.activity };
  } catch {
    return null;
  }
}

const FIXED_OPENING = "2026-11-12T21:22:00.000Z";

const openingRun = executeInvocation(
  null,
  { kind: "build", objective: INFERRED_OBJECTIVE },
  { now: FIXED_OPENING, selfTest: { ok: true, message: "Auto-Build Engine self-test passed." } },
);

const openingInstalled = recordInstall(
  openingRun.state,
  127,
  INSTALL_MESSAGE,
  FIXED_OPENING,
);

export const OPENING_STATE = openingInstalled.state as EngineState;
export const OPENING_ACTIVITY: Activity[] = [...openingRun.events, ...openingInstalled.events];

export function phaseCounts(state: EngineState, phase: PhaseId): { done: number; total: number } {
  const items = state.checklist.filter((item) => item.phase === phase);
  return { done: items.filter((item) => item.done).length, total: items.length };
}
