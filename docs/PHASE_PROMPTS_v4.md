# Phase Prompt Set — v4.0.0

Self-contained kickoff prompts for each of Roadmap v4's ten phases (`docs/ROADMAP_v4.md`), one per
`/clear` per CLAUDE.md's token-discipline rule ("One phase, one context. Prefer `/clear` over
`/compact`"). Each prompt is written to stand alone: paste it as the first message of a fresh session
after clearing. It does not restate the full task list from the roadmap — the roadmap and DECISIONS.md
remain authoritative; each prompt points at the right sections rather than duplicating them, so a doc
correction to the roadmap doesn't leave a stale copy here to also fix.

Read `CLAUDE.md` in full at the start of every session regardless of phase — these prompts assume it,
not repeat it.

---

## Phase 0 — Reproduction & Harness Foundation

```
CONTEXT
Roadmap v4 Phase 0. Audit: docs/EXTENSION_AUDIT_2026-09-07.md (F21, appendix R1-R24).
Governing docs: CLAUDE.md, docs/ROADMAP_v4.md.

TASK
Build a committed regression harness and establish which audit findings still
reproduce against current HEAD.
1. Create tests/ — plain Node, zero dependencies, no build step, runnable via a
   single documented command. Loads real source files against mocked chrome APIs,
   media elements, timers and DOM events. No test framework installs.
2. Implement R1-R24 from the audit appendix as named, individually runnable cases.
3. Run them. Record for each: reproduced / not reproduced / not reachable, with
   the observed result.
4. Write docs/PHASE0_FINDINGS_v4.md: per-finding F01-F21 verdict, the R-cases
   that support it, and anything the audit claimed that you could not confirm.
5. Save the full v4 phase prompt set to docs/PHASE_PROMPTS_v4.md.
6. Exclude tests/ from the store zip (.gitignore stays as-is; update whatever
   packaging step or documented zip procedure exists).

CONSTRAINTS
- ZERO behaviour change. Do not fix anything you find. Do not touch content/,
  storage/, popup/, utils/, or manifest.json.
- No npm install, no package.json dependencies, no test runner package.
- Do not add production debug output. DEBUG stays false.

VERIFICATION
- The harness runs clean from a fresh clone with one command.
- Every one of R1-R24 has a recorded verdict in docs/PHASE0_FINDINGS_v4.md.
- Every finding F01-F21 has a verdict.
- git diff shows no changes to any shipped .js file or manifest.json.

STATE UPDATE
docs/project-state-summary.md: Phase 0 AWAITING VERIFICATION. Log harness design
choices and any finding you could not reproduce in docs/DECISIONS.md.
```

**Status: complete this session** — see `docs/PHASE0_FINDINGS_v4.md` and `docs/ROADMAP_v4.md`'s own
Phase 0 Findings subsection. All 24 R-cases reproduce; harness is `node tests/run.js`.

---

## Phase 1 — Boundary Validation & Safe Repair

