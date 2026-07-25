# Decision Log — YouTube Resume

Append-only. Never delete a row; change its Status instead. IDs are sequential and never reused.

**Status:** `OPEN` (unresolved) · `APPROVED` (decided, not yet built) · `DONE` (built and confirmed) ·
`REJECTED` (decided against) · `SUPERSEDED` (replaced by a later ID — name it in Notes)

**Owner:** who resolves it. `Human` means it waits for the owner. `Claude` means Claude Code closes it
autonomously and logs the outcome.

**Read this file at the start of every phase.** Any row whose **Implement In** matches the current
phase is in scope for that phase, whether or not the phase prompt mentions it. Say so up front.

**Add rows without being asked.** Every Tier 2 and Tier 3 decision gets one, at the end of the phase
that made it. A decision that exists only in a chat report is lost when the session ends.

---

## Product & scope

| ID | Decision | Status | Owner | Implement In | Notes |
|----|----------|--------|-------|--------------|-------|
| D-001 | Release is **v2.0.0**, not v5.0.0 | APPROVED | Human | All | v1.0.0 is the live Web Store version. |
| D-002 | Settings page promoted into scope, reversing v1.0 non-goal NG4 | APPROVED | Human | Phase 6 | Deliberate promotion. NG4 removed from PRD §3.2. |
| D-003 | Saved videos panel promoted from PRD §13 roadmap into v2.0 scope | APPROVED | Human | Phase 8 | Was "Resume history page", Medium priority. |
| D-004 | Thumbnails permitted from `i.ytimg.com`, breaking the absolute zero-network claim | APPROVED | Human | Phase 8 | A list of opaque video IDs isn't usable. Requires D-020 before publishing. |
| D-005 | Thumbnails have an off switch, default on, restoring fully-offline operation | APPROVED | Human | Phase 6 | Mitigates D-004. When off, `src` must not be set at all. |
| D-006 | No new permissions: `<img>` for thumbnails, `<a target="_blank">` for opening videos | APPROVED | Human | Phase 8 | Avoids the `tabs` permission entirely. |
| D-007 | Six settings only; the 400ms delay, 5s interval and 200-entry cap stay hard-coded | APPROVED | Human | Phase 6 | Exposing the 400ms delay invites users to break their own resume. |
| D-008 | Settings render as a second view **inside the popup** — not an options page, not a new tab | APPROVED | Human | Phase 6 | Owner explicitly rejected the new-tab pattern. |
| D-009 | Settings use segmented buttons and toggles, never free numeric input | APPROVED | Human | Phase 6 | Eliminates validation and invalid states on a 360px surface. |
| D-010 | Popup widens 280px → 360px; UX Spec §6.2 "must not feel like an app" formally relaxed | APPROVED | Human | Phase 8 | A thumbnail list is unusable at 280px. |
| D-011 | Status row (`✓ Active on YouTube`, CP-12/CP-13) removed | APPROVED | Human | Phase 8 | A populated list is self-evident proof; empty state covers the zero-data case. |

## Storage & data

| ID | Decision | Status | Owner | Implement In | Notes |
|----|----------|--------|-------|--------------|-------|
| D-012 | Schema advances to v2, adding optional `title` | APPROVED | Human | Phase 4 | Purely additive, so migration is non-destructive by construction. |
| D-013 | Schema version lives in root key `youtubeResumeSchema`, never inside `youtubeResume` | APPROVED | Human | Phase 4 | `youtubeResume` keys are counted for eviction; a stray key corrupts it. |
| D-014 | Settings live in root key `youtubeResumeSettings` | APPROVED | Human | Phase 4 | Clearing progress must not reset settings, and eviction must never eat one. |
| D-015 | Title scraped from `document.title` with the ` - YouTube` suffix stripped, DOM selector as fallback | APPROVED | Claude | Phase 4 | `document.title` is far more stable across YouTube redesigns than metadata selectors. |
| D-016 | Stored titles capped at 200 characters | APPROVED | Claude | Phase 4 | Tier 2 value pick. |

## Reliability (Phases 1–3)

