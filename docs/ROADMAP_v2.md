# Roadmap — v2.0.0
## YouTube Resume — Chrome Extension

---

| Field | Detail |
|---|---|
| **Product** | YouTube Resume |
| **Document Type** | Release Roadmap |
| **Target Version** | 2.0.0 |
| **Previous Version** | 1.0.0 (live on Chrome Web Store) |
| **Status** | Approved — Ready for Execution |
| **Last Updated** | 2026-07-26 |
| **Companion Documents** | PRD_YouTube_Resume.md v2.0.0, UX_Spec_YouTube_Resume.md v2.0.0, TDD_YouTube_Resume.md (v1.0.0 — updated per phase) |

---

## 1. Release Summary

v2.0.0 addresses four objectives:

| # | Objective | Phases |
|---|---|---|
| O1 | Make resume consistent and dependable | 1, 2, 3 |
| O2 | Make in-player UI match YouTube's current visual language | 5 |
| O3 | Add user-tunable settings | 6, 7 |
| O4 | Add a saved-videos panel with thumbnails and progress | 4, 8 |

Phases are **strictly sequential**. Each phase ends with binary verification. A phase is not complete until every test passes and its listed doc sections are updated.

---

## 2. Scope Decisions Made for This Release

These are decisions taken at the design layer. They are recorded here so they are not re-litigated mid-build.

| # | Decision | Rationale | Tradeoff |
|---|---|---|---|
| D1 | **Thumbnails are permitted**, loaded from `https://i.ytimg.com/vi/{videoId}/mqdefault.jpg` | A saved-videos list without thumbnails is a list of opaque IDs | The "zero network requests" claim (PRD §9, §10) becomes "zero network requests except optional thumbnail images". Store listing and privacy note must change. Mitigated by D2. |
| D2 | **Thumbnails have an off switch**, default on | Preserves a fully-offline mode for privacy-sensitive users | One extra setting |
| D3 | **No new permissions.** Thumbnails load as plain `<img>`; video links open via `<a target="_blank">` | Keeps `permissions: ["storage"]` and host permissions unchanged | None |
| D4 | **Storage schema moves to v2** (adds optional `title`) | The panel needs titles; titles must be captured at watch time | Requires a migration path. Purely additive, so migration is non-destructive by construction. |
| D5 | **Schema version lives in a separate root key** `youtubeResumeSchema`, not inside `youtubeResume` | `youtubeResume` is a `videoId → entry` map; any non-videoId key inside it would corrupt entry counting and eviction | One extra root key |
| D6 | **Settings live under a separate root key** `youtubeResumeSettings` | "Clear saved progress" must not reset preferences; 200-entry eviction must never be able to delete a setting | One extra root key |
| D7 | **Six settings only.** Minimum watch time, completion threshold, rewind-on-resume, toast on/off, restart button on/off, thumbnails on/off | A settings page with twelve knobs is worse than one with six | Users cannot tune the save interval or entry cap |
| D8 | **The 400ms resume delay stays hard-coded and is not exposed as a setting** | It is safety-critical (player init race). Exposing it invites users to silently break their own resume. | Slightly less "power user" surface |
| D9 | **Settings are an in-popup panel, not a separate options page or tab** | Owner preference; keeps everything in one surface; avoids a jarring tab switch for six controls | Popup must manage two views |
| D10 | **Settings controls are segmented buttons and toggles, not free numeric input** | No validation errors, no invalid states, no keyboard entry on a 360px surface | Users pick from preset values rather than arbitrary ones |
| D11 | **Video title is scraped from `document.title`**, with a DOM selector as fallback | `document.title` is far more stable than YouTube's metadata selectors, which change frequently | Title includes YouTube's suffix, which must be stripped |
| D12 | **The Status row (`✓ Active on YouTube`) is removed from the popup** | A populated video list is self-evident proof the extension is working. The row was a v1.0 substitute for having nothing else to show. | Users with an empty list get no explicit "it's running" signal — handled by empty-state copy instead |
| D13 | **Popup widens from 280px to 360px** | A thumbnail list at 280px is unusable | UX Spec §6.2's "must not feel like an app" constraint is formally relaxed |

---

## 3. Scope Reversals

Two items in this release contradict v1.0 non-goals. These are deliberate promotions, approved at the product level, not scope creep.

| Item | Contradicts | Resolution |
|---|---|---|
| Settings panel | PRD §3.2 NG4 ("A settings or configuration page"), UX Spec §9.1 ("No settings page in v1.0") | NG4 removed from PRD. UX Spec §9.1 constraint rewritten to scope it to in-player UI only. |
| Saved videos panel | PRD §13 roadmap item "Resume history page" (Medium priority) | Promoted into v2.0 scope. Removed from the roadmap table. |