```
CONTEXT
Roadmap v4 Phase 1 (docs/ROADMAP_v4.md, "Phase 1 — Boundary Validation & Safe
Repair"). Findings: F11, F12, F13. Read docs/project-state-summary.md and
docs/DECISIONS.md first — any row with Implement In "Phase 1 (v4)" or "All (v4)"
is in scope whether or not this prompt repeats it. Phase 0's harness
(tests/run.js, `node tests/run.js`) already reproduces R15-R20 against current
HEAD (see docs/PHASE0_FINDINGS_v4.md) — treat those as your regression baseline.

TASK
Work through Roadmap v4 Phase 1's task list (1.1-1.10) in docs/ROADMAP_v4.md
verbatim — it is the authoritative task breakdown, not reproduced here. In one
line: resolveVideoId() only canonicalizes proven identities (never truncates/
guesses); unresolved/invalid keys are quarantined, never dropped; merges
preserve pinned and other compatible fields; every stored field is validated at
the boundary with per-field defaults; a settings-read failure never hides valid
saved videos; the 200-unpinned/20-pinned caps hold immediately after every
eligibility-changing operation (pin/unpin/repair/merge), including the
unpin-into-full-library case (D-112's immediate-eviction rule).

CONSTRAINTS
Full CLAUDE.md hard-constraint list applies (permissions/host_permissions
unchanged; storageManager remains the sole read path; every promise chain ends
in .catch(); no innerHTML/eval; DEBUG stays false). This phase specifically must
never delete a real entry (valid or quarantined) — see Roadmap v4 Phase 1's own
"Depends on" note: this phase fixes validation/repair/cap logic; Phase 2 moves it
behind the serialized writer. Don't build Phase 2's writer here.

VERIFICATION
Run every test in Roadmap v4 Phase 1's test table (T1.1-T1.9) yourself via
tests/ (extend the Phase 0 harness with this phase's own cases) before calling
it done. Re-run the full R1-R24 suite: R15, R16, R17, R18, R20 must flip from
"reproduces" to "fixed"; every other case's verdict must be unchanged (no
regression). Confirm no entry (valid or quarantined) is ever permanently deleted
by repair, and the 200/20 caps hold after every single-tab operation tested.

STATE UPDATE
Follow CLAUDE.md's "End of every phase" checklist exactly (run tests yourself,
log every Tier 2/3 decision to docs/DECISIONS.md with Implement In "Phase 1
(v4)", update TDD §4.6 and PRD §7.3/§7.5 per Roadmap v4 Phase 1's "Docs to
Update", commit and push, set docs/project-state-summary.md to Phase 1 AWAITING
VERIFICATION — never DONE yourself).
```

---

## Phase 2 — Serialized Storage Writer

```
CONTEXT
Roadmap v4 Phase 2 (docs/ROADMAP_v4.md, "Phase 2 — Serialized Storage Writer").
Finding: F06. Read docs/project-state-summary.md and docs/DECISIONS.md first —
D-102 (background/storageWriter.js as sole writer), D-103 (per-video keys
rejected), and D-125 (the amended CLAUDE.md storage-access constraint) are all
Implement-In Phase 2 and already APPROVED; build to that architecture, don't
re-derive it. Depends on Phase 1's validation/repair/cap logic landing first.

TASK
Work through Roadmap v4 Phase 2's task list (2.1-2.8) verbatim. In one line:
background/storageWriter.js becomes an MV3 service worker and the sole writer
for every chrome.storage.local mutation (save/delete/pin/unpin/repair/migrate/
settings/clear); storageManager.js keeps its exact current public API
(signatures and Promise contracts unchanged) and becomes a client sending
commands to the worker; reads stay direct (unchanged); every command is
idempotent and fully self-described (no delta/increment commands) so a worker
restart mid-queue loses nothing that wasn't already fully applied or never
sent; Phase 1's validation runs once, at the worker's command boundary.

CONSTRAINTS
manifest.json gains background.service_worker pointing at
background/storageWriter.js and NOTHING else — permissions stays ["storage"],
host_permissions stays ["https://www.youtube.com/*"] (S1: adding permissions to
a build intended for the Web Store is a STOP condition; this phase adds none).
storageManager.js's exported function names/arity must diff byte-identical
against v3.0.0 (T2.7) — no caller (content scripts, popup) should need a code
change. A worker being momentarily unreachable must reject the calling
storageManager promise cleanly, logged, never thrown uncaught (hard constraint:
never break YouTube playback).

VERIFICATION
Run Roadmap v4 Phase 2's test table (T2.1-T2.7) yourself. Re-run the R1-R24
suite: R13, R14, R19 must flip from "reproduces" to "fixed"; nothing else
regresses. Diff manifest.json and storageManager.js's export list against
v3.0.0 as T2.6/T2.7 require.

STATE UPDATE
Same end-of-phase checklist as every phase. Update the TDD's new
background/storageWriter.js module contract section and PRD §6 per this
phase's "Docs to Update". Log decisions with Implement In "Phase 2 (v4)". Set
project-state-summary.md to Phase 2 AWAITING VERIFICATION.
```

---

## Phase 3 — Write Ownership, Freshness & Durable Saves

