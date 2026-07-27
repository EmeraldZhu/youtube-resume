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
| D-003 | Saved videos panel promoted from PRD §13 roadmap into v2.0 scope | DONE | Human | Phase 8 | Was "Resume history page", Medium priority. |
| D-004 | Thumbnails permitted from `i.ytimg.com`, breaking the absolute zero-network claim | DONE | Human | Phase 8 | A list of opaque video IDs isn't usable. Requires D-020 before publishing. |
| D-005 | Thumbnails have an off switch, default on, restoring fully-offline operation | APPROVED | Human | Phase 6 | Mitigates D-004. When off, `src` must not be set at all. |
| D-006 | No new permissions: `<img>` for thumbnails, `<a target="_blank">` for opening videos | DONE | Human | Phase 8 | Avoids the `tabs` permission entirely. |
| D-007 | Six settings only; the 400ms delay, 5s interval and 200-entry cap stay hard-coded | APPROVED | Human | Phase 6 | Exposing the 400ms delay invites users to break their own resume. |
| D-008 | Settings render as a second view **inside the popup** — not an options page, not a new tab | APPROVED | Human | Phase 6 | Owner explicitly rejected the new-tab pattern. |
| D-009 | Settings use segmented buttons and toggles, never free numeric input | APPROVED | Human | Phase 6 | Eliminates validation and invalid states on a 360px surface. |
| D-010 | Popup widens 280px → 360px; UX Spec §6.2 "must not feel like an app" formally relaxed | DONE | Human | Phase 8 | A thumbnail list is unusable at 280px. |
| D-011 | Status row (`✓ Active on YouTube`, CP-12/CP-13) removed | DONE | Human | Phase 8 | A populated list is self-evident proof; empty state covers the zero-data case. |

## Storage & data