**Unchanged and protected:** no UI during normal uninterrupted playback (PRD G4, UX Spec §1.1). Nothing in this release touches that. Cross-device sync, Shorts/live/embed resume, analytics, and Firefox/Safari remain non-goals.

---

## 4. Known Failure Hypotheses (Input to Phase 1)

These are suspected causes of unreliable resume, derived from reading the v1.0 TDD. Phase 1 confirms or eliminates each one before Phase 2 fixes anything. **Do not fix these blind.**

| # | Hypothesis | Source | Confidence |
|---|---|---|---|
| H1 | The `video.currentTime > 5` abort guard fires incorrectly. During a pre-roll ad, `currentTime` reflects **ad** position, so any ad longer than 5 seconds silently cancels the resume. | TDD §4.4 | High |
| H2 | `resumeManager.tryResume()` never checks `isAdPlaying()`. PRD §5.7 requires deferring resume until ads finish; the TDD pseudocode omits it entirely. This is a spec conflict, not just a bug. | PRD §5.7 vs TDD §4.4 | High |
| H3 | `waitForVideo()` rejects **immediately** if `#movie_player` is absent, rather than waiting for it to appear. On a slow cold load at `document_idle`, the player container may not exist yet — guaranteed miss. | TDD §4.3 | High |
| H4 | The seek is fire-and-forget. `video.currentTime = resumeTime` is set once and never verified. If YouTube's player init wins the race despite the 400ms delay, nothing detects or retries. | TDD §4.4 | High |
| H5 | The delta guard is inside `attemptSave()`, but TDD §4.5 also states `pause` and `seeked` bypass it. The pseudocode and the behaviour table contradict each other — pause-after-recent-save may not persist. | TDD §4.5 (internal contradiction) | Medium |
| H6 | No `ended` event handler. Watching to completion leaves storage holding a stale mid-video position. | TDD §4.5 | Medium |
| H7 | `beforeunload` claims a synchronous `chrome.storage.local` save. That API is asynchronous and frequently will not complete during unload teardown. | TDD §4.5 | Medium |
| H8 | Replaying the same video does not re-emit, because `navigationManager` compares `newId !== currentVideoId`. | TDD §4.2 | Low |

---

## Phase 1 — Reliability Audit & Instrumentation

**Goal:** Establish, with evidence, which of H1–H8 actually occur in the shipped v1.0 code. Produce a written findings file. **No behaviour changes in this phase.**

**Why first:** Blind-fixing eight hypotheses produces eight untested changes and no way to tell which one mattered. One session of instrumentation removes that risk entirely.

### Tasks

- [ ] 1.1 — Add a module-level `DEBUG` constant (default `false`) and a shared `log(stage, data)` helper that no-ops when `DEBUG` is false. All output prefixed `[YTResume]`.
- [ ] 1.2 — Instrument `resumeManager.tryResume()` to log, in order: entry, `saved.time`, `video.duration` at entry, whether metadata wait occurred, `shouldResume()` result, `isAdPlaying()` at entry and after delay, `video.currentTime` before and after the 400ms delay, whether the `> 5` guard aborted, target `resumeTime`, `video.currentTime` immediately after assignment, and `video.currentTime` again 1000ms after assignment.
- [ ] 1.3 — Instrument `playerObserver.waitForVideo()` to log whether `#movie_player` existed at call time, resolution path taken (immediate / observer / timeout), and elapsed milliseconds.
- [ ] 1.4 — Instrument `progressTracker.attemptSave()` to log the trigger source (`interval` / `pause` / `seeked` / `visibility` / `unload`) and whether the delta guard blocked the save.
- [ ] 1.5 — Run each reproduction scenario in the test table below on live YouTube, capturing console output.
- [ ] 1.6 — Write `docs/PHASE1_FINDINGS.md`: one row per hypothesis with verdict (**Confirmed** / **Not reproduced** / **Inconclusive**), the log evidence, and the affected file and line.
- [ ] 1.7 — Note any failure mode observed that is **not** in H1–H8.

### Tests

| # | Scenario | What must be captured |
|---|---|---|
| T1.1 | Video with saved position ~20min, no ad, cold load | Full trace; `currentTime` at +1000ms confirms whether the seek held |
| T1.2 | Video with saved position, **pre-roll ad longer than 5 seconds** | Whether the `> 5` guard aborted, and what `isAdPlaying()` returned |
| T1.3 | Same video, cold load on a throttled connection (DevTools → Slow 4G) | Whether `#movie_player` existed at `waitForVideo()` call time |
| T1.4 | SPA navigate to a saved video from the homepage | Whether the trace differs from cold load |
| T1.5 | Play 10s, pause immediately | Whether the delta guard blocked the pause save |
| T1.6 | Watch a short video to completion | Whether the final stored `time` matches the end position |
| T1.7 | Close the tab mid-playback, reopen | Whether the last save landed |
| T1.8 | Navigate away from a video and back to the same video | Whether a second `videoChange` is emitted |