```
CONTEXT
Roadmap v4 Phase 3 (docs/ROADMAP_v4.md, "Phase 3 — Write Ownership, Freshness &
Durable Saves"). Findings: F07, F10. Ship Gate A is after this phase (D-111) —
Phases 0-3 must remain independently releasable per §3: nothing here may
reference resume-lifecycle concepts from Phase 4+ (no generation token beyond
storage-ownership scope, no completion field, no popup-reconciliation state).
Read docs/DECISIONS.md for every Phase-3-scoped row before starting.

TASK
Work through Roadmap v4 Phase 3's task list (3.1-3.7) verbatim. In one line:
introduce a lightweight per-playback-session identity (storage-ownership scope
only — Phase 4 extends it further, don't build that part here); progressTracker
records last-observed position/last-active timestamp/explicit-seek-flag per
session; the worker's saveProgress rejects a save from a backgrounded/inactive
session that would clobber a more-recently-active session's checkpoint, unless
it carries an explicit user-seek flag; deletion/clear bumps a revision counter
so a stale open tab can't recreate a just-deleted entry from an unchanged
lifecycle event; separate observed/pending/committed positions —
lastSavedTime updates only on the worker's acknowledged success, never
optimistically; a failed write stays pending and retries on the next natural
trigger, with no separate user action required.

CONSTRAINTS
Full hard-constraint list. This phase's session/generation token must be
storage-scoped only (Gate A's exit criteria explicitly checks this — "no
reference to any Phase 4+ concept"). Don't build Phase 4's seek/UI-level
cancellation here, only the storage-write-ownership half.

VERIFICATION
Run Roadmap v4 Phase 3's test table (T3.1-T3.5) yourself. Re-run R1-R24: R23,
R24 must flip from "reproduces" to "fixed". Confirm Gate A as a whole: F06, F07,
F10, F11, F12, F13 are all fixed, and Phases 0-3's own tests pass with zero
reference to any Phase 4+ concept.

STATE UPDATE
End-of-phase checklist. Update TDD §4 (tracker state machine) and PRD §5.7.
Log decisions Implement In "Phase 3 (v4)". Set project-state-summary.md to
Phase 3 AWAITING VERIFICATION and explicitly note Gate A's status (met/not met,
with the F-number checklist) since it's a milestone the owner will want called
out, not just implied by the phase number.
```

---

## Phase 4 — Resume Identity & Cancellation

```
CONTEXT
Roadmap v4 Phase 4 (docs/ROADMAP_v4.md, "Phase 4 — Resume Identity &
Cancellation"). Findings: F03, F04. Gate A (after Phase 3) should already be
met — confirm it in docs/project-state-summary.md before starting; if it isn't,
stop and name what's missing rather than building on top of it. This phase
extends Phase 3's storage-scoped session/generation token to the full
navigation lifecycle (seeks, arming, UI) — extend, don't rebuild it.

TASK
Work through Roadmap v4 Phase 4's task list (4.1-4.6) verbatim. In one line:
every navigation/media lifecycle gets an identity checked after every await and
before every seek/save/arm/UI action; teardown settles any pending promise tied
to the old generation (player discovery, metadata wait, ad wait, seek) instead
of leaving it permanently unresolved, and removes its listeners/timers; player
discovery confirms the current generation's ownership of a video element before
treating it ready; content identity is resolved and ads are deferred through
BEFORE evaluating shouldResume() — eligibility only ever runs against confirmed
post-ad content metadata; metadata is revalidated if the source/ad state
changes mid-verification.

CONSTRAINTS
Full hard-constraint list, including the fixed non-configurable 400ms delay —
this phase adds identity/cancellation/ad-ordering around it, it does not touch
the delay value itself.

VERIFICATION
Run Roadmap v4 Phase 4's test table (T4.1-T4.7) yourself. Re-run R1-R24: R12,
R21, R22 must flip from "reproduces" to "fixed".

STATE UPDATE
End-of-phase checklist. Update TDD §4.3/§4.4 and PRD §5.4. Log decisions
Implement In "Phase 4 (v4)". Set project-state-summary.md to Phase 4 AWAITING
VERIFICATION.
```

---

## Phase 5 — Verified Resume Outcomes