| ID | Decision | Status | Owner | Implement In | Notes |
|----|----------|--------|-------|--------------|-------|
| D-017 | Confirm which of hypotheses H1–H8 actually cause unreliable resume before fixing anything | DONE | Claude | Phase 1 | `docs/PHASE1_FINDINGS.md`. H2/H4/H6/H8 confirmed; H5 not reproduced (TDD doc issue only); H1 confirmed via a different trigger than described (see D-036); H3/H7 confirmed by code but not reproducible live this session; H1's ad case and H3's throttled case untested (S4, see Notes). |
| D-018 | If Phase 1 finds failure modes outside H1–H8, Phase 2 scope expands to cover them | DONE | Claude | Phase 2 | Expanded per D-036/D-037/D-038 below; all three built this phase. |
| D-036 | Phase 2 must fix navigationManager/bootstrap teardown gap: leaving a watch page for a non-watch page never emits, so progressTracker/uiInjector/playerObserver teardown never runs | DONE | Claude | Phase 2 | Phase 1 Finding A. `checkAndEmit()` now emits on any change including transitions to/from `null`, not just truthy new ids — this single change also fixes H8 (same-video re-entry, D-023 row below/task 2.5), since leaving resets `currentVideoId` to `null`. |
| D-037 | Phase 2's ad/guard redesign (D-019/D-021) must also account for YouTube's own native resume moving `currentTime` before the 400ms delay elapses, independent of ads | DONE | Claude | Phase 2 | Phase 1 Finding B. New guard compares against a pre-delay baseline with 10s drift tolerance rather than an absolute `currentTime > 5`, so a native resume landing near the saved position no longer trips it. |
| D-038 | `waitForMetadata`'s 5s timeout is reachable under ordinary (non-throttled) network conditions and silently skips resume; Phase 2 should reassess the timeout or add a retry | DONE | Claude | Phase 2 | Phase 1 Finding C. Implemented as one retry (second 5s wait) before giving up, ~10s total — Tier 2 value pick. |
| D-019 | Resume is ad-gated: defer until `.ad-showing` and `.ad-interrupting` both clear | DONE | Human | Phase 2 | PRD §5.7 required this in v1.0; the v1.0 TDD omitted it, so it was never built. Implemented as a bounded loop: an ad reappearing mid-delay re-defers and re-baselines rather than aborting outright (see D-040). |
| D-020 | Ad wait has a 60-second hard ceiling, then abandons cleanly | DONE | Claude | Phase 2 | Tier 2 value pick. Prevents an unbounded wait; polled every 250ms via recursive `setTimeout` (not `setInterval`, to respect the one-interval constraint). |
| D-021 | Replace the `currentTime > 5` abort guard with a pre-delay comparison, 10s drift tolerance | DONE | Claude | Phase 2 | The old guard read *ad* position, silently cancelling resume on any ad over 5s. |
| D-022 | Seek is verified: re-read after 250ms, re-assign if off by >3s, max 3 attempts | DONE | Claude | Phase 2 | Tier 2 value picks. Never an unbounded retry loop. UI (restart button/toast) still shown even if verification never converges — best-effort seek already occurred. |
| D-023 | `waitForVideo()` waits for `#movie_player` instead of rejecting when it's absent | DONE | Human | Phase 2 | v1.0 guaranteed a missed resume on slow cold loads. Observes `document.body` (covers container-missing and video-missing in one observer). |
| D-040 | Ad reappearing during the 400ms resume delay re-defers to the ad wait and re-baselines the drift guard, instead of abandoning the resume outright; bounded to 3 rounds | APPROVED (Claude) | Claude | Phase 2 | PRD §5.7 says defer until ads clear, not abandon on the first mid-delay ad — matches mid-roll-heavy long videos better than a single abort. Round cap is a Tier 2 value pick to prevent an unbounded loop. |
| D-041 | Restart button and toast now gated on `seekWithVerification` actually succeeding; a failed verification shows neither and only logs a warning | APPROVED (Claude) | Claude | Phase 2 | T2.1 verification failure: toast claimed "resumed from 19:58" while playback actually continued from 19:40 — first-cut code showed the UI unconditionally after the seek attempt regardless of verification result. PRD §5.6 already required this ("Restart button appears only when a resume seek was successfully applied and verified") — the bug was not implementing that gate, not a missing spec. Root cause of the drift itself is presumed to be YouTube's own native resume cue re-asserting a stale remembered position during the verify window (Finding B); no code change beyond the UI gate was made for that, since D-021/D-022's bounded guard+retry design is already the agreed mitigation and a user affected by it now gets silence instead of a false claim. |
| D-024 | Delta guard applies to the interval trigger only; all event triggers save unconditionally | APPROVED | Human | Phase 3 | Resolves a contradiction inside v1.0 TDD §4.5. |
| D-025 | `beforeunload` retired in favour of `pagehide`; both documented as best-effort | APPROVED | Human | Phase 3 | v1.0 claimed a synchronous storage save, which that API cannot do. |