### Exit Criteria

- [ ] `docs/PHASE1_FINDINGS.md` exists with a verdict for all 8 hypotheses
- [ ] Every **Confirmed** hypothesis cites specific log output and a file/line
- [ ] `DEBUG` is `false` in the committed code
- [ ] No functional behaviour changed — v1.0 behaviour is byte-for-byte identical with `DEBUG = false`

### Docs to Update

- New: `docs/PHASE1_FINDINGS.md`
- TDD §7: add the `DEBUG` flag and `log()` helper to the error-handling section

---

## Phase 2 — Resume Engine Hardening

**Goal:** Resume fires correctly on every supported video, including ad-served ones, and is verified rather than assumed.

**Why:** This is the core product promise. Everything else in v2.0 is secondary to it.

### Tasks

- [ ] 2.1 — **Ad-aware resume.** Before the resume delay, check `playerObserver.isAdPlaying()`. If an ad is active, do not seek. Wait for the ad to end (observe `#movie_player` class changes), then run the resume sequence. Apply a hard ceiling of 60 seconds; abandon the resume and log a warning if exceeded.
- [ ] 2.2 — **Replace the `currentTime > 5` guard.** Record `video.currentTime` immediately *before* the 400ms delay as `preDelayTime`. After the delay, abort only if `currentTime` has moved more than 10 seconds beyond `preDelayTime + 0.4` — that is a genuine user seek. Natural playback drift during the delay must never abort. This guard must not evaluate at all while an ad is active.
- [ ] 2.3 — **Verified seek with bounded retry.** After assigning `video.currentTime = resumeTime`, wait 250ms and re-read. If the actual position is more than 3 seconds from target, re-assign. Maximum 3 attempts. Log a warning and give up cleanly after the third. Never loop unbounded.
- [ ] 2.4 — **Robust player-container wait.** `waitForVideo()` must no longer reject immediately when `#movie_player` is absent. Observe `document.body` until the container appears, then resolve the `<video>` element from within it. The 10-second overall timeout is retained. **Exactly one `MutationObserver` may be alive at any time** — re-target the existing observer, do not create a second.
- [ ] 2.5 — **Same-video re-entry.** `navigationManager` must re-emit when the user returns to a video they are already on, if the player was torn down in between.
- [ ] 2.6 — Address any additional failure modes confirmed in Phase 1 that are not covered above.
- [ ] 2.7 — Every new promise chain ends in `.catch()`.

### Tests

| # | Test | Pass condition |
|---|---|---|
| T2.1 | Saved position 20:00, no ad, cold load | Lands within ±3s of 19:58 and **still there** 3 seconds later |
| T2.2 | Saved position 20:00, 15-second unskippable pre-roll | No seek during the ad; correct seek within 2s of ad end |
| T2.3 | Saved position 20:00, 5-second skippable ad, skipped at 5s | Correct seek after skip |
| T2.4 | Cold load on Slow 4G throttling | Resume still fires; `waitForVideo()` does not reject |
| T2.5 | User manually scrubs to 40:00 during the 400ms delay | Resume aborts; user stays at 40:00 |
| T2.6 | Video autoplays and drifts ~1s during the delay | Resume still fires (drift must not be read as a user seek) |
| T2.7 | 10 consecutive cold loads of the same saved video | 10/10 resume correctly |
| T2.8 | 10 consecutive SPA navigations to saved videos | 10/10 resume correctly |
| T2.9 | Video where `#movie_player` appears ~3s after `document_idle` | Resume fires |
| T2.10 | Throughout all of the above | Never more than one `MutationObserver` and one `setInterval` alive |
| T2.11 | Shorts URL, live stream URL | No resume, no tracking, no UI, no errors |
| T2.12 | Any failure during resume | Console warning only; YouTube remains fully functional |

### Exit Criteria

- [ ] T2.1–T2.12 all pass
- [ ] Resume success rate across T2.7 and T2.8 is 20/20
- [ ] No uncaught promise rejections in any scenario

### Docs to Update

- TDD §4.3 (`waitForVideo` rewrite), §4.4 (ad gating, guard replacement, verified seek), §7.2 (failure matrix)
- PRD §5.5 (resume logic now explicitly ad-gated), §5.7

---

## Phase 3 — Progress Tracking Hardening

**Goal:** The saved position is accurate and survives every way a session can end.

### Tasks