```
CONTEXT
Roadmap v4 Phase 5 (docs/ROADMAP_v4.md, "Phase 5 — Verified Resume Outcomes").
Findings: F01, F05, F08, F20. Also implements D-107 (timestamp precedence,
Roadmap 5.10) — read that decision before starting, it specifies the exact
policy ("Recommended" text from F20, adopted verbatim).

TASK
Work through Roadmap v4 Phase 5's task list (5.1-5.11) verbatim. In one line:
seekWithVerification() establishes readiness/seekability before seeking and
awaits real completion (checking seeking/readyState/position stability), not
one delayed sample; every corrective/override-response seek is verified the
same way, no unverified "final" assignment; replace the fixed-magnitude
forward-jump heuristic with a bounded stabilization window using direction plus
elapsed time/playback rate, closing the gap where small forward jumps and all
backward jumps went ungated; cancel automatic correction once genuine user
intent (keyboard/pointer/accessible controls, not just 'seeked' alone) is
established; reset lastSavedTime on a deliberate backward seek even below
minWatchSeconds; tryResume() returns a typed outcome (status/target/observed/
attemptId) instead of a bare boolean; bootstrap arms based on that typed
outcome, not unconditionally in finally, preserving the last good checkpoint
through a pending/recoverable failure; reconcile the seeked-exemption with
Phase 3's freshness rules; parse a supported t= form and give it defined
precedence per D-107, canceling automatic resume for that navigation.

CONSTRAINTS
Full hard-constraint list. Diagnostics stay routed through the existing
debugLogger, gated behind DEBUG, no user-visible error UI (hard constraint:
failures are silent to the user, logged to console only).

VERIFICATION
Run Roadmap v4 Phase 5's test table (T5.1-T5.13) yourself. Re-run R1-R24: R1,
R2, R3, R4, R7, R8 must flip from "reproduces" to "fixed".

STATE UPDATE
End-of-phase checklist. Update TDD §4.4/§4.5 and PRD §5.4/§5.5/§5.10. Log
decisions Implement In "Phase 5 (v4)". Set project-state-summary.md to Phase 5
AWAITING VERIFICATION.
```

---

## Phase 6 — Deferred Recovery Lifecycle

```
CONTEXT
Roadmap v4 Phase 6 (docs/ROADMAP_v4.md, "Phase 6 — Deferred Recovery
Lifecycle"). Findings: F02, F09. Ship Gate B is after this phase (D-111) —
completes with Phase 2 (F02) and Phases 4-5 (F01, F03-F05, F08, F20) already
landed; confirm those are AWAITING VERIFICATION or DONE before starting.

TASK
Work through Roadmap v4 Phase 6's task list (6.1-6.9) verbatim. In one line:
maintain per-video lifecycle state keyed by Phase 4's generation concept,
re-evaluated on visibility return, pageshow, other page-lifecycle events, and
actual media readiness/replacement — not solely on v-parameter change; a
pending/failed session preserves its checkpoint and stays eligible for a later
readiness event instead of permanent abandonment after one timeout; reuse the
existing single MutationObserver and single setInterval (hard constraint) —
re-target, never duplicate; don't re-seek on every tab switch once a session
has reached normal successful playback; flush a last-valid non-ad settled
sample tied to content identity BEFORE navigation teardown; schedule/coalesce
saves using elapsed wall-clock time and playback activity, not a fixed
interval-callback count; a pending/in-flight seek is never persisted as
completed; document a realistic checkpoint-loss budget for abrupt termination
(PRD deliverable, not a testable code guarantee).

CONSTRAINTS
Full hard-constraint list, especially "exactly one setInterval and one
MutationObserver alive at any time" — this phase is explicitly about the
recovery lifecycle around those, not adding more of them.

VERIFICATION
Run Roadmap v4 Phase 6's test table (T6.1-T6.7) yourself. Re-run R1-R24: R6,
R10, R11 must flip from "reproduces" to "fixed". Confirm Gate B as a whole:
F01, F02, F03, F04, F05, F08, F09, F20 all fixed.

STATE UPDATE
End-of-phase checklist. Update TDD §4.2/§4.3 and PRD §5.4 plus the new
checkpoint-loss-budget note (task 6.8). Log decisions Implement In "Phase 6
(v4)". Set project-state-summary.md to Phase 6 AWAITING VERIFICATION and call
out Gate B's status explicitly.
```

