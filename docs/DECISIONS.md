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
| D-017 | Confirm which of hypotheses H1–H8 actually cause unreliable resume before fixing anything | **OPEN** | Claude | Phase 1 | Roadmap §4. Output is `docs/PHASE1_FINDINGS.md`. **Phase 2 cannot be scoped until this closes.** |
| D-018 | If Phase 1 finds failure modes outside H1–H8, Phase 2 scope expands to cover them | OPEN | Claude | Phase 2 | Decide autonomously; log each new fix as its own row. |
| D-019 | Resume is ad-gated: defer until `.ad-showing` and `.ad-interrupting` both clear | APPROVED | Human | Phase 2 | PRD §5.7 required this in v1.0; the v1.0 TDD omitted it, so it was never built. |
| D-020 | Ad wait has a 60-second hard ceiling, then abandons cleanly | APPROVED | Claude | Phase 2 | Tier 2 value pick. Prevents an unbounded wait. |
| D-021 | Replace the `currentTime > 5` abort guard with a pre-delay comparison, 10s drift tolerance | APPROVED | Claude | Phase 2 | The old guard read *ad* position, silently cancelling resume on any ad over 5s. |
| D-022 | Seek is verified: re-read after 250ms, re-assign if off by >3s, max 3 attempts | APPROVED | Claude | Phase 2 | Tier 2 value picks. Never an unbounded retry loop. |
| D-023 | `waitForVideo()` waits for `#movie_player` instead of rejecting when it's absent | APPROVED | Human | Phase 2 | v1.0 guaranteed a missed resume on slow cold loads. |
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

---

## Currently blocking

Only two rows need the owner, and neither is needed now:

- **D-032 / D-033** — privacy policy and store listing wording. Due at Phase 9, not before.
- **D-034** — optional. Worth a decision after Phase 3, when reliability is proven and shippable.

Everything else is either approved or Claude Code's to close autonomously.