- [ ] 3.1 — **Resolve the delta-guard contradiction.** Move the delta guard out of `attemptSave()` and into the interval trigger only. `pause`, `seeked`, `ended`, `visibilitychange`, and `pagehide` save unconditionally. Update TDD §4.5 to remove the contradiction.
- [ ] 3.2 — **Add an `ended` handler.** On video end, save the final position. Downstream, `shouldResume()` will correctly decline to resume it.
- [ ] 3.3 — **Replace `beforeunload` with `pagehide`**, and keep the `visibilitychange → hidden` save. Remove the false "synchronous save" claim from the TDD; it is best-effort and must be documented as such.
- [ ] 3.4 — **Never save during an ad.** Confirm `isAdPlaying()` is checked on every trigger, not only the interval.
- [ ] 3.5 — **Never save an invalid position.** Skip if `currentTime` is `NaN`, negative, or greater than `duration`.
- [ ] 3.6 — Confirm `stop()` removes every listener added by `start()`, including the new ones. Listener count must return to baseline after teardown.

### Tests

| # | Test | Pass condition |
|---|---|---|
| T3.1 | Play 10s, pause | Stored `time` ≈ 10 immediately |
| T3.2 | Play, seek to 30:00, wait 1s | Stored `time` ≈ 1800 |
| T3.3 | Watch a 3-minute video to the end | Stored `time` ≈ duration |
| T3.4 | Close tab at 12:34 | Stored `time` within 5s of 754 |
| T3.5 | Switch to another tab at 12:34 | Stored `time` within 5s of 754 |
| T3.6 | Mid-roll ad plays | Stored `time` does not move during the ad and does not jump afterward |
| T3.7 | Navigate through 10 videos | Exactly one `setInterval` alive at all times |
| T3.8 | Navigate away and back 10 times | Listener count on the video element returns to baseline each time |

### Exit Criteria

- [ ] T3.1–T3.8 all pass
- [ ] Maximum observed data loss on unclean shutdown ≤ 5 seconds

### Docs to Update

- TDD §4.5 (delta guard, `ended`, `pagehide`), §3.3, §7.2
- PRD §5.4 (event table)

---

## Phase 4 — Storage Schema v2, Title Capture & Migration

**Goal:** Saved entries carry a video title, existing user data survives untouched, and settings have a home.

**Why before the panel:** The panel cannot be built against a schema that does not exist yet.

### Tasks

- [x] 4.1 — **Define schema v2.** `VideoProgress` gains an optional `title: string`. All other fields unchanged.
- [x] 4.2 — **Add root key `youtubeResumeSchema`** holding the integer `2`. It must live at the top level of `chrome.storage.local`, **never inside `youtubeResume`**, because that object's keys are counted for eviction.
- [x] 4.3 — **Add root key `youtubeResumeSettings`** with the v2 defaults (see Phase 6).
- [x] 4.4 — **Write the migration.** On first run after update: if `youtubeResumeSchema` is absent, write `2`, write default settings if absent, and leave all existing `youtubeResume` entries untouched. Migration must be idempotent and must never delete or rewrite an existing entry.
- [x] 4.5 — **Capture the title.** On each save, read `document.title` and strip the trailing ` - YouTube`. If the result is empty, fall back to a DOM selector; if that also fails, omit the field. A missing title must never block the save.
- [x] 4.6 — Cap stored titles at 200 characters.
- [x] 4.7 — Confirm eviction still counts only genuine video entries and that the 200-entry cap is unaffected by the new root keys.
- [x] 4.8 — Confirm `storage/storageManager.js` remains the **only** module touching `chrome.storage.local`. (Found and fixed a pre-existing v1.0 violation: `popup.js` called `chrome.storage.local` directly — see D-044.)

### Tests

| # | Test | Pass condition |
|---|---|---|
| T4.1 | Load extension over an existing v1.0 profile with saved entries | Every entry survives; `youtubeResumeSchema` = 2; defaults written |
| T4.2 | Reload the extension five times | Migration is a no-op after the first run; no data change |
| T4.3 | Fresh install, no prior data | Schema and settings keys created; no errors |
| T4.4 | Watch a new video for 40s | Entry contains a correct `title` |
| T4.5 | Watch an old (pre-migration) video for 40s | Entry gains a `title` on next save |
| T4.6 | Video with an unusually long title | Title stored, truncated at 200 chars |
| T4.7 | `document.title` unavailable at save time | Save still succeeds without `title` |
| T4.8 | Write 201 entries | 200 remain; oldest evicted; schema and settings keys untouched |
| T4.9 | Grep the codebase for `chrome.storage` | Only `storage/storageManager.js` matches |

### Exit Criteria

