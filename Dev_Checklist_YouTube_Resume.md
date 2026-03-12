# Development Checklist
## YouTube Resume — Chrome Extension

---

| Field | Detail |
|---|---|
| **Product** | YouTube Resume |
| **Document Type** | Development Checklist |
| **Version** | 1.0.0 |
| **Status** | Ready for Execution |
| **Last Updated** | 2026-03-09 |
| **Companion Documents** | PRD_YouTube_Resume.md, TDD_YouTube_Resume.md, UX_Spec_YouTube_Resume.md |

---

## How to Use This Document

Each phase below represents one unit of AI-assisted development work. The phases are **strictly sequential** — a phase must be fully complete and all its verification steps confirmed before the next phase begins.

Each task is:
- **Small** — scoped to a single file, function, or behavior
- **Testable** — every phase ends with explicit, binary verification steps
- **AI-friendly** — unambiguous enough to be handed directly to a coding agent

> When prompting an AI coding agent for a phase, include: the rules, all three companion documents, the current project state summary, and the phase block below as the task.

---

## Phase Index

| Phase | Name | Goal |
|---|---|---|
| [Phase 1](#phase-1--project-scaffold) | Project Scaffold | Loadable extension with correct file structure |
| [Phase 2](#phase-2--utility-functions) | Utility Functions | Pure logic layer, fully tested |
| [Phase 3](#phase-3--storage-manager) | Storage Manager | Reliable read/write/eviction layer |
| [Phase 4](#phase-4--navigation-manager) | Navigation Manager | SPA video change detection |
| [Phase 5](#phase-5--player-observer) | Player Observer | Async video element + ad detection |
| [Phase 6](#phase-6--resume-manager) | Resume Manager | Core resume seek logic |
| [Phase 7](#phase-7--progress-tracker) | Progress Tracker | Continuous playback tracking |
| [Phase 8](#phase-8--restart-button) | Restart Button | In-player UI injection |
| [Phase 9](#phase-9--resume-toast) | Resume Toast | Passive resume confirmation UI |
| [Phase 10](#phase-10--extension-popup) | Extension Popup | Toolbar popup UI |
| [Phase 11](#phase-11--integration--hardening) | Integration & Hardening | Full pipeline wired and edge cases handled |
| [Phase 12](#phase-12--pre-release-polish) | Pre-Release Polish | Store-ready, clean, and verified |

---

## Phase 1 — Project Scaffold

**Goal:** A syntactically valid, installable Chrome extension that loads on YouTube without errors. No logic yet — structure only.

**Exit Criteria:** Extension loads in Chrome without errors. Visiting any YouTube page produces the expected console message.

---

### 1.1 — Create root directory structure

Create the following empty files and folders exactly as specified in TDD §2:

```
youtube-resume/
├── manifest.json
├── content/
│   ├── bootstrap.js
│   ├── navigationManager.js
│   ├── playerObserver.js
│   ├── resumeManager.js
│   ├── progressTracker.js
│   └── uiInjector.js
├── storage/
│   └── storageManager.js
├── utils/
│   ├── youtubeUtils.js
│   └── timeUtils.js
└── assets/
    └── icons/
        ├── icon16.png
        ├── icon48.png
        └── icon128.png
```

- [ ] All directories and files exist at the correct paths
- [ ] Placeholder icons exist (can be single-color PNGs for now)

---

### 1.2 — Create `manifest.json`

Implement the manifest exactly as specified in TDD §6.3:

- [ ] `manifest_version` is `3`
- [ ] `name` is `"YouTube Resume"`
- [ ] `version` is `"1.0.0"`
- [ ] `permissions` contains only `"storage"`
- [ ] `host_permissions` contains only `"https://www.youtube.com/*"`
- [ ] `content_scripts` lists all JS files in the correct load order (storage → utils → content)
- [ ] `run_at` is `"document_idle"`
- [ ] `icons` references all three sizes

---

### 1.3 — Stub all JS files

Each JS file should contain only a module-level comment and a single `console.log` identifying it has loaded. No logic.

- [ ] All 9 JS files exist and are non-empty
- [ ] Each file has a comment naming its module and its responsibility (from TDD §4)

---

### 1.4 — Verify extension loads in Chrome

- [ ] Extension can be loaded via `chrome://extensions` → Load Unpacked without errors
- [ ] Navigating to `https://www.youtube.com/watch?v=dQw4w9WgXcQ` shows all 9 module log messages in DevTools Console
- [ ] No errors or warnings appear in the Extensions management page
- [ ] No errors appear in the DevTools Console on load

---

## Phase 2 — Utility Functions

**Goal:** All pure logic functions implemented, correct, and manually verified. These functions underpin every subsequent phase — they must be right before anything else is built.

**Exit Criteria:** Every verification step below passes when tested manually in the DevTools console on a live YouTube tab.

---

### 2.1 — Implement `youtubeUtils.js`

Implement all four functions per TDD §4.8:

- [ ] `isWatchPage()` — returns `true` on `/watch?v=*`, `false` on all other paths
- [ ] `getVideoId()` — returns the `v` param value, or `null` if absent
- [ ] `isShorts()` — returns `true` only when path starts with `/shorts/`
- [ ] `isLive(video)` — returns `true` only when `video.duration === Infinity`

**Verify in DevTools console:**

| Test | URL / Input | Expected |
|---|---|---|
| Watch page | `https://youtube.com/watch?v=abc` | `isWatchPage() → true` |
| Home page | `https://youtube.com/` | `isWatchPage() → false` |
| Shorts | `https://youtube.com/shorts/abc` | `isWatchPage() → false`, `isShorts() → true` |
| Video ID | `?v=dQw4w9WgXcQ` | `getVideoId() → "dQw4w9WgXcQ"` |
| No ID | `?list=xyz` | `getVideoId() → null` |

---

### 2.2 — Implement `timeUtils.js`

Implement both functions and all constants per TDD §4.9:

- [ ] `MIN_RESUME_SECONDS = 30`
- [ ] `COMPLETION_THRESHOLD = 0.95`
- [ ] `ROLLBACK_SECONDS = 2`
- [ ] `shouldResume(savedTime, duration)` — returns correct boolean for all cases
- [ ] `getResumeTime(savedTime)` — returns `max(0, savedTime - 2)`

**Verify in DevTools console:**

| Test | Input | Expected |
|---|---|---|
| Below minimum | `shouldResume(20, 3600)` | `false` |
| At minimum boundary | `shouldResume(30, 3600)` | `false` (must be `> 30`, not `>= 30`) |
| Just above minimum | `shouldResume(31, 3600)` | `true` |
| Above completion | `shouldResume(3420, 3600)` | `false` (3420 / 3600 = 95%) |
| Just below completion | `shouldResume(3419, 3600)` | `true` |
| Invalid duration (NaN) | `shouldResume(100, NaN)` | `false` |
| Invalid duration (0) | `shouldResume(100, 0)` | `false` |
| Live stream | `shouldResume(100, Infinity)` | `false` |
| Rollback normal | `getResumeTime(100)` | `98` |
| Rollback floor | `getResumeTime(1)` | `0` |
| Rollback at 0 | `getResumeTime(0)` | `0` |

---

## Phase 3 — Storage Manager

**Goal:** All storage read/write/delete/eviction operations are correct and verifiable in Chrome DevTools.

**Exit Criteria:** All operations below can be triggered from the DevTools console and produce the expected results in the Application → Storage panel.

---

### 3.1 — Implement `storageManager.js`

Implement all three public methods and the eviction logic per TDD §4.6:

- [ ] `getProgress(videoId)` — returns `VideoProgress` object or `null`
- [ ] `saveProgress(videoId, time, duration)` — upserts entry with `updated` timestamp
- [ ] `deleteProgress(videoId)` — removes entry; handles missing key gracefully
- [ ] All reads/writes use the root key `"youtubeResume"`
- [ ] No module other than `storageManager.js` calls `chrome.storage.local` directly

---

### 3.2 — Implement eviction logic

- [ ] On every `saveProgress` call, after upsert, if entry count exceeds 200: remove oldest entries by `updated` until count equals 200
- [ ] Eviction never removes the entry that was just written
- [ ] Eviction is tested by writing 201 entries and confirming only 200 remain

---

### 3.3 — Verify storage operations

Open DevTools → Application → Extension Storage → Local after each operation:

- [ ] `saveProgress("test1", 100, 3600)` → entry appears under `youtubeResume.test1` with correct `time`, `duration`, `updated`
- [ ] `getProgress("test1")` → returns the saved object
- [ ] `getProgress("nonexistent")` → returns `null` (no error thrown)
- [ ] `deleteProgress("test1")` → entry removed from storage
- [ ] `deleteProgress("nonexistent")` → no error thrown
- [ ] Write 201 unique entries → only 200 remain; entry with lowest `updated` is gone
- [ ] `updated` value is a Unix timestamp in seconds (10-digit integer, not milliseconds)

---

## Phase 4 — Navigation Manager

**Goal:** The extension reliably detects every YouTube video change — including cold load, SPA navigation, and the fallback path — and emits a clean `videoId` string each time.

**Exit Criteria:** Every navigation scenario below produces the expected console output without duplicates or misses.

---

### 4.1 — Implement `navigationManager.js`

Implement per TDD §4.2:

- [ ] `start(onVideoChange)` — begins listening for video changes
- [ ] `stop()` — removes all listeners and clears fallback interval
- [ ] On `yt-navigate-finish`: extract `videoId`, emit only if it differs from `currentVideoId`
- [ ] On cold load to a watch URL: emit immediately on `start()` without waiting for a navigation event
- [ ] Fallback URL polling: if `yt-navigate-finish` has not fired within 2 seconds of a detected URL change, emit via polling
- [ ] `currentVideoId` is initialized to `null` and updated on each valid emission

---

### 4.2 — Verify navigation detection

Add a temporary `console.log` to the `onVideoChange` callback in `bootstrap.js` for this phase.

- [ ] Cold load to `youtube.com/watch?v=VIDEO_A` → logs `"videoChange: VIDEO_A"` once
- [ ] SPA navigate to a second video → logs `"videoChange: VIDEO_B"` once
- [ ] SPA navigate back to first video → logs `"videoChange: VIDEO_A"` once
- [ ] Navigate to YouTube home page → no log emitted
- [ ] Navigate from home back to a watch page → logs correct videoId
- [ ] Rapid back-to-back navigations → only the final videoId is logged (no duplicates for the same ID)
- [ ] `stop()` called → subsequent navigations produce no logs

---

## Phase 5 — Player Observer

**Goal:** The extension reliably resolves the `<video>` element after YouTube's async player initialization, and correctly identifies when an ad is playing.

**Exit Criteria:** All promises and state checks below behave correctly when run from the DevTools console on a live YouTube tab.

---

### 5.1 — Implement `playerObserver.js`

Implement per TDD §4.3:

- [ ] `waitForVideo()` — returns a `Promise<HTMLVideoElement>`
- [ ] Resolves immediately if `<video>` is already present in `#movie_player`
- [ ] Resolves via `MutationObserver` when `<video>` appears asynchronously
- [ ] Disconnects the observer on resolution
- [ ] Rejects with a descriptive error if `#movie_player` is not found
- [ ] Rejects after a 10-second timeout if `<video>` never appears; clears observer and timeout
- [ ] `isAdPlaying()` — returns `true` if `#movie_player` has class `ad-showing` or `ad-interrupting`
- [ ] `disconnect()` — idempotent; safe to call before `waitForVideo()` resolves

---

### 5.2 — Verify player detection

- [ ] On a standard watch page: `playerObserver.waitForVideo()` resolves to an `HTMLVideoElement`
- [ ] Resolved element has a valid `video.duration` (after metadata loads)
- [ ] `isAdPlaying()` returns `false` on a non-ad video
- [ ] `isAdPlaying()` returns `true` when `ad-showing` class is manually added to `#movie_player` via DevTools
- [ ] `disconnect()` called after resolution → no errors
- [ ] `disconnect()` called before resolution → subsequent resolution does not fire callback

---

## Phase 6 — Resume Manager

**Goal:** The extension correctly validates saved progress and seeks the video to the right timestamp at the right time.

**Exit Criteria:** All seek scenarios below produce the correct `video.currentTime` value, verified by reading the property immediately after the seek delay elapses.

---

### 6.1 — Implement `resumeManager.js`

Implement per TDD §4.4:

- [ ] `tryResume(video, saved, videoId)` — async function, returns `Promise<void>`
- [ ] Calls `timeUtils.shouldResume(saved.time, video.duration)` before any seek
- [ ] Waits for `loadedmetadata` if `video.duration` is `NaN` or `0` at call time, with a 5-second timeout
- [ ] If `shouldResume` returns `false`, exits silently without seeking or injecting UI
- [ ] Applies a fixed `400ms` delay before seeking (per TDD §4.4 `RESUME_DELAY_MS`)
- [ ] After delay, checks if `video.currentTime > 5`; if true, aborts (user already seeked manually)
- [ ] Sets `video.currentTime = timeUtils.getResumeTime(saved.time)`
- [ ] Calls `uiInjector.showRestartButton(video, videoId)` only if seek succeeds
- [ ] Catches and logs any exception from `video.currentTime` assignment without rethrowing

---

### 6.2 — Verify resume seek behavior

Manually write test entries to storage using `storageManager.saveProgress()`, then navigate to the corresponding video:

- [ ] `savedTime=1200, duration=3600` → video seeks to `1198` after ~400ms
- [ ] `savedTime=20, duration=3600` → no seek occurs (below minimum)
- [ ] `savedTime=3420, duration=3600` → no seek occurs (above completion threshold)
- [ ] `savedTime=100, duration=200` → no seek occurs (above 95% threshold: 100/200 = 50%... recalculate — this should resume)
- [ ] After seek, `video.currentTime` equals `resumeTime` within ±1 second
- [ ] If user manually seeks during the 400ms delay window, resume does not override their position
- [ ] No errors appear in console for any scenario

---

## Phase 7 — Progress Tracker

**Goal:** The extension continuously and accurately saves playback progress to storage across all defined trigger events.

**Exit Criteria:** All trigger scenarios below produce an updated storage entry, verified in DevTools → Application → Storage.

---

### 7.1 — Implement `progressTracker.js`

Implement per TDD §4.5:

- [ ] `start(video, videoId)` — initializes interval and all event listeners
- [ ] `stop()` — clears interval and removes all event listeners; idempotent
- [ ] Interval fires every `5000ms` and calls internal `attemptSave()`
- [ ] `attemptSave()` skips save if `playerObserver.isAdPlaying()` returns `true`
- [ ] `attemptSave()` skips save if `video.duration === Infinity`
- [ ] `attemptSave()` skips save if `Math.abs(currentTime - lastSavedTime) < 5`
- [ ] `attemptSave()` saves and updates `lastSavedTime` when delta is `>= 5`
- [ ] `pause` event → saves immediately, bypassing delta guard
- [ ] `seeked` event → saves immediately, bypassing delta guard
- [ ] `visibilitychange` event → saves only when `document.hidden === true`
- [ ] `beforeunload` event → saves synchronously (best-effort)
- [ ] `stop()` resets all internal state: `intervalId`, `lastSavedTime`, `activeVideo`, `activeVideoId`
- [ ] At most one `setInterval` is active at any time across the entire extension

---

### 7.2 — Verify progress tracking

Use DevTools → Application → Extension Storage to observe the `youtubeResume` object in real time:

- [ ] Play a video → storage entry appears within 5 seconds
- [ ] Continue watching → `time` value increments every ~5 seconds
- [ ] Pause the video → `time` updates immediately on pause
- [ ] Scrub the timeline → `time` updates immediately after seek completes
- [ ] Switch to another tab → `time` updates when tab becomes hidden
- [ ] Navigate to a new video → previous video's interval stops (entry no longer updates)
- [ ] New video's entry begins updating independently
- [ ] Ad plays during video → `time` does not update during ad; resumes updating after
- [ ] At no point are more than one interval timers active (verify via DevTools → Performance)

---

## Phase 8 — Restart Button

**Goal:** The Restart button renders correctly in the YouTube player, matches the visual spec, auto-dismisses, and executes the correct actions on click.

**Exit Criteria:** All visual and behavioral checks below pass on a live YouTube tab.

---

### 8.1 — Implement `uiInjector.js` (Restart Button)

Implement per TDD §4.7 and UX Spec §4:

- [ ] `showRestartButton(video, videoId)` — injects button into YouTube player controls
- [ ] `cleanup()` — removes button from DOM and clears dismiss timer; idempotent
- [ ] Button created via `document.createElement('button')` — no `innerHTML`
- [ ] Button `id` is `"yt-resume-restart-btn"`
- [ ] Button text is `"↺ Restart"` (copy ID: CP-01)
- [ ] Button `title` attribute is `"Restart video from the beginning"` (copy ID: CP-02)
- [ ] Button injected as next sibling of `.ytp-time-display`
- [ ] If `.ytp-time-display` is not found: log warning, do not inject, return silently
- [ ] All styles applied inline per UX Spec §4.3 (font, size, weight, color, background, border, padding, opacity, cursor)
- [ ] Hover: opacity increases to `1.0`; mouse-out: opacity returns to `0.9`
- [ ] Auto-dismiss after `7000ms` via `setTimeout`
- [ ] On click: `video.currentTime = 0`, `storageManager.deleteProgress(videoId)`, `cleanup()`
- [ ] `cleanup()` called on new navigation (no stale button across videos)

---

### 8.2 — Wire `uiInjector` into `resumeManager`

- [ ] `resumeManager.tryResume()` calls `uiInjector.showRestartButton()` after a successful seek
- [ ] `uiInjector.cleanup()` is called from `bootstrap.js` teardown on each navigation

---

### 8.3 — Verify Restart Button

Manually save progress for a video, then navigate to it to trigger a resume:

- [ ] Button appears in the player controls bar after resume
- [ ] Button is positioned immediately after the time display (`0:08 / 35:13 ↺ Restart`)
- [ ] Button does not shift or reflow other controls
- [ ] Button font, size, and color are visually indistinguishable from YouTube's controls
- [ ] Hovering the button shows the tooltip `"Restart video from the beginning"`
- [ ] Hovering increases button opacity
- [ ] Button auto-removes from DOM after ~7 seconds
- [ ] Clicking the button: seeks to `0:00`, removes the button, deletes the storage entry
- [ ] After click, `storageManager.getProgress(videoId)` returns `null`
- [ ] Button does not appear when no resume occurred (fresh video load with no saved progress)
- [ ] No button persists after navigating to a new video

---

## Phase 9 — Resume Toast

**Goal:** A non-interactive resume confirmation toast appears briefly after a resume, displays the correct formatted timestamp, and fades out cleanly.

**Exit Criteria:** All visual and behavioral checks below pass on a live YouTube tab.

> Reference: UX Spec §5. This phase is recommended for v1.0. If timeline is constrained, it may be deferred — the extension is functionally complete without it.

---

### 9.1 — Implement resume toast in `uiInjector.js`

Extend `uiInjector.js` with toast functionality per UX Spec §5:

- [ ] `showToast(resumeTime)` — injects toast element into `#movie_player`
- [ ] Toast element created via `document.createElement` — no `innerHTML`
- [ ] Toast text is `"Resumed from {m:ss}"` (copy ID: CP-03)
- [ ] Timestamp formatted as `m:ss` for videos under 1 hour; `h:mm:ss` for videos 1 hour or longer
- [ ] All styles applied inline per UX Spec §5.4 (background, color, font, padding, border-radius, position, bottom, left, z-index)
- [ ] `pointer-events: none` — toast must not intercept any clicks
- [ ] `role="status"` and `aria-live="polite"` attributes set on toast element
- [ ] Fade-in over `200ms`, hold for `1600ms`, fade-out over `400ms` using CSS `opacity` transition
- [ ] Element removed from DOM after fade-out completes (not just hidden)
- [ ] `cleanup()` also removes toast if still present

---

### 9.2 — Wire toast into `resumeManager`

- [ ] `resumeManager.tryResume()` calls `uiInjector.showToast(resumeTime)` alongside `showRestartButton()` after a successful seek

---

### 9.3 — Verify Resume Toast

- [ ] Toast appears in the lower-left of the video frame after resume
- [ ] Toast displays correct timestamp (e.g., `"Resumed from 17:23"`)
- [ ] Timestamp uses `h:mm:ss` format for a video resumed past the 1-hour mark
- [ ] Toast fades in, holds, then fades out — total visibility ~2.2 seconds
- [ ] Toast does not block clicks on the progress bar or controls during its lifetime
- [ ] Toast is removed from the DOM (not just invisible) after fade-out
- [ ] Toast does not appear when no resume occurred

---

## Phase 10 — Extension Popup

**Goal:** The extension popup renders correctly, displays accurate live data, and the clear action works with proper confirmation.

**Exit Criteria:** All layout, data, and interaction checks below pass.

---

### 10.1 — Create popup files

Create and populate the following files (these are new additions to the project structure):

```
popup/
├── popup.html
├── popup.js
└── popup.css
```

Update `manifest.json` to register the popup:
- [ ] `"action": { "default_popup": "popup/popup.html" }` added to manifest
- [ ] Extension reloads without errors after manifest update

---

### 10.2 — Implement popup layout (`popup.html` + `popup.css`)

Implement per UX Spec §6.3 and §6.5:

- [ ] Fixed width of `280px`
- [ ] Section A: Product name `"YouTube Resume"` + subtitle copy (CP-10, CP-11)
- [ ] Section B: `"Status"` label + `"✓ Active on YouTube"` value (CP-12, CP-13)
- [ ] Section C: `"Saved videos"` label + `{n}` value placeholder (CP-14, CP-15)
- [ ] Section D: `"Clear saved progress"` button (CP-16)
- [ ] Section E: `"Support development ❤️"` label + `"Buy me a coffee"` link (CP-21, CP-22)
- [ ] Section F: `"Other tools"` header + `"Session Switcher"` entry with description (CP-23, CP-24, CP-25)
- [ ] Visual dividers between sections
- [ ] Typography uses system font stack per UX Spec §6.5
- [ ] Clear button styled as secondary/ghost (not a primary CTA)
- [ ] No animations, transitions, or loading states

---

### 10.3 — Implement popup logic (`popup.js`)

- [ ] On popup open: read `youtubeResume` from `chrome.storage.local`
- [ ] Display count of stored entries as the `"Saved videos"` value
- [ ] If storage read fails: display `"—"` for saved count (not `"0"`)
- [ ] Data is read once on open; no live updates while popup is open

---

### 10.4 — Implement clear action with inline confirmation

Per UX Spec §6.4 Section D — inline confirmation pattern:

- [ ] Initial state: `[ Clear saved progress ]` button visible
- [ ] After click: button is replaced inline with `"Clear all saved data?  [ Confirm ]  [ Cancel ]"`
- [ ] Confirm body text includes the count: `"This will remove resume positions for all {n} saved videos. This cannot be undone."` (CP-18)
- [ ] On `[ Confirm ]` click: delete entire `youtubeResume` key from storage; update saved count to `0`; restore original button
- [ ] On `[ Cancel ]` click: restore original button with no changes
- [ ] After confirm, `"Saved videos"` value updates to `0` inline without reopening popup

---

### 10.5 — Verify popup

- [ ] Popup opens within 200ms (no visible loading delay)
- [ ] All six sections render in the correct order
- [ ] `"Saved videos"` count matches actual entry count in DevTools → Storage
- [ ] Clear action: inline confirmation appears on click
- [ ] Clear confirm: storage cleared, count updates to `0`
- [ ] Clear cancel: no change to storage or displayed count
- [ ] `"Buy me a coffee"` link opens in a new tab
- [ ] `"Session Switcher"` link opens Chrome Web Store listing in a new tab
- [ ] Popup is exactly `280px` wide
- [ ] No console errors on open

---

## Phase 11 — Integration & Hardening

**Goal:** The full pipeline is wired together in `bootstrap.js`, all teardown paths are correct, and all defined edge cases and error scenarios are handled.

**Exit Criteria:** Every integration scenario and edge case below is verified on a live YouTube tab.

---

### 11.1 — Implement `bootstrap.js`

Implement the full orchestration logic per TDD §4.1 and the initialization flow in TDD §3.1:

- [ ] `init()` is self-executing on script load
- [ ] Calls `navigationManager.start(onVideoChange)`
- [ ] `onVideoChange` callback: calls teardown before every re-initialization
- [ ] Teardown sequence: `progressTracker.stop()`, `uiInjector.cleanup()`, `playerObserver.disconnect()`
- [ ] After teardown: checks `youtubeUtils.isWatchPage()`; exits silently if false
- [ ] Calls `playerObserver.waitForVideo()` — chains all subsequent logic in `.then()`
- [ ] On `.then(videoElement)`: calls `storageManager.getProgress(videoId)` 
- [ ] If progress exists: calls `resumeManager.tryResume(videoElement, saved, videoId)`
- [ ] After resume attempt (whether or not it occurred): calls `progressTracker.start(videoElement, videoId)`
- [ ] `.catch()` at the end of every promise chain — logs warning, exits gracefully
- [ ] No uncaught promise rejections under any condition

---

### 11.2 — Verify full pipeline (happy path)

- [ ] Cold load to a video with no saved progress → tracking begins; entry appears in storage within 5s
- [ ] Cold load to a video with valid saved progress → video seeks to `resumeTime`; Restart button appears; toast appears; tracking begins
- [ ] SPA navigate to a new video → previous tracking stops; new tracking initializes cleanly
- [ ] SPA navigate to a non-watch page (Home, Subscriptions) → tracking stops; no errors
- [ ] SPA navigate back to a watch page from a non-watch page → tracking re-initializes

---

### 11.3 — Verify teardown correctness

- [ ] Navigate away from a video mid-track → only one interval is active after navigation (use DevTools Performance tab)
- [ ] Navigate through 10 successive videos → memory usage is stable (Chrome Task Manager)
- [ ] No stale Restart buttons from previous videos appear on a new video's player

---

### 11.4 — Verify error & edge case handling

Each scenario below should produce at most a console warning — never a crash, never a broken YouTube page:

- [ ] Open a YouTube Shorts URL → no tracking, no resume, no UI injected
- [ ] Open a YouTube live stream → no tracking, no resume, no UI injected
- [ ] Video with pre-roll ad → resume fires only after ad ends; ad time not tracked
- [ ] `#movie_player` not found (observer timeout at 10s) → warning logged; page works normally
- [ ] `chrome.storage.local` read returns an error → resume skipped; tracking proceeds
- [ ] `video.duration` is `NaN` at resume time → waits for `loadedmetadata`; resumes correctly
- [ ] `.ytp-time-display` not found in DOM → warning logged; resume still occurred; no crash
- [ ] User manually seeks during the 400ms resume delay → resume does not override the user's position
- [ ] Same video opened in two tabs → no crash; last write wins in storage
- [ ] Rapid back-to-back SPA navigations → no duplicate intervals; only the final video's tracker is active

---

## Phase 12 — Pre-Release Polish

**Goal:** The extension is clean, correct, and ready for Chrome Web Store submission. No debug code, no rough edges, no console noise.

**Exit Criteria:** All checks below pass before submission.

---

### 12.1 — Remove all development artifacts

- [ ] All `console.log` statements added for development/verification purposes are removed
- [ ] All `console.warn` and `console.error` calls that are intentional (per TDD §7.1) are retained and prefixed with `[YTResume]`
- [ ] No `debugger` statements remain
- [ ] No commented-out code blocks remain

---

### 12.2 — Final copy audit

Cross-reference every user-facing string against the copy reference table in UX Spec §7:

- [ ] Restart button label matches CP-01: `↺ Restart`
- [ ] Restart button tooltip matches CP-02: `Restart video from the beginning`
- [ ] Resume toast matches CP-03 format: `Resumed from {m:ss}`
- [ ] Popup product name matches CP-10: `YouTube Resume`
- [ ] Popup subtitle matches CP-11: `Automatically resume videos where you left off.`
- [ ] All other popup copy (CP-12 through CP-25) matches spec exactly

---

### 12.3 — Permissions audit

- [ ] `manifest.json` requests only `"storage"` in `permissions`
- [ ] `manifest.json` requests only `"https://www.youtube.com/*"` in `host_permissions`
- [ ] No `"tabs"`, `"history"`, `"cookies"`, `"identity"` or any other permission is present
- [ ] Extension makes zero network requests (verify in DevTools → Network on a YouTube tab)

---

### 12.4 — Final icons

- [ ] `icon16.png`, `icon48.png`, `icon128.png` are final-quality assets (not placeholder colors)
- [ ] Icons are correctly referenced in `manifest.json`
- [ ] Icons render cleanly in the Chrome toolbar (no pixelation at 16px)

---

### 12.5 — Cross-scenario regression

Run the full manual QA checklist from TDD §11.3 in sequence:

- [ ] Storage section: all 5 storage verification checks pass
- [ ] Resume behavior: all 5 resume behavior checks pass
- [ ] UI section: all 7 UI checks pass
- [ ] Navigation section: all 5 navigation checks pass
- [ ] Stability section: all 3 stability checks pass

---

### 12.6 — Chrome Web Store readiness

- [ ] Extension zipped and loadable from the zip file (not just from source directory)
- [ ] Manifest version, name, and description are final
- [ ] No errors or warnings on the Chrome Extensions management page
- [ ] Extension passes [Chrome Web Store review policy checklist](https://developer.chrome.com/docs/webstore/program-policies/)
- [ ] Privacy policy drafted and ready to link in store listing (confirms: local storage only, no data collection, no network calls)

---

*This checklist is the authoritative development plan for YouTube Resume v1.0. Phases must be completed in order. Each phase's exit criteria must be fully verified before the next phase begins.*