## UI (Phase 5)

| ID | Decision | Status | Owner | Implement In | Notes |
|----|----------|--------|-------|--------------|-------|
| D-026 | Measure YouTube's live computed styles and record them in `docs/YT_DOM_AUDIT.md` before restyling | **OPEN** | Claude | Phase 5 | Values are measured, never remembered. Blocks D-027 and D-028. |
| D-027 | Reverse the v1.0 "no background or border on the Restart button" anti-pattern | APPROVED | Human | Phase 5 | YouTube moved to rounded-pill controls; the old rule now *causes* the mismatch. |
| D-028 | Fix the toast/progress-bar collision by deriving the offset from measured control-bar height | APPROVED | Human | Phase 5 | Confirmed in the owner's screenshot: the red line runs through the toast. `bottom: 48px` is stale. |
| D-029 | Toast promoted from optional to required, and made user-disableable | APPROVED | Human | Phase 5 | It already ships; specifying it properly is overdue. |

## Docs & release

| ID | Decision | Status | Owner | Implement In | Notes |
|----|----------|--------|-------|--------------|-------|
| D-030 | TDD stays at v1.0.0 and is updated section-by-section per phase, reaching 2.0.0 in Phase 9 | APPROVED | Human | All phases | Precedence puts TDD above PRD/UX Spec, so a stale TDD is a live risk. Every phase lists its sections. |
| D-031 | Dev Checklist §6.2 arithmetic error resolved: `shouldResume(100, 200)` is `true`, resumes to 98 | APPROVED | Human | Phase 9 | 100 < 190. The v1.0 test case was simply wrong and self-noted as such. |
| D-032 | Privacy policy must disclose the `i.ytimg.com` thumbnail request | **OPEN** | **Human** | Pre-release | S3 — published under the owner's name. Decide when v2.0.0 is otherwise ready, not now. |
| D-033 | Store listing must stop claiming zero network requests | **OPEN** | **Human** | Pre-release | S3. Depends on D-032. |
| D-034 | Whether to ship v2.0.0 as one release or split reliability (1–3) into a v1.1 patch first | OPEN | Human | Pre-release | Reliability alone would help live users sooner. Worth revisiting after Phase 3. |

## Guardrails

| ID | Decision | Status | Owner | Implement In | Notes |
|----|----------|--------|-------|--------------|-------|
| D-035 | `.claude/settings.json` deny list widened beyond `install` subcommands to all of `npm`/`npx`/`yarn`/`pnpm` (Bash and PowerShell), plus writes to `package.json`/lockfiles | APPROVED (Claude) | Claude | Guardrails | Zero-dependency, no-build-step project (CLAUDE.md) — blocking only `install` still permits `npm run`/`npx <tool>` or a hand-authored `package.json` to introduce a build step by the back door. |
| D-039 | `Edit(manifest.json)` / `Write(manifest.json)` deny rule removed from `.claude/settings.json` | APPROVED (Human) | Human | Phase 1 | Owner explicitly overruled the guardrail mid-Phase-1 to let Claude wire `utils/debugLogger.js` into the content-script load order. The rule blocked all manifest edits unconditionally (not just `permissions`/`host_permissions`, which is what S1 actually protects); removing it doesn't relax S1 itself — permission/host_permission changes still require a STOP. |

---

## Currently blocking

Only two rows need the owner, and neither is needed now:

- **D-032 / D-033** — privacy policy and store listing wording. Due at Phase 9, not before.
- **D-034** — optional. Worth a decision after Phase 3, when reliability is proven and shippable.

Everything else is either approved or Claude Code's to close autonomously.