- [ ] T4.1–T4.9 all pass
- [ ] Zero data loss confirmed against a real v1.0 profile

### Docs to Update

- TDD §4.6 (schema v2, migration, root keys), §6.2
- PRD §7.3 (schema), §7.4, §7.5, new §7.6 (migration)

---

## Phase 5 — In-Player UI Re-Calibration

**Goal:** The Restart button and resume toast are visually indistinguishable from YouTube's current player UI.

**Confirmed defects** (from the owner's v1.0 screenshot):

| # | Defect | Current | Problem |
|---|---|---|---|
| V1 | Toast collides with the progress bar | `bottom: 48px` | The red progress line runs directly through the toast. YouTube's control area is taller than it was when this value was set. |
| V2 | Toast corner radius is dated | `border-radius: 2px` | YouTube's current overlay chips are substantially rounder |
| V3 | Toast is flush to the player edge | `left: 12px` | YouTube's own overlays sit at a larger inset |
| V4 | Restart button is bare text among pill-shaped controls | `background: none; border: none` | YouTube moved to rounded-pill controls with hover fills. The v1.0 anti-pattern rule that *forbade* a background is now itself the source of the mismatch. |
| V5 | Restart button font size may be undersized | `12px` | YouTube's control-bar type scale has grown |

### Tasks

- [ ] 5.1 — **Re-audit against live YouTube DOM.** Using DevTools on a current watch page, record computed values for `.ytp-time-display` and a native control button: `font-family`, `font-size`, `font-weight`, `color`, `letter-spacing`, `line-height`, `padding`, `border-radius`, hover background, and control-bar height. Record measured values in `docs/YT_DOM_AUDIT.md`. **Do not guess — measure.**
- [ ] 5.2 — Re-calibrate the Restart button to the measured values, including a pill shape and hover background if that is what YouTube now uses.
- [ ] 5.3 — Re-calibrate the toast: corner radius, inset, background opacity, font size, and vertical offset. The offset must be derived from the measured control-bar height, not hard-coded to 48px.
- [ ] 5.4 — **Fix the progress-bar collision.** The toast must clear the progress bar in both default and theater modes.
- [ ] 5.5 — Verify behaviour in default, theater, fullscreen, and miniplayer modes.
- [ ] 5.6 — Retain: `document.createElement` only, no `innerHTML`, no `!important`, `pointer-events: none` on the toast, `role="status"` and `aria-live="polite"` on the toast, `aria-label` on the button.
- [ ] 5.7 — Retain all existing lifecycle behaviour: 7-second auto-dismiss, cleanup on navigation, toast fade timings (200 / 1600 / 400ms).
- [ ] 5.8 — Update UX Spec §4.3 and §5.4 tables with the measured values, and reverse the now-obsolete anti-patterns in §4.6 and §9.3.

### Tests

| # | Test | Pass condition |
|---|---|---|
| T5.1 | Side-by-side screenshot of the Restart button against native controls | Font, size, weight, colour, and shape are indistinguishable |
| T5.2 | Toast displayed at default player size | No overlap with the progress bar or the time display |
| T5.3 | Toast in theater mode | No overlap |
| T5.4 | Toast in fullscreen | No overlap; correctly positioned |
| T5.5 | Hover the Restart button | Hover state matches native control hover exactly |
| T5.6 | Click through the toast onto the progress bar | Click reaches the progress bar (`pointer-events: none` holds) |
| T5.7 | Resume at 1:01:01 | Toast reads `Resumed from 1:01:01` |
| T5.8 | Resume at 3:03 | Toast reads `Resumed from 3:03` |
| T5.9 | Toast lifecycle | Fades in, holds, fades out, and is **removed from the DOM** |
| T5.10 | Navigate mid-toast | Toast removed immediately |
| T5.11 | Restart button copy | Matches CP-01 and CP-02 exactly |
| T5.12 | Normal playback with no resume | Zero injected UI |

### Exit Criteria

- [ ] T5.1–T5.12 all pass
- [ ] `docs/YT_DOM_AUDIT.md` exists with measured values
- [ ] UX Spec §4.3, §4.6, §5.4, §9.3 updated to match what shipped

### Docs to Update

- New: `docs/YT_DOM_AUDIT.md`
- UX Spec §4.3, §4.6, §5.4, §5.5, §9.3
- TDD §4.7, §8

---

## Phase 6 — Settings Store & Settings Panel

**Goal:** A working settings panel inside the popup, reading and writing persisted preferences. Settings are not yet wired into runtime behaviour — that is Phase 7.

### Settings Specification

| Key | Label (copy ID) | Control | Options | Default |
|---|---|---|---|---|
| `minWatchSeconds` | Minimum watch time (CP-42) | Segmented | 10s / 30s / 1m / 2m | `30` |
| `completionThreshold` | Treat as finished at (CP-43) | Segmented | 90% / 95% / 98% | `0.95` |
| `rewindSeconds` | Rewind on resume (CP-44) | Segmented | Off / 2s / 5s / 10s | `2` |
| `showToast` | Show "Resumed from" message (CP-45) | Toggle | On / Off | `true` |
| `showRestartButton` | Show Restart button (CP-46) | Toggle | On / Off | `true` |
| `loadThumbnails` | Load thumbnails (CP-47) | Toggle | On / Off | `true` |

**Not configurable, by decision (D7, D8):** the 400ms resume delay, the 5-second save interval, the 200-entry cap.

### Tasks

- [ ] 6.1 — Extend `storageManager.js` with `getSettings()`, `saveSettings(partial)`, and `resetSettings()`. Every read must merge stored values over defaults, so a missing or corrupt key can never produce an undefined setting.
- [ ] 6.2 — Build the settings view inside the popup as a second view, not a separate page. Gear icon in the list header opens it; back arrow returns.
- [ ] 6.3 — Implement the six controls per the table above, using segmented buttons and toggles only.
- [ ] 6.4 — Changes save immediately on interaction. No Save button.
- [ ] 6.5 — Move `Clear saved progress` into the settings view, retaining the inline confirmation pattern.
- [ ] 6.6 — Add `Reset to defaults`, also with inline confirmation.
- [ ] 6.7 — Move the Support and Other tools sections into the settings view, below all utility content.
- [ ] 6.8 — All copy from UX Spec §7 copy IDs CP-40 through CP-58.
- [ ] 6.9 — Build with `document.createElement` or static HTML only. No `innerHTML`, no inline `<script>`.

### Tests

| # | Test | Pass condition |
|---|---|---|
| T6.1 | Open popup, click gear | Settings view appears in place; popup does not open a tab |
| T6.2 | Click back | Returns to the saved videos view |
| T6.3 | Change each of the six settings, close and reopen the popup | All six persist |
| T6.4 | Inspect storage after a change | Value is under `youtubeResumeSettings`; `youtubeResume` is untouched |
| T6.5 | Manually delete `youtubeResumeSettings` in DevTools, reopen popup | Defaults restored; no errors |
| T6.6 | Manually corrupt `youtubeResumeSettings` to a string, reopen popup | Defaults restored; no errors |
| T6.7 | Clear saved progress → Confirm | Video entries deleted; **settings unchanged** |
| T6.8 | Clear saved progress → Cancel | Nothing changes |
| T6.9 | Reset to defaults → Confirm | Settings reset; **video entries unchanged** |
| T6.10 | Copy audit | Every string matches CP-40 through CP-58 exactly |
| T6.11 | Keyboard only | All controls reachable and operable via Tab and Enter/Space |

### Exit Criteria

- [ ] T6.1–T6.11 all pass
- [ ] `youtubeResume` and `youtubeResumeSettings` are provably independent (T6.7 and T6.9)

### Docs to Update

- TDD: new §4.10 (settings store), §4.6 additions
- UX Spec §6 (settings view), §7 (CP-40 to CP-58)
- PRD §5.8 (new: user settings), §3.2 (NG4 removed)

---

## Phase 7 — Wire Settings Into Runtime

**Goal:** Every setting demonstrably changes extension behaviour.

**Why separate from Phase 6:** Phase 6 proves settings persist. Phase 7 proves they *do* something. Merging the two makes a failure ambiguous.

### Tasks

- [ ] 7.1 — `timeUtils.shouldResume()` takes threshold values as arguments rather than reading module constants. Constants become defaults only.
- [ ] 7.2 — `timeUtils.getResumeTime()` takes `rewindSeconds` as an argument.
- [ ] 7.3 — `bootstrap.js` loads settings **once per navigation**, before the resume attempt, and passes them down. Settings must not be re-read inside the 5-second interval.
- [ ] 7.4 — `resumeManager` respects `showToast` and `showRestartButton`.
- [ ] 7.5 — `progressTracker` respects `minWatchSeconds` — do not create a storage entry for a video watched less than that.
- [ ] 7.6 — Settings changed while a YouTube tab is open apply on the next navigation. Do not attempt live propagation into open tabs; document this in the TDD.
- [ ] 7.7 — If the settings read fails for any reason, fall back to defaults and continue. A settings failure must never block resume.

### Tests

| # | Test | Pass condition |
|---|---|---|
| T7.1 | Set minimum watch time to 10s, watch 15s, reload | Resumes |
| T7.2 | Set minimum watch time to 2m, watch 40s, reload | Does not resume |
| T7.3 | Set rewind to Off, saved at 20:00 | Resumes at exactly 20:00 |
| T7.4 | Set rewind to 10s, saved at 20:00 | Resumes at 19:50 |
| T7.5 | Set completion threshold to 90%, watch 92% of a video, reload | Does not resume |
| T7.6 | Set completion threshold to 98%, watch 96%, reload | Resumes |
| T7.7 | Toggle toast off, trigger a resume | Resume works; no toast; Restart button still appears |
| T7.8 | Toggle Restart button off, trigger a resume | Resume works; no button; toast still appears |
| T7.9 | Toggle both off, trigger a resume | Resume works silently; zero injected DOM |
| T7.10 | Corrupt the settings key, load a saved video | Resumes using defaults; warning logged only |
| T7.11 | Change a setting with a YouTube tab open, then navigate in that tab | New setting is in effect |

### Exit Criteria

- [ ] T7.1–T7.11 all pass
- [ ] Resume works correctly with settings at every extreme value

### Docs to Update

- TDD §4.4, §4.5, §4.9, §5 (contracts), §6
- PRD §5.5, §5.8

---

## Phase 8 — Saved Videos Panel

**Goal:** The popup's primary view is a scrollable list of saved videos with thumbnails, titles, and watch progress. Clicking an item opens that video, which then resumes normally.

### Tasks

- [ ] 8.1 — Widen the popup to 360px. Set a maximum height of 560px with the list region scrolling internally; the header must remain fixed.
- [ ] 8.2 — Read all entries on open, sorted by `updated` descending.
- [ ] 8.3 — Render each row: thumbnail (120×68), title, a progress bar, and `{position} / {duration}` plus `{percent}% watched`.
- [ ] 8.4 — Thumbnail source `https://i.ytimg.com/vi/{videoId}/mqdefault.jpg`. On load error, show a neutral placeholder — never a broken-image icon. When `loadThumbnails` is off, render the placeholder and issue **no** network request.
- [ ] 8.5 — Missing title falls back to CP-37 `Untitled video`. Titles truncate to two lines with ellipsis.
- [ ] 8.6 — Each row is an `<a href="https://www.youtube.com/watch?v={id}" target="_blank" rel="noopener noreferrer">`. **No `tabs` permission.**
- [ ] 8.7 — Per-row remove control (`×`) deleting that single entry, updating the list in place without reopening. Reveal on row hover and keep it keyboard-focusable.
- [ ] 8.8 — Empty state per CP-32 and CP-33.
- [ ] 8.9 — Header shows the item count (CP-38) and the gear icon (CP-31).
- [ ] 8.10 — Render must complete in under 200ms with 200 entries. Thumbnails may load progressively; the list must not block on them.
- [ ] 8.11 — Use `loading="lazy"` on thumbnails so off-screen rows do not fetch.
- [ ] 8.12 — No `innerHTML` anywhere. All rows via `document.createElement`.

### Tests

| # | Test | Pass condition |
|---|---|---|
| T8.1 | Open popup with 12 saved videos | All 12 render, newest first |
| T8.2 | Open popup with 200 saved videos | Renders in under 200ms; scrolling is smooth; header stays fixed |
| T8.3 | Open popup with 0 saved videos | Empty state shown; no errors |
| T8.4 | Click a row | Video opens in a new tab and resumes at the saved position |
| T8.5 | Entry with no title | Shows `Untitled video` |
| T8.6 | Entry with a very long title | Truncates to two lines with ellipsis; layout does not break |
| T8.7 | Deleted/private video (thumbnail 404) | Placeholder shown; no broken image; no console error |
| T8.8 | Turn thumbnails off, reopen popup | Placeholders shown; DevTools → Network shows **zero** requests to `ytimg.com` |
| T8.9 | Remove a single item | Row disappears; entry deleted; count updates; other entries untouched |
| T8.10 | Progress bar and percentage | Match `time / duration` for every row |
| T8.11 | Popup width | Exactly 360px |
| T8.12 | Keyboard only | Tab reaches every row and remove control; Enter opens the video |
| T8.13 | Grep the popup source | Zero occurrences of `innerHTML` |
| T8.14 | Copy audit | Every string matches CP-30 through CP-38 |

### Exit Criteria

- [ ] T8.1–T8.14 all pass
- [ ] With thumbnails disabled, the extension makes zero network requests of any kind

### Docs to Update

- UX Spec §3, §6 (full rewrite), §7 (CP-30 to CP-38), §8.3, §9
- PRD §5.9 (new: saved videos panel), §9, §10, §13
- TDD §2 (popup file structure), new §4.11

---

## Phase 9 — Integration, Regression & Store Resubmission

**Goal:** v2.0.0 is verified end to end against a real v1.0 upgrade path and ready to submit.

### Tasks

- [ ] 9.1 — Remove all Phase 1 instrumentation, or confirm it is fully gated behind `DEBUG = false`. No debug output in normal use.
- [ ] 9.2 — Full copy audit against UX Spec §7, every ID, including the v1.0 IDs that survive.
- [ ] 9.3 — Permissions audit: `permissions` is `["storage"]` only; `host_permissions` is `https://www.youtube.com/*` only.
- [ ] 9.4 — Network audit: with thumbnails on, the only outbound requests are `i.ytimg.com` thumbnail GETs. With thumbnails off, zero.
- [ ] 9.5 — Bump `manifest.json` version to `2.0.0`.
- [ ] 9.6 — Update the privacy policy: local storage only, no analytics, no data collection, and an explicit note that thumbnails are fetched from YouTube's image CDN when enabled.
- [ ] 9.7 — Update the Chrome Web Store listing description and screenshots.
- [ ] 9.8 — Reconcile all docs: PRD, UX Spec, TDD, and Dev Checklist must describe what actually shipped.
- [ ] 9.9 — Fix the unresolved arithmetic error in Dev Checklist §6.2: `shouldResume(100, 200)` is `true` (100 < 190), so the expected result is a resume to 98, not "no seek".
- [ ] 9.10 — Rewrite `docs/project-state-summary.md` for v2.0.0.

### Tests

| # | Test | Pass condition |
|---|---|---|
| T9.1 | Upgrade a real v1.0 profile with saved data to v2.0.0 | All entries survive; resume works; panel populates |
| T9.2 | Fresh install of v2.0.0 | Works with no prior data |
| T9.3 | 30-minute continuous watch session | No console errors; memory stable |
| T9.4 | 25 consecutive SPA navigations | No leaks; one interval; one observer; memory stable |
| T9.5 | Full v1.0 regression suite (TDD §11.3) | 100% pass |
| T9.6 | Resume reliability, 20 cold loads | 20/20 |
| T9.7 | Resume reliability, 20 SPA navigations | 20/20 |
| T9.8 | Shorts, live, embed, playlist, homepage | Silent; no UI; no tracking; no errors |
| T9.9 | Extension disabled mid-session | YouTube continues working normally |
| T9.10 | Zipped build loaded from the zip | Loads clean; no warnings on the Extensions page |

### Exit Criteria

- [ ] T9.1–T9.10 all pass
- [ ] All five docs consistent with shipped code
- [ ] Privacy policy updated and linked
- [ ] Manifest reads `2.0.0`

---

## 5. Release Criteria for v2.0.0

| # | Criterion |
|---|---|
| R1 | Resume succeeds on 40/40 attempts across cold load and SPA navigation, with and without ads |
| R2 | Zero data loss on upgrade from a real v1.0 profile |
| R3 | In-player UI is visually indistinguishable from YouTube's native controls |
| R4 | All six settings persist and demonstrably change behaviour |
| R5 | Saved videos panel renders 200 entries in under 200ms |
| R6 | Permissions unchanged from v1.0 |
| R7 | Zero network requests when thumbnails are disabled |
| R8 | No `innerHTML`, no `eval`, no inline `<script>` anywhere |
| R9 | Exactly one `setInterval` and one `MutationObserver` alive at any time |
| R10 | Every promise chain terminates in `.catch()` |
| R11 | No UI during normal, uninterrupted playback |
| R12 | All user-facing copy matches UX Spec §7 |
| R13 | Privacy policy reflects the thumbnail network exception |

---

## 6. Open Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| K1 | Phase 5 depends on YouTube's current DOM, which can change without notice | Visual mismatch returns | Values are measured and recorded in `YT_DOM_AUDIT.md`, making re-calibration a lookup rather than an investigation |
| K2 | Ad-gated resume adds a wait state that could hang | Resume never fires on some videos | 60-second hard ceiling with clean abandonment (Task 2.1) |
| K3 | Thumbnail loading weakens the zero-network privacy claim | Store review friction or user complaint | Default-on but user-disableable; disclosed explicitly in the privacy policy and listing |
| K4 | Phase 1 may find failure modes outside H1–H8 | Phase 2 scope grows | Phase 1 exists precisely to surface this before Phase 2 is planned in detail |
| K5 | TDD remains at v1.0.0 while PRD and UX Spec move to v2.0.0 | Precedence rules point at a stale document | Every phase lists its TDD sections; TDD is versioned to 2.0.0 in Phase 9 |

---

*This roadmap is the authoritative plan for YouTube Resume v2.0.0. Phases run in order. A phase is complete only when every test passes and its listed doc sections are updated.*