---

## Phase 7 — Completion Policy & Remove Completed

```
CONTEXT
Roadmap v4 Phase 7 (docs/ROADMAP_v4.md, "Phase 7 — Completion Policy & Remove
Completed"). Findings: F14, F15. Implements D-104 (ended field + legacy
inference), D-105 (Remove Completed behavior), D-106 (fourth threshold option),
D-117 (99% display cap), D-118 (include-pinned checkbox resets unchecked),
D-119 (zero-match disables the button), D-120 (CP-79 "Remove" copy), D-121
(load-failure state scope), D-122 (CP-43h reword) — read these before starting,
several of the open value picks are already made.

TASK
Work through Roadmap v4 Phase 7's task list (7.1-7.9) verbatim. In one line:
add additive schema field ended:boolean (real ended event on confirmed
non-ad content only), bumped through the existing version-aware migration
chain; legacy inference for entries with no ended field is
Math.floor(time) >= duration - 1, documented as the strictest defensible
reading; popup display reserves "100%"/completed labeling for the
ended-true-or-legacy-inferred case, capping the displayed percentage at 99
otherwise (D-117); reconcile the minWatchSeconds boundary wording vs. the
strict > comparison (pick one, make wording and logic agree, log Tier 2); add
"Remove completed" (preview exact count, pinned excluded by default with an
opt-in checkbox that resets unchecked every open per D-118, one coordinated
batch mutation through the Phase 2 writer, no undo window); integrate Phase 3's
deletion-revision mechanism so an open completed tab doesn't recreate a removed
row; add the fourth "Only at the end" completionThreshold=1 segmented option,
routing that comparison through the ended-based check instead of percentage
arithmetic; assign new copy CP-68 onward per UX Spec §2 voice rules and add it
to the §7 table.

CONSTRAINTS
Full hard-constraint list. No new setting key for the fourth threshold option
(D-106) — reuse the existing completionThreshold field with sentinel value 1.

VERIFICATION
Run Roadmap v4 Phase 7's test table (T7.1-T7.11) yourself. No R-case maps to
this phase (F14/F15 had no audit-appendix reproduction — see
docs/PHASE0_FINDINGS_v4.md) — build this phase's own new test cases in tests/
covering T7.1-T7.11 instead, since D-108 says every phase extends the
committed harness with cases for what it changes.

STATE UPDATE
End-of-phase checklist. Update PRD §5.8/§5.9/§7, UX Spec §6/§7, TDD §4.6/§4.11.
Log decisions Implement In "Phase 7 (v4)". Set project-state-summary.md to
Phase 7 AWAITING VERIFICATION.
```

---

## Phase 8 — Popup Reconciliation & Accessibility

```
CONTEXT
Roadmap v4 Phase 8 (docs/ROADMAP_v4.md, "Phase 8 — Popup Reconciliation &
Accessibility"). Findings: F16, F17, F18, F19. Ship Gate C is after this
phase (D-111), completing remediation of every audit finding. Implements
D-116 (Remove Completed's placement — header, not Settings), D-123 (focus
handoff targets), D-124 (reduced-motion handling for the toast).

TASK
Work through Roadmap v4 Phase 8's task list (8.1-8.12) verbatim. In one line:
subscribe to storage changes instead of a one-time snapshot, reconciling rows
without losing scroll/focus; disable/coalesce pending per-row actions so rapid
double-clicks can't double-count, deriving counters from acknowledged state
only; sequence Remove-completed and clear-all against individual row actions;
distinguish an externally-caused row removal from a failed local mutation;
apply the thumbnail toggle live (remove/restore image elements/sources
immediately, cancel pending loads where possible), same for reset-to-defaults;
reconcile or document the content-script settings propagation timing; move
focus predictably per D-123; associate setting-group labels with their
segmented controls programmatically; row action labels identify the specific
video, with a dedicated announcement for deletion/count changes; respect
prefers-reduced-motion (D-124); retain and cancel the toast's pending
requestAnimationFrame handle, capturing a toast generation/element identity in
every timer so a stale callback can't affect a newer toast — apply Phase 4's
navigation-cancellation contract to toast lifecycles too.

CONSTRAINTS
Full hard-constraint list. This is the last phase touching popup.js/popup.html
before Phase 9's regression pass — leave nothing half-wired.

VERIFICATION
Run Roadmap v4 Phase 8's test table (T8.1-T8.9) yourself. No R-case maps to
this phase (popup layer, F16-F19 all code-confirmed/untested in the audit) —
extend tests/ with this phase's own cases for T8.1-T8.9 per D-108. Confirm
Gate C as a whole: F14, F15, F16, F17, F18, F19 all fixed, completing
remediation of every audit finding F01-F21.

STATE UPDATE
End-of-phase checklist. Update UX Spec §6/§8, TDD §4.11, PRD §5.9. Log
decisions Implement In "Phase 8 (v4)". Set project-state-summary.md to Phase 8
AWAITING VERIFICATION and call out Gate C's status explicitly — every audit
finding should now be fixed pending only Phase 9's live regression pass.
```