| ID | Decision | Status | Owner | Implement In | Notes |
|----|----------|--------|-------|--------------|-------|
| D-012 | Schema advances to v2, adding optional `title` | DONE | Human | Phase 4 | Purely additive, so migration is non-destructive by construction. |
| D-013 | Schema version lives in root key `youtubeResumeSchema`, never inside `youtubeResume` | DONE | Human | Phase 4 | `youtubeResume` keys are counted for eviction; a stray key corrupts it. |
| D-014 | Settings live in root key `youtubeResumeSettings` | DONE | Human | Phase 4 | Clearing progress must not reset settings, and eviction must never eat one. |
| D-015 | Title scraped from `document.title` with the ` - YouTube` suffix stripped, DOM selector as fallback | DONE | Claude | Phase 4 | `document.title` is far more stable across YouTube redesigns than metadata selectors. |
| D-016 | Stored titles capped at 200 characters | DONE | Claude | Phase 4 | Tier 2 value pick. |
| D-044 | `popup.js` stopped calling `chrome.storage.local` directly (pre-existing v1.0 violation of the "storageManager is the sole owner" constraint); popup now loads `storage/storageManager.js` and uses new `getAllProgress()`/`clearAllProgress()` methods | DONE | Claude | Phase 4 | Found while doing T4.9 (grep for `chrome.storage`). CLAUDE.md hard constraint — route around, don't ask. `clearAllProgress()` removes only `youtubeResume`, leaving settings/schema untouched (PRD §7.4). |
| D-045 | `saveProgress`'s new optional `title` param preserves an existing stored title when omitted/falsy, instead of erasing it | DONE | Claude | Phase 4 | Roadmap 4.5 says a missing title capture "must never block the save" but doesn't say whether it should clear a previously-good title; erasing on a transient capture failure (e.g. `document.title` momentarily blank during a redesign/SPA transition) would be a silent regression for panel display (Phase 8). Tier 2 value pick. |

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
| D-040 | Ad reappearing during the 400ms resume delay re-defers to the ad wait and re-baselines the drift guard, instead of abandoning the resume outright; bounded to 3 rounds | DONE | Claude | Phase 2 | PRD §5.7 says defer until ads clear, not abandon on the first mid-delay ad — matches mid-roll-heavy long videos better than a single abort. Round cap is a Tier 2 value pick to prevent an unbounded loop. |
| D-041 | Restart button and toast now gated on `seekWithVerification` actually succeeding; a failed verification shows neither and only logs a warning | DONE | Claude | Phase 2 | T2.1 verification failure: toast claimed "resumed from 19:58" while playback actually continued from 19:40 — first-cut code showed the UI unconditionally after the seek attempt regardless of verification result. PRD §5.6 already required this ("Restart button appears only when a resume seek was successfully applied and verified") — the bug was not implementing that gate, not a missing spec. Root cause of the drift itself is presumed to be YouTube's own native resume cue re-asserting a stale remembered position during the verify window (Finding B); no code change beyond the UI gate was made for that, since D-021/D-022's bounded guard+retry design is already the agreed mitigation. Owner re-ran T2.1 (3 cold loads, including incognito) after the fix: all 3 resumed within ±3s. |
| D-024 | Delta guard applies to the interval trigger only; all event triggers save unconditionally | DONE | Human | Phase 3 | Resolves a contradiction inside v1.0 TDD §4.5. `attemptSave(bypassDelta, trigger)` takes an explicit flag; only the interval call passes `false`. |
| D-025 | `beforeunload` retired in favour of `pagehide`; both documented as best-effort | DONE | Human | Phase 3 | v1.0 claimed a synchronous storage save, which that API cannot do. TDD §4.5/§7.2 updated to state best-effort explicitly. |
| D-042 | `ended` handler added; invalid-position guard (`NaN`/negative/`>duration`) added to `attemptSave` | DONE | Claude | Phase 3 | Roadmap 3.2/3.5. Closes Phase 1 Finding H6 (no `ended` handler). Both are Tier 2 — filled a task-list detail (guard specifics weren't spelled out) rather than a new decision axis. |
| D-043 | `attemptSave`'s invalid-position guard also rejects `NaN` `duration` (not just `NaN`/negative/`>duration` `current`); `tryResume` gains a duration-independent `meetsMinimumWatched()` short-circuit before the metadata wait | DONE | Claude | Phase 3 | Found via owner's live extension-errors report: `current > duration` is always `false` in JS when `duration` is `NaN`, so the D-042 guard didn't actually block a `NaN`-duration save (pre-metadata write); separately, `tryResume` was paying for the full ~10s metadata wait (D-038) even when `saved.time` could never clear the 30s minimum regardless of duration, observed live on a 19s video. |

## UI (Phase 5)

| ID | Decision | Status | Owner | Implement In | Notes |
|----|----------|--------|-------|--------------|-------|
| D-026 | Measure YouTube's live computed styles and record them in `docs/YT_DOM_AUDIT.md` before restyling | DONE | Claude | Phase 5 | Values are measured, never remembered. Blocks D-027 and D-028. |
| D-027 | Reverse the v1.0 "no background or border on the Restart button" anti-pattern | DONE | Human | Phase 5 | YouTube moved to rounded-pill controls; the old rule now *causes* the mismatch. |
| D-028 | Fix the toast/progress-bar collision by deriving the offset from measured control-bar height | DONE | Human | Phase 5 | Confirmed in the owner's screenshot: the red line runs through the toast. `bottom: 48px` is stale. |
| D-029 | Toast promoted from optional to required, and made user-disableable | DONE | Human | Phase 5 | It already ships; specifying it properly is overdue. Disable switch itself is `showToast`, wired in Phase 7 — this phase only fixes its visuals and confirms it's unconditional pending that setting. |
| D-046 | Measurement (`docs/YT_DOM_AUDIT.md`) found no native inline text-pill button in the control bar — icon buttons are flat with opacity-only hover. Restart button pill fill/radius instead derived from the measured `.ytp-menuitem` hover intensity (`rgba(255,255,255,0.1)` rest / `0.2` hover) and the 40px control-row height (`20px` radius); toast background/radius taken directly from the measured `.ytp-settings-menu` panel (`rgba(0,0,0,0.6)`, `12px`) | DONE | Claude | Phase 5 | Tier 2 value pick, filling the gap between D-027's approved reversal and what measurement actually showed. Toast's `bottom` offset is computed at runtime from `.ytp-chrome-bottom`'s measured height (`59px`, identical in default/theater) + 12px clearance, not hard-coded, per D-028. |
| D-047 | Restart button gains `alignSelf: 'center'` | DONE | Claude | Phase 5 | Owner's T5.1 verification found the button sitting flush against the progress bar instead of centered like native controls. Root cause: `.ytp-left-controls` is `display: flex; align-items: normal` (stretch); a fixed-height child (our 40px button) without `align-self: center` collapses to flex-start instead of centering like the native 40px icon buttons, which are centered by the same mechanism. Verified via measured `getBoundingClientRect()`: button's top/bottom now match `.ytp-play-button`'s exactly. |
| D-048 | `storageManager.js` gains an `assertStorageAvailable()` guard at the top of every public function, throwing a descriptive error when `chrome.storage.local` is unavailable | DONE | Claude | Phase 5 | Owner's T5-verification first-load report: `Cannot read properties of undefined (reading 'local')` on the very first resume attempt. Root cause is almost certainly a dev-only artifact — a content-script instance left running in an already-open tab from before the extension was last reloaded via Load Unpacked, whose `chrome.storage` binding is invalidated (a real store install never hits this, since new tabs/reloads always get the current content script). Behavior is unchanged (resume already failed safely, caught by the existing `.catch()`); this only makes the console warning diagnosable instead of a bare `TypeError`. |

## Docs & release

| ID | Decision | Status | Owner | Implement In | Notes |
|----|----------|--------|-------|--------------|-------|
| D-030 | TDD stays at v1.0.0 and is updated section-by-section per phase, reaching 2.0.0 in Phase 9 | APPROVED | Human | All phases | Precedence puts TDD above PRD/UX Spec, so a stale TDD is a live risk. Every phase lists its sections. |
| D-031 | Dev Checklist §6.2 arithmetic error resolved: `shouldResume(100, 200)` is `true`, resumes to 98 | APPROVED | Human | Phase 9 | 100 < 190. The v1.0 test case was simply wrong and self-noted as such. |
| D-032 | Privacy policy must disclose the `i.ytimg.com` thumbnail request | **OPEN** | **Human** | Pre-release | S3 — published under the owner's name. Decide when v2.0.0 is otherwise ready, not now. |
| D-033 | Store listing must stop claiming zero network requests | **OPEN** | **Human** | Pre-release | S3. Depends on D-032. |
| D-034 | Whether to ship v2.0.0 as one release or split reliability (1–3) into a v1.1 patch first | OPEN | Human | Pre-release | Reliability alone would help live users sooner. Worth revisiting after Phase 3. |

## Runtime wiring (Phase 7)

| ID | Decision | Status | Owner | Implement In | Notes |
|----|----------|--------|-------|--------------|-------|
| D-049 | `storageManager` gains a synchronous `getDefaultSettings()` (no storage access); `bootstrap.js` calls it only when `getSettings()` itself rejects, wrapping the call in try/catch | DONE | Claude | Phase 7 | Roadmap 7.7 requires a settings failure to never block resume. `getSettings()` already self-heals a corrupt *value* (merges over defaults), but a rejected promise (e.g. `chrome.storage` unavailable) needed a fallback that doesn't itself touch storage — duplicating the defaults object outside `storageManager` would drift, so it's exposed instead. Tier 2 value pick. |
| D-050 | `progressTracker`'s `minWatchSeconds` gate reuses `timeUtils.meetsMinimumWatched(current, minWatchSeconds)` against the live playback position, mirroring `resumeManager`'s use of the same function against `saved.time` | DONE | Claude | Phase 7 | Roadmap 7.5 specifies the outcome ("no storage entry below this threshold") but not the mechanism. Reusing the existing position-based predicate avoids a second threshold concept; applies to every save trigger (interval and event), not just the interval, since none of them should persist an entry below the floor. Tier 2 value pick. |

## Saved videos panel (Phase 8)

| ID | Decision | Status | Owner | Implement In | Notes |
|----|----------|--------|-------|--------------|-------|
| D-053 | `.list-region` gets a static `max-height: 508px` (560px popup max minus the measured ~52px fixed header) with `overflow-y: auto`, instead of relying on flexbox `flex: 1` to derive the remaining height | DONE | Claude | Phase 8 | Roadmap 8.1 specifies the outcome (560px max, header fixed, list scrolls) but not the mechanism. A `flex:1; min-height:0` child inside a `max-height`-only, `height:auto` flex column does not get clamped — the flex container's own resolved height is computed from content *before* `max-height` is applied as a ceiling, so nothing forces the list to shrink; discovered live via `chrome-devtools-mcp` when a 200-row seed rendered as one long unclamped page instead of a 560px popup. A direct `max-height` on the scrolling element itself sidesteps the flex sizing question entirely and still shrinks-to-content for short lists (empty state, a handful of entries), matching "maximum height" rather than "fixed height". |

## Saved videos panel polish (post-Phase-8, owner-requested)

| ID | Decision | Status | Owner | Implement In | Notes |
|----|----------|--------|-------|--------------|-------|
| D-054 | Video duration and a watched-progress line render directly on the thumbnail (YouTube-style bottom-right badge + bottom-edge fill), built as plain text/CSS elements rather than baked into an image | DONE | Human | Phase 8 polish | Owner asked for a duration overlay and recommended a placement for time-watched; decided to keep the precise `{position}/{duration} · {percent}%` text below the thumbnail (existing CP-34/35) and use the thumbnail overlay only for the at-a-glance YouTube-style badge + progress line, avoiding two redundant progress indicators stacked in one row. Because these are text/CSS, not an `<img>`, they still render when `loadThumbnails` is off — D-005's zero-network guarantee is about image requests, not DOM content, so this doesn't reopen it. |
| D-055 | Thumbnail size increased 120×68 → 144×81 (same 16:9 ratio) | DONE | Human | Phase 8 polish | Owner asked to increase thumbnail size to give the new overlays (D-054) and channel name (D-056) more room. Text column narrows from ~176px to ~172px at the fixed 360px popup width (D-010) — still fits a 2-line title, one channel line, and the meta line without crowding. |
| D-056 | Schema gains an optional `channel` field, captured via new `youtubeUtils.getChannelName()` (DOM selector only — unlike title, there's no `document.title` equivalent for channel name) and persisted through `saveProgress`'s existing preserve-if-omitted pattern (D-016) | DONE | Human | Phase 8 polish | Owner asked for the channel name to display next to the thumbnail, matching YouTube's own sidebar. Selector scoped to `ytd-watch-metadata ytd-channel-name a` / `ytd-video-owner-renderer #channel-name a` (verified live against a real watch page) rather than a bare `#channel-name`, which also matches inside the comments section. Purely additive like `title` in schema v2 (D-012) — no schema version bump needed. Rows with no captured channel (pre-existing entries, or a same-session DOM-selector miss) simply omit the channel line rather than showing a placeholder. |
| D-057 | `youtubeUtils.getTitle()` also strips a leading `(3) `-style unread-notification-count prefix from `document.title`, in addition to the existing trailing `" - YouTube"` suffix | DONE | Human | Phase 8 polish | Owner flagged that YouTube prepends an unread-count badge to the tab title. Regex (`/^\(\d+\)\s*/`) matches digit-only parenthetical prefixes only, so a legitimate title parenthetical like `"(Official Video)"` is left untouched — verified against both cases. |
| D-058 | Icon-only Ko-fi link added to the saved-videos header, centered via a 3-column `header-row` grid (title / icon / count+gear), as an inline SVG rather than the ❤️ emoji already used once in Settings | DONE | Human | Phase 8 polish | Owner asked for a coffee icon linking to ko-fi.com in the header, icon only, no text. UX Spec §9.2 reserves the ❤️ emoji as the *single* intentional emoji exception, used only in Settings — reusing it (or adding a second emoji) here would break that rule, so a hand-drawn inline `<svg>` (no external asset, no network request, no `innerHTML`) was used instead. New aria-label copy **CP-61** `Support on Ko-fi` — icon-only, so the accessible name is the only copy this control has. Verified live: opens `https://ko-fi.com/emeraldzhu` in a new tab. Icon swapped once (owner-supplied markup, a mug-with-steam-lines glyph from a reference extension) and enlarged 16px → 20px after the first pass read as too small in the header. |

## Guardrails

| ID | Decision | Status | Owner | Implement In | Notes |
|----|----------|--------|-------|--------------|-------|
| D-035 | `.claude/settings.json` deny list widened beyond `install` subcommands to all of `npm`/`npx`/`yarn`/`pnpm` (Bash and PowerShell), plus writes to `package.json`/lockfiles | APPROVED (Claude) | Claude | Guardrails | Zero-dependency, no-build-step project (CLAUDE.md) — blocking only `install` still permits `npm run`/`npx <tool>` or a hand-authored `package.json` to introduce a build step by the back door. |
| D-039 | `Edit(manifest.json)` / `Write(manifest.json)` deny rule removed from `.claude/settings.json` | APPROVED (Human) | Human | Phase 1 | Owner explicitly overruled the guardrail mid-Phase-1 to let Claude wire `utils/debugLogger.js` into the content-script load order. The rule blocked all manifest edits unconditionally (not just `permissions`/`host_permissions`, which is what S1 actually protects); removing it doesn't relax S1 itself — permission/host_permission changes still require a STOP. |
| D-051 | `chrome-devtools-mcp` (npm-launched Chrome DevTools Protocol MCP server) added to **user-scope** `~/.claude.json` — not this repo's `.mcp.json` — with `--categoryExtensions=true`, and used for Phase 7's live verification instead of the `claude-in-chrome` extension | DONE | Claude | Guardrails | Owner asked for the checklist to actually be run, not just described. `claude-in-chrome` hit two hard blockers: (1) it refuses to navigate/interact with `chrome-extension://` pages and its screenshots only cover the page viewport, not the toolbar — so the settings popup and `chrome.storage.local` were unreachable; (2) in that tool's Chrome instance, `<video>` never buffered at all (`readyState` stuck at 0, zero `videoplayback` network requests) regardless of which video was loaded — unrelated to the extension. `chrome-devtools-mcp` has no such restriction (raw CDP) and its Chrome instance plays video normally. User-scope, not project-scope, because it's a personal verification tool, not something this zero-dependency repo should carry as project config (keeps D-035's spirit). Requires an actual session restart after editing `~/.claude.json` for the new MCP tools to load — cannot be hot-reloaded mid-session. |
| D-052 | Verification technique for Phase 7 (and future runtime-behavior phases): drive the extension's popup page directly via `chrome-devtools-mcp`'s `install_extension` + a `new_page` to `chrome-extension://<id>/popup/popup.html`, read/write `chrome.storage.local` from *that* page's script context (not the YouTube tab's), and precede any resume/save assertion with a `navigate_page{type:"reload", initScript:...}` that installs a `setInterval`-based sampler recording `{t, currentTime, toast, button}` into `window.__samples` from t=0 of the new document | DONE | Claude | Guardrails | Three real traps this avoids, discovered empirically: (1) content-script **isolated worlds don't share prototypes** with the page's main world — a `HTMLMediaElement.prototype.currentTime` setter monkey-patch from `evaluate_script` never sees the extension's own seeks, so don't bother; (2) each tool-call round-trip in this environment cost tens of real seconds, comfortably longer than the toast's ~2.2s and the Restart button's 7s auto-dismiss windows — sampling via a *separate* follow-up `evaluate_script` call after `wait_for`/`navigate_page` reliably arrives too late and finds both already dismissed; recording via the page's own `setInterval` (started by `initScript`, read back whenever convenient) sidesteps this entirely; (3) letting the video **actually play** between setting up a precondition (`video.currentTime = X; video.pause()`) and reloading is unsafe even with a `play`→`pause()` guard listener — YouTube's autoplay resumed it enough during that latency gap to overwrite the saved position via `pagehide`. Writing the `youtubeResume` precondition **directly to storage** from the popup context (bypassing live playback entirely) instead of trying to pin a real seek is the reliable way to set up "previously watched to Xs" scenarios. |

---

## Currently blocking

Only two rows need the owner, and neither is needed now:

- **D-032 / D-033** — privacy policy and store listing wording. Due at Phase 9, not before.
- **D-034** — optional. Worth a decision after Phase 3, when reliability is proven and shippable.

Everything else is either approved or Claude Code's to close autonomously.
