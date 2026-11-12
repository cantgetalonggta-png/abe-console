import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEPLOY_BLOCKER,
  OPENING_STATE,
  authorizeBudget,
  executeInvocation,
  finishWithLimitation,
  parseCommand,
  recordInstall,
  selfTestSkill,
} from "./engine.ts";

const NOW = "2026-11-12T22:00:00.000Z";
const PASS = { ok: true, message: "Auto-Build Engine self-test passed." };

describe("parseCommand", () => {
  it("accepts the three operator commands", () => {
    assert.deepEqual(parseCommand("/build continue"), { kind: "continue" });
    assert.deepEqual(parseCommand("/build install.sh"), { kind: "install" });
    assert.deepEqual(parseCommand("/build ship the console"), {
      kind: "build",
      objective: "ship the console",
    });
  });

  it("rejects an empty build", () => {
    assert.equal(parseCommand("/build").kind, "error");
    assert.equal(parseCommand("   ").kind, "error");
  });
});

describe("selfTestSkill", () => {
  it("rejects a malformed skill", () => {
    const result = selfTestSkill('{"name":"grok-auto-build-engine","version":"2.2.0"}', "nope");
    assert.equal(result.ok, false);
  });
});

describe("executeInvocation", () => {
  it("opens through verification and blocks on deploy", () => {
    assert.equal(OPENING_STATE.runs_used, 1);
    assert.equal(OPENING_STATE.status, "blocked");
    assert.equal(OPENING_STATE.phase, "deploy");
    assert.equal(OPENING_STATE.deployment.verified, false);
    assert.equal(OPENING_STATE.deployment.url, null);
    assert.ok(OPENING_STATE.completed_phases.includes("verify"));
    assert.equal(OPENING_STATE.completed_phases.includes("deploy"), false);
    assert.equal(OPENING_STATE.install.exit_code, 127);
    assert.equal(OPENING_STATE.blocker, DEPLOY_BLOCKER);
  });

  it("spends a run when the deploy blocker is unchanged", () => {
    const next = executeInvocation(OPENING_STATE, { kind: "continue" }, { now: NOW, selfTest: PASS });
    assert.equal(next.error, null);
    assert.equal(next.state?.runs_used, 2);
    assert.equal(next.state?.status, "blocked");
    assert.match(next.state?.last_message ?? "", /Same deploy blocker/);
  });

  it("stops at the five-run budget without mutating the checkpoint", () => {
    let state = OPENING_STATE;
    for (let i = 0; i < 4; i += 1) {
      const step = executeInvocation(state, { kind: "continue" }, { now: NOW, selfTest: PASS });
      assert.equal(step.error, null);
      state = step.state!;
    }
    assert.equal(state.runs_used, 5);
    const exhausted = executeInvocation(state, { kind: "continue" }, { now: NOW, selfTest: PASS });
    assert.match(exhausted.error ?? "", /budget exhausted/);
    assert.equal(exhausted.state?.runs_used, 5);
    const allowed = authorizeBudget(state, NOW, 50);
    assert.equal(allowed.state?.runs_used, 0);
    assert.equal(allowed.state?.max_runs_requested, 50);
    assert.equal(allowed.state?.phase, "deploy");
  });

  it("does not treat a failed self-test as verified", () => {
    const blank = executeInvocation(
      null,
      { kind: "build", objective: "Check the gate" },
      { now: NOW, selfTest: { ok: false, message: "Build skill frontmatter is missing or malformed." } },
    );
    assert.equal(blank.state?.status, "blocked");
    assert.equal(blank.state?.phase, "verify");
    assert.equal(blank.state?.completed_phases.includes("verify"), false);
  });

  it("closes with a limitation and then ignores extra continues", () => {
    const closed = finishWithLimitation(OPENING_STATE, NOW);
    assert.equal(closed.state?.status, "complete");
    assert.equal(closed.state?.deployment.verified, false);
    assert.equal(closed.state?.runs_used, 1);
    const again = executeInvocation(closed.state, { kind: "continue" }, { now: NOW, selfTest: PASS });
    assert.equal(again.state?.runs_used, 1);
    assert.equal(again.events[0]?.event, "already_complete");
  });

  it("authorizes a 50-run budget while keeping phase and checklist", () => {
    const granted = authorizeBudget(OPENING_STATE, NOW, 50);
    assert.equal(granted.error, null);
    assert.equal(granted.state?.runs_used, 0);
    assert.equal(granted.state?.max_runs_requested, 50);
    assert.equal(granted.state?.phase, OPENING_STATE.phase);
    assert.equal(granted.state?.checklist.length, OPENING_STATE.checklist.length);
    assert.equal(granted.state?.objective, OPENING_STATE.objective);
  });

  it("does not spend a build run on the installer", () => {
    const recorded = recordInstall(OPENING_STATE, 127, "missing", NOW);
    assert.equal(recorded.state?.runs_used, 1);
    assert.equal(recorded.state?.install.exit_code, 127);
    assert.equal(recorded.state?.status, "blocked");
  });
});