---

## Phase 9 — Regression, Docs & Store Release

```
CONTEXT
Roadmap v4 Phase 9 (docs/ROADMAP_v4.md, "Phase 9 — Regression, Docs & Store
Release"). No new findings — this phase verifies everything Phases 0-8 shipped
and prepares the store submission. Gate C should already be met; confirm in
docs/project-state-summary.md before starting.

TASK
Work through Roadmap v4 Phase 9's task list (9.1-9.11) verbatim. In one line:
confirm permissions/host_permissions unchanged except the one documented
background.service_worker addition; confirm zero network requests beyond the
gated i.ytimg.com thumbnail GET; confirm exactly one setInterval/
MutationObserver alive across every regression scenario; bump manifest.json to
4.0.0; confirm tests/ is excluded from the store zip per the packaging
procedure documented in docs/ROADMAP_v4.md's Phase 0 Findings (0.7) — re-verify
the include-list against the actual shipped tree, since background/ now
genuinely exists (Phase 2); full copy audit against UX Spec §7 including
CP-68+; reconcile PRD/UX Spec/TDD against everything actually shipped; rewrite
project-state-summary.md for v4.0.0; run the full v3.0.0 regression suite to
confirm no already-shipped behavior regressed; run the Phase 0 harness extended
through Phase 8 end to end — every R1-R24 case plus every phase's added cases
must show "fixed," not merely "not re-broken"; execute the live regression
matrix (table in Roadmap v4 Phase 9 and in EXTENSION_AUDIT_2026-09-07.md's
"Required live regression matrix") on a real Chrome profile, recording exact
tested revision/conditions/attempt counts/results/remaining limitations per
F21's own acceptance criterion — do not let a "pass" stand in for an unexecuted
critical scenario, and log any substitution (per the D-060/D-098 v3.0.0
precedent) explicitly rather than silently.

CONSTRAINTS
Full hard-constraint list applies to the final shipped build without exception
— this is the release gate.

VERIFICATION
T9.1-T9.10 all executed and recorded (not skipped or assumed from earlier
phases' own testing). manifest.json reads 4.0.0; permissions/host_permissions
byte-identical to v3.0.0 plus the one documented background field. All docs
consistent with shipped code. The full harness shows R1-R24 (plus every later
phase's own added cases) all "fixed." Findings F01-F21 each confirmed fixed
against the finished v4.0.0 build, not just theoretically addressed per earlier
phases' individual verification.

STATE UPDATE
Full rewrite of docs/project-state-summary.md for v4.0.0 (this is the one phase
where a full rewrite, not an incremental edit, is appropriate — CLAUDE.md's
token-budget guidance for that file resets going into v5 planning). Final
reconciliation pass across PRD/UX Spec/TDD/this roadmap. As with every phase:
self-verify, log Tier 2/3 decisions, commit and push — but do NOT write "DONE"
anywhere; only the owner's confirmation, after their own live regression pass,
moves v4.0.0 to shipped/DONE status.
```
