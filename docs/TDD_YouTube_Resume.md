# Technical Design Document
## YouTube Resume — Chrome Extension

---

| Field | Detail |
|---|---|
| **Product** | YouTube Resume |
| **Document Type** | Technical Design Document (TDD) |
| **Version** | 4.0.0-draft |
| **Previous Version** | 3.0.0 |
| **Status** | Reconciled against shipped v3.0.0 code (Phase 6, Roadmap v3 6.6); §1/§1.2/§2 updated for the approved v4 architecture (D-102), remaining sections pending per-phase updates as Roadmap v4 lands |
| **Last Updated** | 2026-09-08 |
| **Companion Document** | PRD_YouTube_Resume.md v4.0.0 |

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Project Structure](#2-project-structure)
3. [Architecture & Data Flow](#3-architecture--data-flow)
4. [Module Specifications](#4-module-specifications)
   - 4.1 [bootstrap.js](#41-bootstrapjs)
   - 4.2 [navigationManager.js](#42-navigationmanagerjs)
   - 4.3 [playerObserver.js](#43-playerobserverjs)
   - 4.4 [resumeManager.js](#44-resumemanagerjs)
   - 4.5 [progressTracker.js](#45-progresstrackerjs)
   - 4.6 [storageManager.js](#46-storagemanagerjs)
   - 4.7 [uiInjector.js](#47-uiinjectorjs)
   - 4.8 [youtubeUtils.js](#48-youtubeutilsjs)
   - 4.9 [timeUtils.js](#49-timeutilsjs)
   - 4.10 [popup/popup.js — Settings Panel](#410-popuppopupjs--settings-panel-v2--phase-6)
   - 4.11 [popup/popup.js — Saved Videos List](#411-popuppopupjs--saved-videos-list-v2--phase-8)
   - 4.12 [debugLogger.js](#412-debugloggerjs)
5. [Inter-Module Contracts](#5-inter-module-contracts)
6. [State Management](#6-state-management)
7. [Error Handling Strategy](#7-error-handling-strategy)
8. [DOM Reference & Selectors](#8-dom-reference--selectors)
9. [Performance Budget](#9-performance-budget)
10. [Implementation Order](#10-implementation-order)
11. [Testing Strategy](#11-testing-strategy)
12. [Constraints & Gotchas](#12-constraints--gotchas)

---

## 1. System Overview

YouTube Resume is implemented as a **Manifest V3 Chrome content script plus a popup**, plus, as of
v4.0.0 (Roadmap v4 Phase 2/3, D-102), a minimal background service worker. There is no options page.
Resume/tracking logic runs entirely within the YouTube page context, isolated by Chrome's default
content script sandbox; the service worker holds no resume or tracking logic of its own — it exists
solely as `background/storageWriter.js`, the serialized writer for every `chrome.storage.local`
mutation (see §1.2, §2, §4.6). It makes no network request and is restart-safe: MV3 can terminate an
idle service worker at any time, so every command it applies must be safely re-appliable from
`chrome.storage.local` state alone, with no state held only in worker memory. It adds no permission —
`manifest.json` gains only a `background.service_worker` entry; `permissions`/`host_permissions` are
unchanged. The popup (Phases 6–8)
is a separate document (`popup/popup.html`, opened via `action.default_popup`) that never runs in
page context and talks to storage only through `storage/storageManager.js` (D-044) — it holds two
views, the saved-videos list (default) and settings, never a background page or a new tab (D-008).

### 1.1 Core Architecture Principle

The system is a **linear initialization pipeline** triggered on every YouTube SPA navigation. Each module in the pipeline has a single responsibility, a defined input, and a defined output. Modules do not reach sideways into each other — communication flows through explicit function calls and callbacks.

```
bootstrap.js
    └── navigationManager.js       (detects video changes)
            └── playerObserver.js  (waits for <video> element)
                    └── resumeManager.js   (validates + executes resume)
                    │       └── uiInjector.js  (injects Restart button)
                    └── progressTracker.js (tracks + persists progress)
                            └── storageManager.js  (reads/writes storage)
```

### 1.2 Runtime Environment

| Property | Value |
|---|---|
| Extension platform | Chrome Manifest V3 |
| Execution context | Content script (isolated world) |
| Host page | `https://www.youtube.com/*` |
| `run_at` | `document_idle` |
| Background script | `background/storageWriter.js` — serialized storage writer only (v4, D-102); no resume/tracking logic, no network request, restart-safe |
| Popup | `popup/popup.html` — saved-videos list + settings, two views in one popup document (v2, Phases 6/8) |
| Options page | None — settings live inside the popup, not a `chrome://extensions` options page (D-008) |

### 1.3 Key Environmental Constraints

- **SPA navigation:** YouTube never performs a full page reload. The extension must self-reinitialize on each `yt-navigate-finish` event.
- **Async player init:** The `<video>` element is injected by YouTube's player asynchronously. It cannot be assumed present on script load.
- **Player initialization race:** YouTube's internal player scripts can override `video.currentTime` if set immediately. A 300–500ms buffer after video detection is mandatory.
- **Ad sharing:** Ads and main content share the same `<video>` element. The extension must not treat ad playback as trackable watch progress.

---

## 2. Project Structure

```
youtube-resume/
│
├── manifest.json
│
├── content/
│   ├── bootstrap.js            # Entry point; wires all modules together
│   ├── navigationManager.js    # SPA navigation detection
│   ├── playerObserver.js       # <video> element + ad state detection
│   ├── resumeManager.js        # Resume validation and seek execution
│   ├── progressTracker.js      # Interval + event-based progress saving
│   └── uiInjector.js           # Restart button DOM injection + lifecycle
│
├── background/
│   └── storageWriter.js        # v4 (Phase 2/3, D-102) — sole chrome.storage.local write path;
│                                 # serialized, restart-safe MV3 service worker; no other logic
│
├── storage/
│   ├── storageValidation.js    # v4 (Phase 2, D-102) — pure schema/validation/repair logic shared by
│   │                             # storageManager.js and background/storageWriter.js (no chrome.storage
│   │                             # access; kept under storage/, not utils/, to avoid reordering the
│   │                             # manifest's "storage -> utils -> content" load sequence)
│   └── storageManager.js       # chrome.storage.local abstraction: reads direct, mutations sent to
│                                 # background/storageWriter.js as commands (v4 Phase 2, D-102)
│
├── utils/
│   ├── debugLogger.js          # DEBUG-gated tracing (Phase 1+, §7.1); no-op unless DEBUG = true
│   ├── youtubeUtils.js         # URL parsing, videoId extraction, title/channel capture (v2)
│   └── timeUtils.js            # Threshold math, resume calculations
│
├── popup/                      # v2 — Phase 6 (settings) / Phase 8 (saved videos list)
│   ├── popup.html              # Two views: #view-list (default), #view-settings
│   ├── popup.js                # List rendering + settings wiring; no storage logic of its own
│   └── popup.css               # 360px fixed width, 560px max height (UX Spec §6.2, D-010)
│
└── assets/
    └── icons/
        ├── icon-16.png
        ├── icon-48.png
        └── icon-128.png
```

**Design rationale:**
- `content/` contains all runtime logic that executes in-page
- `storage/` is isolated to make it independently testable and swappable — as of Phase 4 it is also
  loaded by `popup/popup.js`, making it the sole owner of `chrome.storage.local` across both
  contexts (D-044), not just the content script. As of v4.0.0 (Phase 2/3, D-102), read access stays
  here; `background/` becomes the sole write path (see §4.6)
- `background/` is new in v4.0.0 (D-102) — a single-purpose serialized writer, not a home for
  resume/tracking/business logic, which stays in `content/`
- `utils/` contains only pure functions — no side effects, no DOM access, no storage calls

---

## 3. Architecture & Data Flow

### 3.1 Initialization Flow

This flow executes once on cold load, and repeats from step 2 on every SPA navigation.

```
1. bootstrap.js loads (document_idle)
        │
        ▼
2. navigationManager.start()
   └── Registers yt-navigate-finish listener
   └── Falls back to URL polling if event unavailable
        │
        ▼ (on each video navigation)
3. navigationManager emits: onVideoChange(videoId)
        │
        ▼
3.5. bootstrap reads storageManager.getSettings() once for this navigation (Phase 7, D-049)
   └── On rejection, falls back to storageManager.getDefaultSettings() (sync, no storage access)
   └── Passed down to both tryResume() and progressTracker.start() below — neither re-reads it
        │
        ▼
4. playerObserver.waitForVideo()
   └── MutationObserver on document.body, resolving once #movie_player > video exists (D-023)
   └── Resolves Promise<HTMLVideoElement>
   └── Rejects after 10s timeout
        │
        ▼
5. storageManager.getProgress(videoId)
   └── Returns VideoProgress | null
        │
        ├── [null] → skip to step 7
        │
        ▼
6a. progressTracker.start(video, videoId, settings) — called *before* tryResume, disarmed
   └── Registers event listeners (pause, seeked, ended, visibilitychange, pagehide); 5s save
       cadence rides navigationManager's tick (D-059), no interval of its own
   └── `armed = false` (v3 Phase 3, D-066/D-091) — any trigger firing during the resume attempt
       below is silently dropped, not queued, so a resume-triggered seek can never be mistaken
       for a user write
        │
        ▼
6b. resumeManager.tryResume(video, savedProgress, videoId, settings)
   └── Rejects saved.time below minWatchSeconds before paying for the metadata wait (D-038/D-043)
   └── Waits for video.duration (loadedmetadata, one retry) and re-checks shouldResume()
   └── Defers until no ad is showing/interrupting, re-deferring if one starts mid-delay (D-019/D-040)
   └── Waits 400ms, baselined for a 10s drift-tolerant abort guard (D-021/D-037)
   └── Sets video.currentTime = resumeTime, verifies within 3s over up to 3 attempts (D-022)
   └── Only on a verified seek: uiInjector.showRestartButton() / showToast(), each settings-gated
   └── Re-asserts the seek once, 500ms after verification, in case a native YouTube resume raced
       and overrode it (v3 Phase 3, D-090/G13)
   └── `finally`: progressTracker.arm() (v3 Phase 3, D-066/D-091) — runs whether tryResume
       resolved, rejected, or found nothing to resume, so tracking is never left permanently
       disarmed
        │
        ▼
7. Tracking is now live and armed; see §3.3 for the per-trigger save flow
```

See §4.4/§4.5 for the full logic each step above is a summary of — this diagram shows sequencing,
not every guard.

### 3.2 Teardown Flow

Executed at the start of each new `onVideoChange` call, before re-initialization.

```
progressTracker.stop()
    └── ticksSinceSave = 0 (D-059 — no interval to clear)
    └── Removes all event listeners (pause, seeked, ended, visibilitychange, pagehide)

uiInjector.cleanup()
    └── clearTimeout(dismissTimer)
    └── Removes button from DOM if still present

playerObserver.disconnect()
    └── Disconnects MutationObserver
```

### 3.3 Progress Save Flow

```
[trigger: interval | pause | seeked | ended | visibilitychange | pagehide]
        │
        ▼
Guard (v3 Phase 3, D-066): armed?
        │
    NO  │  YES
    │   │
    ▼   ▼
 (no-op, │
  dropped)
        ▼
progressTracker reads video.currentTime
        │
        ▼
Guard: adPlaying? liveStream (duration === Infinity)? invalid position
       (NaN current/duration, negative, or current > duration — D-042/D-043)?
       below minWatchSeconds (settings, captured once in start() — D-050)?
        │
    YES │  NO
    │   │
    │   ▼
    │  Is this the interval trigger?
    │        │
    │    YES │  NO (pause/seeked/ended/visibilitychange/pagehide)
    │    │   │
    │    ▼   ▼
    │  abs(currentTime - lastSavedTime) >= 5              save unconditionally
    │  AND NOT a backward jump >30s (v3, D-090)?
    │    │
    │  NO │ YES
    │  │  │
    │  │  ▼
    │  │ storageManager.saveProgress(videoId, currentTime, duration)
    │  │  └── Reads full store
    │  │  └── Upserts entry; preserves existing entry's pinned flag if present (v3 Phase 4)
    │  │  └── Filters to unpinned entries; if that count > 200 → evict oldest unpinned
    │  │       (v3 Phase 4, D-067 — pinned entries are exempt from both the count and
    │  │       the removal-candidate pool)
    │  │  └── Writes back to chrome.storage.local
    │  │
    ▼  ▼
  (no-op)
```

> **Backward-jump guard scope (D-090):** the `>30s` backward-jump rejection applies only to the
> interval trigger's delta check above — a genuine user seek (`seeked` trigger) saves
> unconditionally and its own write updates `lastSavedTime`, which is what exempts the *next*
> interval tick from a false-positive rejection (see D-090's note in `docs/DECISIONS.md`).

> **D-024:** the delta guard applies **only** to the interval trigger. Every event trigger
> (`pause`, `seeked`, `ended`, `visibilitychange`, `pagehide`) saves unconditionally once the
> ad/live-stream/invalid-position guards pass. v1.0 documented the exemption for `pause` and
> `seeked` in this same section while placing the guard inside the shared save function with no
> trigger check — that was the contradiction; it never actually exempted anything. The fix moves
> the delta check to run only when `trigger === 'interval'`.

---

## 4. Module Specifications

> Each module specification defines: **Purpose**, **Public API**, **Internal State**, **Detailed Logic**, and **Error Behavior**.

---

### 4.1 `bootstrap.js`

**Purpose:** Entry point. Owns no logic of its own. Wires all modules together and starts the system.

#### Public API
None. This module is self-executing on load.

#### Behavior

**Phase 7 (Roadmap 7.3, D-049):** settings are read exactly once per navigation, here, before the
resume attempt, and passed down to both `resumeManager.tryResume()` and `progressTracker.start()`.
Neither module re-reads settings itself; `progressTracker`'s 5-second interval reuses the value
captured at `start()`. A settings read failure falls back to `storageManager.getDefaultSettings()`
(a synchronous copy of the defaults, no storage access) and continues — it must never block resume
(Roadmap 7.7).

```javascript
// Pseudo-implementation
async function onVideoChange(videoId) {
  progressTracker.stop();
  uiInjector.cleanup();
  playerObserver.disconnect();

  if (!youtubeUtils.isWatchPage()) return;

  let settings;
  try {
    settings = await storageManager.getSettings();
  } catch (err) {
    console.warn('[YTResume] Settings read failed, using defaults:', err.message);
    settings = storageManager.getDefaultSettings();
  }

  try {
    const videoElement = await playerObserver.waitForVideo();

    if (youtubeUtils.isShorts() || youtubeUtils.isLive(videoElement)) return;

    try {
      const saved = await storageManager.getProgress(videoId);
      if (saved) {
        await resumeManager.tryResume(videoElement, saved, videoId, settings);
      }
    } catch (err) {
      console.warn('[YTResume] Resume pipeline failed:', err.message);
    }

    progressTracker.start(videoElement, videoId, settings);
  } catch (err) {
    console.warn('[YTResume] Player initialization failed:', err.message);
  }
}

navigationManager.start(onVideoChange, () => progressTracker.tick());
```

#### Error Behavior
- If `playerObserver.waitForVideo()` rejects (timeout), log warning and skip resume + tracking for this navigation
- If `storageManager.getSettings()` rejects for any reason (corrupt/missing/unreadable key), fall
  back to `storageManager.getDefaultSettings()` and continue — never block resume (Roadmap 7.7,
  D-049)
- Must not throw uncaught exceptions — all promise chains must have `.catch()`

---

### 4.2 `navigationManager.js`

**Purpose:** Detect YouTube SPA navigation events and emit a normalized `videoChange` callback,
including transitions to and from a non-watch page.

#### Public API

```typescript
navigationManager.start(onVideoChange: (videoId: string | null) => void, onTick?: () => void): void
navigationManager.stop(): void
```

`onTick`, added Phase 9 (D-059), is invoked on every 1000ms poll beat regardless of whether a
navigation occurred. It exists so `progressTracker` can clock its 5s save cadence off this single
interval instead of owning a second one — `navigationManager` remains the sole `setInterval` owner
in the whole content script, matching CLAUDE.md's constraint literally.

#### Internal State

```typescript
let currentVideoId: string | null = null;
let fallbackPollInterval: number | null = null;
let onTickCallback: (() => void) | null = null;
```

#### Detailed Logic

**Rewritten Phase 2 (D-036 — fixes Finding A/leaving-a-watch-page teardown and H8/same-video
re-entry with one change):** emit whenever `getVideoId()` differs from `currentVideoId`,
including the `null` case, rather than only when the new id is truthy.

```javascript
function checkAndEmit() {
  const newId = youtubeUtils.getVideoId();
  if (newId !== currentVideoId) {
    currentVideoId = newId;
    onVideoChange(newId); // may be null — bootstrap's teardown runs either way
    return true;
  }
  return false;
}
```

Leaving a watch page sets `currentVideoId` to `null` and calls `onVideoChange(null)`, which
drives `bootstrap.onVideoChange`'s existing teardown (`progressTracker.stop()`,
`uiInjector.cleanup()`, `playerObserver.disconnect()`) before its `isWatchPage()` check exits
early. Because `currentVideoId` is `null` at that point, returning to the *same* video later is
also seen as a change and re-emits — no special-case code needed for H8.

**Primary detection — `yt-navigate-finish`:** calls `checkAndEmit()` on every event.

**Fallback detection — URL polling:**

Polls every 1000ms, comparing `window.location.href`. Catches edge cases where
`yt-navigate-finish` does not fire (not a 2-second-delayed fallback — it runs continuously
alongside the event listener; `checkAndEmit()`'s own `currentVideoId` comparison makes a
duplicate call from both paths a no-op).

**Initial load handling:**

On `start()`, `checkAndEmit()` runs immediately — if already on a watch page (cold load directly
to a video URL), this emits with the current `videoId`.

#### Error Behavior
- `stop()` must remove all event listeners and clear poll interval

---

### 4.3 `playerObserver.js`

**Purpose:** Detect when the `<video>` element is available inside `#movie_player`. Also exposes ad state detection.

#### Public API

```typescript
playerObserver.waitForVideo(): Promise<HTMLVideoElement>
playerObserver.isAdPlaying(): boolean
playerObserver.disconnect(): void
```

#### Internal State

```typescript
let observer: MutationObserver | null = null;
let timeoutHandle: number | null = null;
```

#### Detailed Logic

**`waitForVideo()`:** (rewritten Phase 2, D-023 — v1.0 rejected immediately if
`#movie_player` was absent, guaranteeing a missed resume on slow cold loads)

```javascript
function waitForVideo(): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const resolveVideo = () => {
      const container = document.querySelector('#movie_player');
      return container ? container.querySelector('video') : null;
    };

    const existing = resolveVideo();
    if (existing) { resolve(existing); return; }

    // Observe document.body broadly: covers #movie_player not existing yet
    // and <video> not existing inside it yet, with one observer.
    observer = new MutationObserver(() => {
      const video = resolveVideo();
      if (video) {
        observer.disconnect();
        clearTimeout(timeoutHandle);
        resolve(video);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    timeoutHandle = setTimeout(() => {
      observer.disconnect();
      reject(new Error('Timeout: <video> not found after 10s'));
    }, 10000);
  });
}
```

**`isAdPlaying()`:**

```javascript
function isAdPlaying(): boolean {
  const player = document.querySelector('#movie_player');
  if (!player) return false;
  return player.classList.contains('ad-showing') ||
         player.classList.contains('ad-interrupting');
}
```

**`disconnect()`:**

Disconnects the `MutationObserver` and cancels the timeout. Safe to call even if already disconnected.

#### Error Behavior
- If `#movie_player` is not yet in the DOM, keep observing `document.body` — do not reject (D-023)
- Only the overall 10s timeout rejects; rejection bubbles up to `bootstrap.js` catch handler

---

### 4.4 `resumeManager.js`

**Purpose:** Validate saved progress against resume conditions and execute the seek. Coordinates with `uiInjector`.

#### Public API

```typescript
resumeManager.tryResume(
  video: HTMLVideoElement,
  saved: VideoProgress,
  videoId: string,
  settings: Settings   // Phase 7 — read once per navigation by bootstrap.js; defaults
                        // below only guard direct/test callers that omit it
): Promise<void>
```

#### Internal Constants

```typescript
const RESUME_DELAY_MS = 400;
const AD_WAIT_CEILING_MS = 60000;   // D-020
const AD_POLL_MS = 250;
const AD_ROUND_MAX_ATTEMPTS = 3;    // bounds the ad-reappears-mid-delay loop below
const DRIFT_TOLERANCE_S = 10;       // D-021
const SEEK_VERIFY_DELAY_MS = 250;   // D-022
const SEEK_TOLERANCE_S = 3;         // D-022
const SEEK_MAX_ATTEMPTS = 3;        // D-022
const NATIVE_OVERRIDE_CHECK_DELAY_MS = 500; // Tier 2 pick — D-090, Roadmap 3.4
```

#### Detailed Logic

Rewritten Phase 2 (D-019 through D-022, D-038); v2 Phase 3 added the minimum-watched short-circuit
below; Phase 7 threaded `settings` through the threshold calls and gated the UI calls at the end
(Roadmap 7.1, 7.4, D-049). v3 Phase 3 (D-066) added the arm/disarm gate this function's completion
now drives (see §4.5) and the native-override re-assert below (D-090).

```javascript
async function tryResume(video, saved, videoId, settings = {}) {
  const minWatchSeconds = settings.minWatchSeconds ?? 30;
  const completionThreshold = settings.completionThreshold ?? 0.95;
  const rewindSeconds = settings.rewindSeconds ?? 2;
  const showToast = settings.showToast ?? true;
  const showRestartButton = settings.showRestartButton ?? true;

  // Duration-independent short-circuit: reject a saved time below the
  // minimum-watched threshold before paying for the metadata wait — no
  // duration value could make shouldResume() true anyway. Found via a live
  // "Metadata wait failed" report on a 19s video that could never resume.
  if (!timeUtils.meetsMinimumWatched(saved.time, minWatchSeconds)) {
    return;
  }

  // Wait for duration to be available; one retry on timeout (D-038 — the 5s
  // timeout is reachable on ordinary connections, not just throttled ones)
  if (!video.duration || isNaN(video.duration)) {
    try {
      await waitForMetadata(video);
    } catch {
      await waitForMetadata(video); // second and final attempt
    }
  }

  if (!timeUtils.shouldResume(saved.time, video.duration, minWatchSeconds, completionThreshold)) {
    return; // Conditions not met — exit silently
  }

  // D-019/PRD §5.7: defer until no ad is present, including an ad that starts
  // mid-delay — loop back to the ad wait rather than evaluate the guard
  // against a stale pre-ad baseline. Bounded by AD_ROUND_MAX_ATTEMPTS.
  let preDelayTime;
  for (let round = 0; ; round++) {
    if (playerObserver.isAdPlaying()) {
      const cleared = await waitForAdClear(); // polls isAdPlaying(), AD_WAIT_CEILING_MS cap
      if (!cleared) return; // abandon cleanly, log warning
    }

    // D-021: baseline before the delay — the guard measures drift from here
    preDelayTime = video.currentTime;
    await delay(RESUME_DELAY_MS);

    if (!playerObserver.isAdPlaying()) break;
    if (round + 1 >= AD_ROUND_MAX_ATTEMPTS) return; // abandon cleanly, log warning
    // else loop: re-defer to the ad wait, then re-baseline preDelayTime
  }

  // Guard: abort only on genuine user seek. Natural playback drift, and
  // YouTube's own native resume landing near the saved position (D-037),
  // must not trip this.
  const driftLimit = preDelayTime + RESUME_DELAY_MS / 1000 + DRIFT_TOLERANCE_S;
  if (video.currentTime > driftLimit) return;

  const resumeTime = timeUtils.getResumeTime(saved.time, rewindSeconds);

  // D-022: verified seek, bounded retry
  const ok = await seekWithVerification(video, resumeTime);

  // PRD §5.6: UI appears only on a verified seek. Showing it after a failed
  // verification would claim a position the video never actually reached.
  if (!ok) {
    console.warn('[YTResume] Seek could not be verified after 3 attempts');
    return;
  }

  // v3 Phase 3 (D-066/3.4): re-assert once against YouTube's own native
  // "continue watching" restore overriding our verified seek.
  await reassertIfNativeOverride(video, resumeTime);

  // Phase 7 (Roadmap 7.4): the seek itself is unconditional — only the UI is
  // settings-gated. Both off means the resume still happens, silently.
  if (showRestartButton) uiInjector.showRestartButton(video, videoId);
  if (showToast) uiInjector.showToast(resumeTime);
}
```

**`reassertIfNativeOverride(video, resumeTime)`:** *(new v3 Phase 3, D-090)*
```javascript
// Waits NATIVE_OVERRIDE_CHECK_DELAY_MS, re-reads currentTime. If it drifted
// past SEEK_TOLERANCE_S from resumeTime, re-assigns currentTime once. A
// second override afterward is accepted silently — no further check, no
// unbounded loop (Roadmap 3.4).
```

**Arm/disarm handoff (v3 Phase 3, D-066):** `bootstrap.js` calls `progressTracker.start()`
(disarmed) *before* this function runs, so its event listeners are live during the resume attempt
but every write is rejected until armed. Once `tryResume()`'s promise settles — success, verified
give-up, or no saved entry to attempt in the first place — `bootstrap.js` calls
`progressTracker.arm()` in a `finally` block. This is a lifecycle gate, not a new delay: it adds no
timer of its own, only sequencing around the existing 400ms delay and seek-verification retry (§4.5).

**`waitForMetadata(video)`:**
```javascript
// Returns Promise that resolves when video.duration is a valid finite number
// Listens for 'loadedmetadata' event with a 5s timeout fallback
```

**`waitForAdClear()`:**
```javascript
// Polls playerObserver.isAdPlaying() every AD_POLL_MS.
// Resolves true once clear, false if AD_WAIT_CEILING_MS elapses first.
```

**`seekWithVerification(video, resumeTime)`:**
```javascript
// Assigns video.currentTime, waits SEEK_VERIFY_DELAY_MS, re-reads.
// Re-assigns if drift > SEEK_TOLERANCE_S, up to SEEK_MAX_ATTEMPTS.
// Returns true if verified within tolerance, false otherwise.
```

#### Error Behavior
- If `video.currentTime` assignment throws mid-verification, catch, log, stop retrying — do not inject Restart button
- If metadata never loads after two attempts (~10s total), skip resume for this video
- If an ad never clears within 60s, skip resume for this video
- Seek verification failing after 3 attempts logs a warning; Restart button/toast are **not** shown (PRD §5.6 — UI requires a verified seek, not just a best-effort one)

---

### 4.5 `progressTracker.js`

**Purpose:** Track playback progress continuously and save it to storage on defined triggers.

#### Public API

```typescript
progressTracker.start(video: HTMLVideoElement, videoId: string, settings: Settings): void
progressTracker.stop(): void
progressTracker.tick(): void
progressTracker.arm(): void                 // v3 Phase 3, D-066
progressTracker.notifyExternalReset(): void  // v3 Phase 3, D-066
```

`tick()`, added Phase 9 (D-059), is called once per 1000ms by `navigationManager`'s existing poll
interval (wired through `bootstrap.js`) rather than `progressTracker` owning its own `setInterval`.
It no-ops when tracking isn't active, and fires `attemptSave(false, 'interval')` every 5th call —
preserving the original 5000ms cadence exactly, just clocked externally.

#### Internal State

```typescript
let ticksSinceSave: number = 0;     // Phase 9 (D-059) — replaces intervalId
let lastSavedTime: number = 0;
let activeVideo: HTMLVideoElement | null = null;
let activeVideoId: string | null = null;
let minWatchSeconds: number = 30;   // Phase 7 — captured once in start(), never re-read
let armed: boolean = false;         // v3 Phase 3 (D-066) — see Detailed Logic below
const BACKWARD_JUMP_THRESHOLD_S = 30; // Tier 2 pick — v3 Phase 3, D-090
```

#### Detailed Logic

**`start(video, videoId, settings)`:** Phase 7 (Roadmap 7.3) — `settings.minWatchSeconds` is
captured into module state here, once per navigation, and reused by every `attemptSave()` call
including the interval-equivalent trigger. It is never re-read from storage inside `tick()`.

```javascript
function start(video, videoId, settings = {}) {
  activeVideo = video;
  activeVideoId = videoId;
  minWatchSeconds = settings.minWatchSeconds ?? 30;
  lastSavedTime = video.currentTime;
  ticksSinceSave = 0;
  armed = false; // v3 Phase 3 (D-066) — disarmed on every load; bootstrap.js
                 // calls arm() once the resume lifecycle resolves (§4.4)

  // No setInterval here (D-059) — tick() is called externally, once per
  // 1000ms, by navigationManager's existing poll interval via bootstrap.js.

  // Event-based triggers — all bypass the delta guard (D-024)
  video.addEventListener('pause',  handlePause);
  video.addEventListener('seeked', handleSeeked);
  video.addEventListener('ended',  handleEnded);
  document.addEventListener('visibilitychange', handleVisibility);
  // pagehide, not beforeunload (D-025) — see §5.4/§7.2, best-effort only
  window.addEventListener('pagehide', handlePagehide);
}
```

**`tick()`:** *(new in v2.0, Phase 9, D-059)* — called once per 1000ms by `navigationManager`'s
poll; a no-op unless tracking is active.

```javascript
function tick() {
  if (!activeVideo || !activeVideoId) return;
  ticksSinceSave += 1;
  if (ticksSinceSave >= 5) {
    ticksSinceSave = 0;
    attemptSave(false, 'interval');
  }
}
```

**`attemptSave(bypassDelta, trigger)`:**

```javascript
function attemptSave(bypassDelta, trigger) {
  if (!activeVideo || !activeVideoId) return;
  if (!armed) return; // v3 Phase 3 (D-066) — no write until the resume lifecycle resolves
  if (playerObserver.isAdPlaying()) return;
  if (activeVideo.duration === Infinity) return; // live stream guard

  const current = Math.floor(activeVideo.currentTime);
  const duration = Math.floor(activeVideo.duration);

  if (Number.isNaN(current) || current < 0 || Number.isNaN(duration) || current > duration) return; // invalid position guard

  // Phase 7 (Roadmap 7.5): no storage entry for a video watched less than
  // minWatchSeconds — same position-based check resumeManager uses.
  if (!timeUtils.meetsMinimumWatched(current, minWatchSeconds)) return;

  // v3 Phase 3 (D-066/3.6, D-090): interval-only regression guard — a large
  // backward jump from the last known-good position is treated as a
  // spurious read (defect C's mechanism), not a real seek, and rejected.
  // Every event trigger (seeked/pause/ended/visibility/pagehide) is exempt
  // by construction: bypassDelta is true for all of them, and a genuine
  // backward seek's own event-triggered save already moved lastSavedTime to
  // the new position before the next interval tick runs, so no separate
  // "recent seek" flag is needed to cover that case.
  if (!bypassDelta && (lastSavedTime - current) > BACKWARD_JUMP_THRESHOLD_S) return;

  if (!bypassDelta && Math.abs(current - lastSavedTime) < 5) return; // delta guard — interval only

  lastSavedTime = current;
  // Captured fresh on every save, not cached in module state — a title/channel
  // capture miss preserves the previously stored value (D-016/D-045), it does
  // not block or delay the save itself.
  const title = youtubeUtils.getTitle();
  const channel = youtubeUtils.getChannelName();
  storageManager.saveProgress(activeVideoId, current, duration, title, channel)
    .catch(err => console.warn('[YTResume] Save failed:', err.message));
}
```

**Event handlers** — all call `attemptSave(true, trigger)`, bypassing the delta guard:

| Handler | Notes |
|---|---|
| `handlePause` | Saves immediately on pause |
| `handleSeeked` | Saves immediately on seek completion |
| `handleEnded` *(new in v2.0)* | Saves the final position on video end; downstream `shouldResume()` declines it (>95% completion) |
| `handleVisibility` | Saves only if `document.hidden === true` |
| `handlePagehide` *(new in v2.0, replaces `handleUnload`/`beforeunload`)* | Best-effort — `chrome.storage.local` is asynchronous and has no synchronous-save capability; the write may not complete before the page is gone (D-025) |

> **D-024:** only the interval trigger passes `bypassDelta = false`. Every event trigger passes
> `true` because each represents meaningful user intent or a definite end-of-session boundary, not
> a periodic check.

**`arm()`:** *(new v3 Phase 3, D-066)* — called once by `bootstrap.js` after `resumeManager.tryResume()`
settles (or immediately if there was no saved entry). Sets `armed = true`; no other side effects.

**`notifyExternalReset()`:** *(new v3 Phase 3, D-090)* — called by `uiInjector.js`'s Restart button
click handler immediately after it forces `video.currentTime = 0`. Resets `lastSavedTime = 0` so
replaying past `minWatchSeconds` afterward isn't mistaken by the backward-jump guard above for a
spurious overwrite of the pre-restart position — an explicit exemption for this specific path (Roadmap
3.6), not a reliance on whatever native `seeked` behavior a programmatic assignment does or doesn't
trigger. Live-verified: without this call, replaying a restarted video past 30s reproduced exactly the
false-positive rejection it exists to prevent.

**`stop()`:**

```javascript
function stop() {
  ticksSinceSave = 0;
  armed = false;

  if (activeVideo) {
    activeVideo.removeEventListener('pause',  handlePause);
    activeVideo.removeEventListener('seeked', handleSeeked);
    activeVideo.removeEventListener('ended',  handleEnded);
  }
  document.removeEventListener('visibilitychange', handleVisibility);
  window.removeEventListener('pagehide', handlePagehide);

  activeVideo = null;
  activeVideoId = null;
  lastSavedTime = 0;
}
```

#### Error Behavior
- All `storageManager.saveProgress()` calls are fire-and-forget with `.catch()` — tracking must never crash the page
- `stop()` is idempotent — safe to call multiple times or before `start()`

#### v4 Phase 3 update (D-139/D-140) — supersedes the code blocks above for this section

`lastSavedTime` split into three markers (Roadmap 3.5), plus session identity and ordering state
(Roadmap 3.1-3.2, 3.6):

```typescript
let committedTime: number = 0;      // position actually confirmed saved (ack'd) — never advanced optimistically
let lastAttemptedTime: number = 0;  // updated synchronously the instant any write is issued — backward-jump-guard baseline
let dirty: boolean = false;         // true from issue until a write for the current value is confirmed committed
let writeSeq: number = 0;
let lastAckedSeq: number = 0;       // out-of-order-ack guard (3.6/T3.5)
let sessionId: string | null = null;      // regenerated every start() — storage-ownership half of the Phase 4 generation token
let lastActiveAt: number = 0;       // wall-clock ms of this session's last meaningfully-active moment
let hasUserSeek: boolean = false;   // true once this session has produced a real 'seeked' event
```

- **Backward-jump guard** now compares against `lastAttemptedTime`, not `committedTime` — a real
  rewind's own `seeked`-triggered save must exempt the very next interval tick even if that write's
  ack hasn't landed yet (pre-existing design intent; the ack-gated marker below must not regress it).
- **Delta guard** (interval trigger only): `!bypassDelta && !dirty && Math.abs(current - committedTime) < 5`.
  `dirty` staying `true` across a failed/unacknowledged attempt is what makes an unchanged position at
  an already-*attempted*-but-not-*confirmed* value retry on the next trigger instead of looking
  saved — closes R24 (F10).
- **`attemptSave()`** now sends a 6th argument to `storageManager.saveProgress()`: `{ sessionId,
  lastActiveAt, explicitUserSeek: hasUserSeek, trigger }`. On resolution, `seq <= lastAckedSeq` is
  ignored (a stale, out-of-order ack); otherwise `lastAckedSeq = seq; committedTime = current`, and
  `dirty` clears only if `seq === writeSeq` (no newer attempt is still outstanding).
- **`recordActivity()`** (new) sets `lastActiveAt = Date.now()`. Called from `start()`, from `tick()`
  only when `!activeVideo.paused`, from the `seeked` and `ended` handlers, and from
  `notifyExternalReset()`. Deliberately **not** called from `pause`/`visibilitychange`/`pagehide` —
  those are exactly the passive lifecycle events F07 found could clobber a fresher checkpoint from an
  actually-active session in another tab.
- **`handleSeeked`** also sets `hasUserSeek = true` before saving. Treating every `seeked` event as
  explicit user intent for Phase 3's freshness override is a deliberate simplification — disambiguating
  a native override's own `seeked` firing from real user intent is Phase 5's job (5.8), not Phase 3's.
- **`notifyExternalReset()`** additionally sets `hasUserSeek = true` and calls `recordActivity()` — the
  Restart button click is itself explicit user intent, same spirit as a real seek.
- **`start()`/`stop()`** reset all of the above (`sessionId` regenerated fresh in `start()`, cleared to
  `null` in `stop()`).

See §4.6a below for the writer-side half of the freshness check.

---

### 4.6 `storageManager.js`

**Purpose:** Typed abstraction over `chrome.storage.local`. Owns all storage read/write/eviction/migration
logic — the ONLY module that may touch `chrome.storage.local` (enforced for both the content script and
the popup, which loads this module too as of Phase 4).

**v4.0.0 (Phase 2, D-102):** every mutating function below (`saveProgress`, `deleteProgress`,
`pinProgress`, `unpinProgress`, `clearAllProgress`, `saveSettings`, `resetSettings`) is now a thin
message client — it sends a command to `background/storageWriter.js` over a `chrome.runtime` port
and resolves/rejects from the worker's response. This module no longer calls
`chrome.storage.local.set`/`.remove` anywhere. Reads (`getProgress`, `getAllProgress`, `getSettings`,
`getDefaultSettings`) are unaffected — still direct, no round trip. The public API and every
function's signature/Promise contract below is unchanged; no caller needed a code change.

Pure validation/repair logic (constants, `sanitizeEntry`, `sanitizeSettingsValue`, `resolveVideoId`,
`mergeEntryPair`, `enforceUnpinnedCap`, `repairStore`, the migration step list) moved out of this
module into `storage/storageValidation.js`, a dependency-free module both this file and
`storageWriter.js` load. `storageManager.js` still calls it for read-side sanitization;
`storageWriter.js` calls it for write-side validation/repair — one shared implementation, not two.

**Messaging client:** a single long-lived `chrome.runtime.connect({ name: 'storageWriter' })` port,
created lazily (and re-created whenever missing) by `getPort()`. Requests carry an incrementing `id`
so out-of-order responses correlate correctly. `sendCommand(command, payload)` retries only a
*transient* failure — the port disconnecting, or a `postMessage` throwing because it was already
dead — with a bounded backoff schedule `[100, 300, 900]` ms (three attempts, Tier 2 value pick); an
*application-level* rejection (the worker responded, just refusing the request — e.g. pin cap
reached) is never retried, since retrying can't change that outcome. Every command is idempotent
(§4.6a), so resending one after an unknown outcome is always safe. `storageManager.js` also calls
`getPort()` once on load — connecting alone is enough to wake a dormant MV3 worker in real Chrome —
so the worker's one-time startup (migrate + repair, now running exclusively there) isn't deferred
until the first real mutation.

#### Public API

```typescript
storageManager.getProgress(videoId: string): Promise<VideoProgress | null>
storageManager.getAllProgress(): Promise<Record<string, VideoProgress>>
storageManager.saveProgress(videoId: string, time: number, duration: number, title?: string, channel?: string): Promise<void>
// rejects if videoId is not a plausible YouTube video ID shape — Roadmap v3 Phase 2, 2.3
storageManager.deleteProgress(videoId: string): Promise<void>
storageManager.clearAllProgress(): Promise<void>
storageManager.pinProgress(videoId: string): Promise<void>   // v3 — Phase 4
// rejects if no entry exists for videoId, or the 20-pin cap is already reached — never auto-unpins
storageManager.unpinProgress(videoId: string): Promise<void> // v3 — Phase 4, no-op if absent/already unpinned
storageManager.getSettings(): Promise<Settings>              // v2 — Phase 6
storageManager.saveSettings(partial: Partial<Settings>): Promise<Settings>  // v2 — Phase 6
storageManager.resetSettings(): Promise<Settings>             // v2 — Phase 6
storageManager.getDefaultSettings(): Settings                 // v2 — Phase 7, sync, no storage access
```

#### Types

```typescript
type VideoProgress = {
  time: number;       // Playback position, seconds (integer)
  duration: number;   // Total video duration, seconds (integer)
  updated: number;    // Unix timestamp in seconds
  title?: string;     // v2 — optional, capped at 200 chars
  channel?: string;   // v2 (Phase 8 polish) — optional, capped at 200 chars
  pinned?: boolean;   // v3 (Phase 4) — optional; absent/false = unpinned, so no
                       // existing v2 entry needs a rewrite
};

type Settings = {
  minWatchSeconds: number;       // default 30
  completionThreshold: number;   // default 0.95
  rewindSeconds: number;         // default 2
  showToast: boolean;            // default true
  showRestartButton: boolean;    // default true
  loadThumbnails: boolean;       // default true
};

type StorageRoot = {
  [videoId: string]: VideoProgress;
};

type QuarantineEntry = {
  entry: unknown;                  // the raw, unsanitized stored value
  reason: 'unresolved-key' | 'malformed-value';
  quarantinedAt: number;           // Unix timestamp, seconds
};

type RepairLogEntry = {
  rawKey: string; canonicalId: string;
  before: { existing: VideoProgress; incoming: VideoProgress };
  after: VideoProgress; at: number;
};

type Quarantine = {                // v4 Phase 1, D-127 — root key youtubeResumeQuarantine
  entries: Record<string, QuarantineEntry>;
  repairLog: RepairLogEntry[];     // bounded to MAX_REPAIR_LOG, newest first
};

const STORAGE_KEY = 'youtubeResume';
const SCHEMA_KEY = 'youtubeResumeSchema';        // v2 — root key, integer, now 3 (Phase 4)
const SETTINGS_KEY = 'youtubeResumeSettings';    // v2 — root key
const QUARANTINE_KEY = 'youtubeResumeQuarantine'; // v4 (Phase 1, D-127) — root key
const MAX_ENTRIES = 200;
const MAX_TITLE_LENGTH = 200;                    // v2
const MAX_PINNED = 20;                           // v3 (Phase 4, D-067) — refused past this, never auto-unpinned
const MAX_REPAIR_LOG = 20;                       // v4 (Phase 1, 1.4) — bounded local retention, not a permanent audit log
const CURRENT_SCHEMA_VERSION = 3;                // v3 (Phase 4, D-071) — bumped exclusively here; unchanged this phase
```

`youtubeResumeQuarantine` is a fourth, additive root key (v4 Phase 1, D-127) — never nested inside
`youtubeResume` (its keys aren't progress entries and must never be counted for the `MAX_ENTRIES`
eviction cap), never read by any resume/tracking/popup code path, and never auto-emptied by this
phase's logic.

`youtubeResumeSchema` and `youtubeResumeSettings` are separate root keys, never nested inside
`youtubeResume` — that object's keys are counted for the `MAX_ENTRIES` eviction cap, so a stray
non-videoId key would corrupt both counting and eviction (D-013).

**Identity invariant (Roadmap v3 Phase 1, D-086):** `videoId` is structurally the sole identity for
a stored entry — the only value ever used as a `youtubeResume` key or in an entry-equality check
anywhere in the codebase. `title` and `channel` are refreshed, display-only metadata on the entry
(`saveProgress`'s preserve-if-omitted fields, D-016/D-045); they are never read for lookup,
comparison, or key derivation by `storageManager`, `navigationManager` (video-change detection,
`checkAndEmit()`, compares `videoId` only), `resumeManager`, `progressTracker`, or `bootstrap.js`.
`popup.js` reads `title`/`channel` only to render row text — never to key or compare entries. A
repo-wide grep for title/channel-based equality or key construction (Roadmap v3 T1.2) returns zero
matches. Confirmed by direct testing: two different `videoId`s sharing an identical title produce two
distinct entries; the same `videoId` saved twice with different title signals produces one entry,
with the second save's title winning for display (Roadmap v3 T1.3/T1.4). This closes the failure
class Phase 0 investigated for defect A/B(secondary) even though neither reproduced against shipped
code — see Roadmap v3 Phase 0 Findings.

#### Detailed Logic

**D-048:** every public function below begins with `assertStorageAvailable()`, a guard that throws
a descriptive error (`"chrome.storage unavailable — extension context invalidated, reload the
page"`) instead of letting `chrome.storage.local` being `undefined` surface as a bare `TypeError`.
Omitted from the pseudocode blocks below for brevity — behavior is otherwise identical, callers
still just see a rejected promise, caught the same way as any other storage failure (§7.2).

**`getProgress(videoId)` / `getAllProgress()` (v4 Phase 1, 1.6 — boundary validation on read):**

Both sanitize every row before returning it via `sanitizeEntry()`: `time` finite and ≥0 (else 0),
`duration` finite and >0 (else 0), `updated` finite, ≥0, and not more than a day beyond "now" (else
0), `title`/`channel` only kept if string-typed (trimmed, capped at `MAX_TITLE_LENGTH`), `pinned` only
kept if literally `true`. A row whose *value* isn't a plain object (`null`, an array, a primitive —
R17-class) is excluded from the result entirely rather than thrown on. This is independent, read-side
defense — it must hold even before `repairDuplicates()` (below) has had a chance to run this load, and
it never writes anything back to storage; a malformed row is not deleted by these calls, only omitted
from what they return.

```javascript
async function getProgress(videoId) {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const raw = (result[STORAGE_KEY] ?? {})[videoId];
  return isPlainObject(raw) ? sanitizeEntry(raw) : null;
}

async function getAllProgress() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const store = result[STORAGE_KEY] ?? {};
  const sanitized = {};
  for (const [key, entry] of Object.entries(store)) {
    if (isPlainObject(entry)) sanitized[key] = sanitizeEntry(entry);
  }
  return sanitized;
}
```

**`saveProgress(videoId, time, duration, title, channel)`:**

Rejects outright (Roadmap v3 2.3) if `videoId` isn't a plausible YouTube video ID shape (an 11-char
`[A-Za-z0-9_-]` token) — no entry is written, no `chrome.storage.local` call is made. Callers already
end this call in `.catch()` (`progressTracker.attemptSave`'s existing convention), so this surfaces as
a logged, silently-handled rejection, never an uncaught error.

```javascript
async function saveProgress(videoId, time, duration, title, channel) {
  if (!isValidVideoId(videoId)) {
    console.warn('[YTResume]', `saveProgress rejected: unresolved videoId (${JSON.stringify(videoId)})`);
    throw new Error(`saveProgress rejected: unresolved videoId (${JSON.stringify(videoId)})`);
  }

  const result = await chrome.storage.local.get(STORAGE_KEY);
  const store = result[STORAGE_KEY] ?? {};
  const existingRaw = store[videoId];
  const existing = isPlainObject(existingRaw) ? existingRaw : null; // R17-class guard

  // Boundary validation on write (v4 Phase 1, 1.6): a finite non-negative
  // time and a positive duration, else 0 — never writes NaN/negative
  // garbage that would corrupt downstream percent/duration math.
  const safeTime = Number.isFinite(time) ? time : 0;
  const safeDuration = Number.isFinite(duration) ? duration : 0;
  const entry = {
    time: safeTime >= 0 ? safeTime : 0,
    duration: safeDuration > 0 ? safeDuration : 0,
    updated: Math.floor(Date.now() / 1000),
  };

  // A missing/failed title or channel capture preserves any previously
  // stored value rather than erasing it (D-016/D-045). channel has no
  // document.title fallback (D-056), so a transient DOM-selector miss on
  // it is more likely, not less — the same preserve-if-omitted rule covers it.
  // A whitespace-only string counts as omitted too (Roadmap v3 2.4
  // write-back guard, D-087) — a bare truthy check would let it through
  // and overwrite a real stored value with blank-looking text. Every save
  // trigger (interval/pause/seeked/ended/visibility/pagehide) funnels
  // through this one function via progressTracker.attemptSave, so the
  // guard covers all of them by construction — there is no second call
  // site that could bypass it.
  const trimmedTitle = typeof title === 'string' ? title.trim() : '';
  const resolvedTitle = trimmedTitle ? trimmedTitle.slice(0, MAX_TITLE_LENGTH) : existing?.title;
  if (resolvedTitle) {
    entry.title = resolvedTitle;
  }

  const trimmedChannel = typeof channel === 'string' ? channel.trim() : '';
  const resolvedChannel = trimmedChannel ? trimmedChannel.slice(0, MAX_TITLE_LENGTH) : existing?.channel;
  if (resolvedChannel) {
    entry.channel = resolvedChannel;
  }

  // Identity invariant (Roadmap v3 Phase 1): videoId is the sole identity
  // for a stored entry. title/channel above are refreshed display-only
  // metadata on that entry — never fall back into this key.
  // A save never changes an existing entry's pinned state (v3 Phase 4).
  if (existing?.pinned) entry.pinned = true;
  store[videoId] = entry;

  // Eviction (v3 Phase 4, D-067) via the shared enforceUnpinnedCap() helper
  // (v4 Phase 1, 1.8) — see below. Counts/selects from unpinned, plain-object
  // entries only; a pinned entry never counts toward the cap.
  enforceUnpinnedCap(store);

  await chrome.storage.local.set({ [STORAGE_KEY]: store });
}
```

**`enforceUnpinnedCap(store)` (v4 Phase 1, 1.8 — shared cap-enforcement helper):**

Mutates `store` in place, evicting the oldest-by-`updated` unpinned entries down to `MAX_ENTRIES`.
Called by `saveProgress` (above), `unpinProgress` (below), and `repairStore` (below) — every operation
that can change eligibility, not only `saveProgress` — so the 200-unpinned invariant holds immediately
after each one, not deferred to the next save.

```javascript
function enforceUnpinnedCap(store) {
  const unpinnedKeys = Object.keys(store).filter(k => isPlainObject(store[k]) && !store[k].pinned);
  if (unpinnedKeys.length <= MAX_ENTRIES) return false;
  const sorted = unpinnedKeys.sort((a, b) => (store[a].updated ?? 0) - (store[b].updated ?? 0));
  sorted.slice(0, unpinnedKeys.length - MAX_ENTRIES).forEach(k => delete store[k]);
  return true;
}
```

**`pinProgress(videoId)` / `unpinProgress(videoId)` (Roadmap v3 Phase 4):**

```javascript
async function pinProgress(videoId) {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const store = result[STORAGE_KEY] ?? {};
  const entry = store[videoId];
  if (!entry) throw new Error(`pinProgress rejected: no entry for videoId (${videoId})`);
  if (entry.pinned) return; // already pinned, no-op

  const pinnedCount = Object.values(store).filter(e => e.pinned).length;
  if (pinnedCount >= MAX_PINNED) {
    throw new Error(`pinProgress rejected: pin cap (${MAX_PINNED}) reached`);
  }

  store[videoId] = { ...entry, pinned: true };
  await chrome.storage.local.set({ [STORAGE_KEY]: store });
}

async function unpinProgress(videoId) {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const store = result[STORAGE_KEY] ?? {};
  const entry = store[videoId];
  if (!isPlainObject(entry) || !entry.pinned) return; // no-op if absent or already unpinned

  const { pinned, ...rest } = entry; // pinned key is only ever present when true
  store[videoId] = rest;
  enforceUnpinnedCap(store); // v4 Phase 1, 1.9/D-112 — see below
  await chrome.storage.local.set({ [STORAGE_KEY]: store });
}
```

A pin attempt past the 20-pin cap is refused outright — the promise rejects, logged the same way as
any other storage rejection (§7.2), and no existing pin is ever auto-unpinned to make room (D-067).
Unpinning is never a rejection case: absent or already-unpinned both no-op.

**Unpin-into-full-library policy (v4 Phase 1, 1.9/D-112):** unpinning while the library already has
`MAX_ENTRIES` (200) unpinned entries immediately evicts the oldest eligible unpinned entry via
`enforceUnpinnedCap()`, consistent with `saveProgress`'s existing eviction rule — the 200-unpinned
invariant is never left exceeded until the next save happens to occur (closes R20/F13).

**`deleteProgress(videoId)`:**

```javascript
async function deleteProgress(videoId) {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const store = result[STORAGE_KEY] ?? {};
  delete store[videoId];
  await chrome.storage.local.set({ [STORAGE_KEY]: store });
}
```

**`clearAllProgress()`:** removes `youtubeResume` only, via `chrome.storage.local.remove(STORAGE_KEY)`,
pinned or not (Roadmap v3 4.5) — pinning protects only against the 200-entry eviction cap, not against
this explicit user action. `youtubeResumeSettings` and `youtubeResumeSchema` are untouched (PRD §7.4).

#### Migration (v1 → v2 → v3, PRD §7.6; chain mechanism — Roadmap v3 Phase 2, D-068)

Runs once, unconditionally, at module load (both content-script and popup contexts load this module,
so whichever loads first performs it). As of Roadmap v3 Phase 2, migration is a **version-aware step
chain** rather than a single "write current version if not equal" check: each step is keyed by the
schema version it advances the store *to*, and each step is independently idempotent — safe to re-run
from any starting version, including one already at or past that step's target. Schema v3 (`pinned`) is
introduced **exclusively in Phase 4** (D-071) — the chain's v2 step (Phase 2) never advertised or
required a v3 shape, so Phases 0–3 alone stay releasable at schema v2:

```javascript
const MIGRATION_STEPS = [
  { to: 2, async run() {} }, // v1 -> v2: purely additive, no entry transform
  { to: 3, async run() {} }, // v2 -> v3: adds optional `pinned`, absent = unpinned, no entry transform
];

async function migrate() {
  try {
    const result = await chrome.storage.local.get([SCHEMA_KEY, SETTINGS_KEY]);
    let version = result[SCHEMA_KEY] ?? 1;
    const toWrite = {};

    for (const step of MIGRATION_STEPS) {
      if (version < step.to) {
        await step.run();
        version = step.to;
        toWrite[SCHEMA_KEY] = version;
      }
    }

    if (!result[SETTINGS_KEY]) {
      toWrite[SETTINGS_KEY] = { ...DEFAULT_SETTINGS };
    }

    if (Object.keys(toWrite).length > 0) {
      await chrome.storage.local.set(toWrite);
    }
  } catch (err) {
    console.warn('[YTResume] Migration failed:', err.message);
  }
}
```

A migration failure logs a warning and the extension continues with in-memory defaults — it never
blocks resume or tracking. Never rewrites, reorders, or deletes an existing `youtubeResume` entry.

#### `resolveVideoId(key)` (v4 Phase 1, 1.1 — hardened)

Returns a canonical video ID only when it's **proven** by exact parsing, never guessed: the trimmed
key itself if it already matches the 11-char ID shape, or the `v=`/path segment of one of two
explicitly supported URL forms (`youtube.com/watch?v=...`, `youtu.be/...`). Everything else — most
importantly a malformed token like a 12+ character key — returns `null`. Earlier (v3 Phase 2) this
function had a substring-match fallback that could rewrite a malformed key to a *different*,
unproven 11-char identity (F11/R16); that fallback is removed outright, not merely narrowed — a key
`resolveVideoId` can't prove is quarantined by the caller (below), never rewritten to a guess.

```javascript
function resolveVideoId(key) {
  if (typeof key !== 'string') return null;
  const trimmed = key.trim();
  if (VIDEO_ID_PATTERN.test(trimmed)) return trimmed;
  const watchMatch = trimmed.match(WATCH_URL_PATTERN);
  if (watchMatch) return watchMatch[1];
  const shortMatch = trimmed.match(SHORT_URL_PATTERN);
  return shortMatch ? shortMatch[1] : null;
}
```

#### Duplicate repair pass & quarantine (Roadmap v3 Phase 2.2, hardened v4 Phase 1)

Runs once per load, chained after `migrate()` resolves (`migrate().then(repairDuplicates)`): scans
`youtubeResume` for keys that don't resolve to a proven video ID and for rows whose *value* isn't a
usable object, merges duplicate rows for the same resolved video ID, and re-enforces the 200-unpinned
cap. Non-destructive by construction — nothing this pass touches is ever deleted outright; a row it
can't safely fold into `youtubeResume` is moved to `youtubeResumeQuarantine` (v4 Phase 1, D-127), a
fourth, additive root key, instead of being dropped or left mixed into `youtubeResume` under its
original (possibly malformed) key.

- A key already shaped like a video ID, or resolvable via an explicitly supported URL form
  (`resolveVideoId`, above), is folded in under its canonical ID.
- A key `resolveVideoId` cannot prove an identity for, or a row whose value isn't a plain object
  (`null`, an array — R17-class), is quarantined: `youtubeResumeQuarantine.entries[rawKey] = { entry,
  reason: 'unresolved-key' | 'malformed-value', quarantinedAt }`. Quarantined data is never
  auto-deleted by this pass, and no code path (resume/tracking/popup) reads from quarantine — it
  exists purely so nothing is silently gone (1.2).
- When two entries resolve to the same canonical ID, they're merged via `mergeEntryPair` (below) and
  the merge is recorded in a bounded (`MAX_REPAIR_LOG` = 20 entries) `repairLog` array under the same
  quarantine root key, newest first — a reversible pre-repair snapshot (1.4), not a permanent audit
  log, so the pre-merge values stay inspectable without a second storage key.
- `enforceUnpinnedCap()` runs on the repaired result before it's returned (1.8) — repair itself can in
  principle change unpinned eligibility (a merge collapses two rows into one, changing counts).
- The store and the quarantine key are written back independently, each only if it actually changed —
  a load with nothing to repair performs no write at all.

```javascript
function repairStore(store, existingQuarantine, nowSeconds) {
  const merged = {};
  const quarantineEntries = { ...(existingQuarantine?.entries ?? {}) };
  const repairLog = [...(existingQuarantine?.repairLog ?? [])];
  let storeChanged = false, quarantineChanged = false;

  function quarantine(key, entry, reason) {
    if (!quarantineEntries[key]) {
      quarantineEntries[key] = { entry, reason, quarantinedAt: nowSeconds };
      quarantineChanged = true;
    }
    storeChanged = true; // the row leaves youtubeResume either way
  }

  for (const [key, entry] of Object.entries(store)) {
    if (!isPlainObject(entry)) { quarantine(key, entry, 'malformed-value'); continue; }
    const canonicalId = resolveVideoId(key);
    if (!canonicalId) { quarantine(key, entry, 'unresolved-key'); continue; }
    if (canonicalId !== key) storeChanged = true;

    const existing = merged[canonicalId];
    if (!existing) { merged[canonicalId] = entry; continue; }
    const mergedEntry = mergeEntryPair(existing, entry);
    repairLog.unshift({ rawKey: key, canonicalId, before: { existing, incoming: entry }, after: mergedEntry, at: nowSeconds });
    if (repairLog.length > MAX_REPAIR_LOG) repairLog.length = MAX_REPAIR_LOG;
    merged[canonicalId] = mergedEntry;
    storeChanged = true;
  }

  if (enforceUnpinnedCap(merged)) storeChanged = true;
  return { store: merged, quarantine: { entries: quarantineEntries, repairLog }, storeChanged, quarantineChanged };
}
```

**`mergeEntryPair(a, b)`:** the **furthest** `time` wins (paired with its own `duration`), the **most
recently `updated`** entry's `title`/`channel` win (falling back to the other entry's value if blank —
same preserve-if-omitted spirit as `saveProgress`, whitespace-only guard included), and `pinned` uses
**OR** semantics — if either side is pinned, the merged entry stays pinned (v4 Phase 1, 1.3 — closes
F11/R15, where the prior version only ever copied `pinned` from whichever entry happened to be
"recent"). Any other, unnamed field survives via an object-spread base so a future additive field
isn't silently dropped by a merge it doesn't know about.

**Known limitation, documented not resolved (v4 Phase 1, 1.5):** furthest-time-wins can revive an old
position — if the canonical entry was deliberately rewound, an unmerged duplicate still sitting at the
old, further-along position wins the comparison and undoes the rewind. Fixing this needs the
session/revision evidence Phase 3 introduces (distinguishing a deliberate seek from simple staleness);
not available at this layer.

#### Error Behavior
- All methods are `async` and will reject if `chrome.storage.local` is unavailable
- Callers must handle rejections — `storageManager` does not swallow errors internally
- `saveProgress` also rejects for an unresolved `videoId` (Roadmap v3 2.3) — logged, not thrown
  uncaught; no entry is written
- `pinProgress` rejects if no entry exists for `videoId`, or if the 20-pin cap is already reached
  (Roadmap v3 4.2, D-067) — logged, not thrown uncaught; never auto-unpins to make room.
  `unpinProgress` never rejects: absent or already-unpinned are both a silent no-op
- `migrate()` and `repairDuplicates()` are the exceptions: both catch and log internally, since they
  run unsupervised at load time and must never block resume or tracking
- `getProgress` returns `null` for any missing key or malformed row — never throws on absence or on a
  `null`/non-object stored value (v4 Phase 1, R17-class)

#### Settings API (v2 — Phase 6; per-field validation added v4 Phase 1, 1.6)

`getSettings()` validates each field individually against an allowed-preset set (or, for the three
boolean settings, an actual-`boolean`-type check) rather than merging the stored object over the
defaults wholesale — a stored value outside its allowed set (a string where a number preset is
expected, `"false"` where a boolean is expected, an out-of-range number, the whole stored value being
an array) falls back to that one field's default without invalidating the other, still-valid fields
(closes R18/F12).

```javascript
const ALLOWED_MIN_WATCH_SECONDS = [10, 30, 60, 120];
const ALLOWED_COMPLETION_THRESHOLD = [0.9, 0.95, 0.98, 1]; // `1` is Phase 7's future "Only at the end" sentinel (D-106)
const ALLOWED_REWIND_SECONDS = [0, 2, 5, 10];
const BOOLEAN_SETTING_KEYS = ['showToast', 'showRestartButton', 'loadThumbnails'];

function sanitizeSettingsValue(raw) {
  const valid = isPlainObject(raw) ? raw : {};
  const out = { ...DEFAULT_SETTINGS };
  if (ALLOWED_MIN_WATCH_SECONDS.includes(valid.minWatchSeconds)) out.minWatchSeconds = valid.minWatchSeconds;
  if (ALLOWED_COMPLETION_THRESHOLD.includes(valid.completionThreshold)) out.completionThreshold = valid.completionThreshold;
  if (ALLOWED_REWIND_SECONDS.includes(valid.rewindSeconds)) out.rewindSeconds = valid.rewindSeconds;
  for (const key of BOOLEAN_SETTING_KEYS) {
    if (typeof valid[key] === 'boolean') out[key] = valid[key];
  }
  return out;
}

async function getSettings() {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return sanitizeSettingsValue(result[SETTINGS_KEY]);
}

async function saveSettings(partial) {
  const current = await getSettings();
  const updated = { ...current, ...partial };
  await chrome.storage.local.set({ [SETTINGS_KEY]: updated });
  return updated;
}

async function resetSettings() {
  const defaults = { ...DEFAULT_SETTINGS };
  await chrome.storage.local.set({ [SETTINGS_KEY]: defaults });
  return defaults;
}

// Phase 7, D-049 — synchronous, no storage access. bootstrap.js falls back
// to this when getSettings() itself rejects (chrome.storage unavailable),
// so a settings failure can never block resume (Roadmap 7.7).
function getDefaultSettings() {
  return { ...DEFAULT_SETTINGS };
}
```

`getSettings()` always merges stored values over `DEFAULT_SETTINGS`, so a missing key (first run) or
a corrupted value (e.g. `youtubeResumeSettings` manually overwritten with a string) can never produce
an undefined setting — the merge falls back to `{}` when the stored value isn't a plain object.
`saveSettings(partial)` reads-merges-writes, so callers only pass the keys that changed.
`resetSettings()` writes `DEFAULT_SETTINGS` verbatim and never touches `youtubeResume` (D-014).

**Pseudocode note (v4 Phase 2):** the mutating-function bodies shown above (`saveProgress`,
`deleteProgress`, `pinProgress`, `unpinProgress`, `clearAllProgress`, `saveSettings`,
`resetSettings`) describe the read-modify-write *logic* each command applies — that logic itself is
unchanged and is exactly what `background/storageWriter.js` now executes (§4.6a) on receiving the
matching command. What moved is only *where* it runs: `storageManager.js`'s own copies of these
bodies are gone, replaced by a `sendCommand(...)` call each (see the messaging-client note above).

### 4.6a `background/storageWriter.js` (v4 Phase 2, D-102)

**Purpose:** MV3 service worker; the sole writer for every `chrome.storage.local` mutation. Holds no
resume/tracking/UI logic and makes zero network requests. Classic (non-`"module"`) worker, so it can
`importScripts('../storage/storageValidation.js')` to reuse the same validation/repair logic
`storageManager.js` uses for reads.

**Command protocol:** one message type per mutation — `SAVE_PROGRESS`, `DELETE_PROGRESS`, `PIN`,
`UNPIN`, `CLEAR_ALL`, `SET_SETTINGS`, `RESET_SETTINGS`, `REPAIR`, `MIGRATE` — each carrying the full
parameters needed to apply it from scratch (no delta/increment commands). A message is
`{ id, command, payload }`; a response is `{ id, ok: true, result }` or `{ id, ok: false, error }`.
`RESET_SETTINGS` is a Tier 2 addition beyond the roadmap's illustrative eight — `resetSettings()`
already existed as a distinct public mutation (v2.0.0 Phase 6) and needed its own full-replace
command rather than overloading `SET_SETTINGS` with a reset flag.

**Serialization (2.3):** a single promise-chain queue (`queueTail`) — each incoming command is
appended via `queueTail.then(task, task)`, so commands always execute one at a time, each seeing the
prior command's already-applied storage state. This ordering, not the queue's persistence, is what
fixes F06 (R13/R14/R19): two commands never interleave their own read-modify-write of the shared
store.

**Startup (2.5):** `let queueTail = runStartup()` — `runStartup()` runs `migrate()` then
`repairDuplicates()` (Phase 1 logic, moved here verbatim) as the queue's first link, so every real
command implicitly waits for it without the client needing a readiness handshake. This runs once per
*worker* lifetime (an MV3 worker can restart many times as the browser idles it out — each restart
reruns startup, which is safe because migrate/repair are idempotent), never once per tab/popup the
way the pre-Phase-2 code did.

**Restart-safety (hard requirement):** the browser can terminate an idle worker at any moment,
including mid-queue. Nothing here is a durability boundary — the queue is pure in-memory ordering,
not a persisted log. Every command is fully described by its own parameters plus whatever chrome.storage.local
already holds, so a fresh worker instance starting a fresh, empty queue loses nothing: anything
"in flight" was either already fully applied (durably, in storage) or never sent. The *client*
(`storageManager.js`) is what retries a command whose outcome is unknown because its port dropped
before a response arrived — safe only because every command here is idempotent.

**Error surface:** a command handler that throws (e.g. `saveProgress` given an unresolved videoId,
or `pinProgress` at the 20-pin cap) responds `{ ok: false, error: err.message }` — the exact same
error text the pre-Phase-2 code threw synchronously, so nothing downstream needed to change how it
reads a rejection's message. A response `postMessage` failing (the port died between finishing the
command and replying) is swallowed — the client's own `onDisconnect` handling covers that case by
retrying the command from scratch.
`getDefaultSettings()` covers the remaining failure mode `getSettings()` can't self-heal: the
`chrome.storage.local.get()` call itself rejecting (not just returning a corrupt value) — see
§4.1's bootstrap fallback.

**v4 Phase 3 addition — write-ownership/freshness check (D-139/D-140):** `SAVE_PROGRESS`'s payload
gains `sessionId`, `lastActiveAt` (ms epoch), `explicitUserSeek`, and `trigger` (see §4.5's Phase 3
addendum for the client side). Before applying a save, `handleSaveProgress` computes:

```javascript
const referenceAtMs = Math.max(
  existing && Number.isFinite(existing.updated) ? existing.updated * 1000 : 0,
  deletionRevisionAt.get(videoId) || 0,
  globalRevisionAt || 0,
);
if (isStaleSave({ lastActiveAt, explicitUserSeek }, referenceAtMs)) throw new Error(/* ... */);
```

`isStaleSave` returns true (reject) only when `!explicitUserSeek && Number.isFinite(lastActiveAt) &&
lastActiveAt < referenceAtMs` — a session that hasn't been meaningfully active since before something
fresher happened for this video (another session's write, or this video's own deletion/a clear-all),
and isn't carrying an explicit user-seek override. This is F07/R23's fix: a stale, backgrounded tab's
lifecycle-event save can no longer clobber a more-recently-active session's checkpoint.

`deletionRevisionAt: Map<videoId, msEpoch>` and `globalRevisionAt: number` are **in-memory,
worker-lifetime only** (Roadmap 3.4 says "in the worker" deliberately) — set by `handleDeleteProgress`
and `handleClearAll` respectively. Modeling a deletion/clear-all as "the freshest possible event for
this video (or all videos) just happened" reuses the exact same freshness comparison to also stop a
stale, unchanged tab from resurrecting a row it doesn't know was just removed (Roadmap 3.4/T3.3),
while a session showing genuine new activity since the deletion — continued playback or a real seek —
can still legitimately recreate the entry, because that *is* genuinely resumed watching. This state is
not persisted: a worker restart in the narrow window between a deletion and a stale tab's next
lifecycle event loses the protection for that one video until fresh activity re-establishes it — an
accepted tradeoff per the file's restart-safety design (nothing here is a durability boundary), not a
data-loss risk.

---

### 4.7 `uiInjector.js`

*(Updated Phase 5 — D-026/D-027/D-028/D-046. Styling values are measured against live YouTube DOM,
see `docs/YT_DOM_AUDIT.md`, not assumed. The v1.0 shape below omitted the toast entirely — it now
ships as `showToast`.)*

**Purpose:** Inject the Restart button and resume toast into YouTube's player, manage their
visibility lifecycle, and handle click behavior.

#### Public API

```typescript
uiInjector.showRestartButton(video: HTMLVideoElement, videoId: string): void
uiInjector.showToast(resumeTime: number): void
uiInjector.cleanup(): void
```

#### Internal State

```typescript
let buttonElement: HTMLElement | null = null;
let dismissTimer: number | null = null;
let toastElement: HTMLElement | null = null;
let toastTimeout: number | null = null;
const DISMISS_DELAY_MS = 7000; // 7 seconds, within the 5–10s spec range
```

#### Detailed Logic

**`showRestartButton(video, videoId)`:**

```javascript
function showRestartButton(video, videoId) {
  removeButton(); // Remove any existing button (not full cleanup — preserve toast)

  const button = document.createElement('button');
  button.id = 'yt-resume-restart-btn';
  button.textContent = '↺ Restart';

  // Styling — measured against live YouTube DOM (docs/YT_DOM_AUDIT.md). No native inline
  // text button exists to copy, so the pill fill/radius are derived from the measured
  // .ytp-menuitem hover intensity and the 40px control-row height.
  const REST_BG = 'rgba(255, 255, 255, 0.1)';
  const HOVER_BG = 'rgba(255, 255, 255, 0.2)';
  Object.assign(button.style, {
    background:     REST_BG,
    border:         'none',
    borderRadius:   '20px',
    color:          '#eeeeee',
    fontSize:       '14px',
    fontFamily:     '"YouTube Noto", Roboto, Arial, Helvetica, sans-serif',
    fontWeight:     '500',
    cursor:         'pointer',
    padding:        '0 12px',
    height:         '40px',
    lineHeight:     '40px',
    display:        'inline-block',
    boxSizing:      'border-box',
    verticalAlign:  'middle',
    transition:     'background-color 0.1s cubic-bezier(0, 0, 0.2, 1)',
  });

  button.addEventListener('mouseover', () => { button.style.background = HOVER_BG; });
  button.addEventListener('mouseout',  () => { button.style.background = REST_BG; });

  button.addEventListener('click', () => {
    video.currentTime = 0;
    storageManager.deleteProgress(videoId)
      .catch(err => console.warn('[YTResume] Delete failed:', err.message));
    cleanup();
  });

  // Inject adjacent to the time display
  const timeDisplay = document.querySelector('.ytp-time-display');
  if (timeDisplay && timeDisplay.parentNode) {
    timeDisplay.parentNode.insertBefore(button, timeDisplay.nextSibling);
    buttonElement = button;
  } else {
    console.warn('[YTResume] Could not find .ytp-time-display — Restart button not injected');
    return;
  }

  // Auto-dismiss
  dismissTimer = setTimeout(() => removeButton(), DISMISS_DELAY_MS);
}
```

**`showToast(resumeTime)`:**

```javascript
function showToast(resumeTime) {
  removeToast();

  const toast = document.createElement('div');
  toast.id = 'yt-resume-toast';
  toast.textContent = `Resumed from ${formatTime(resumeTime)}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  // Styling — measured against live YouTube DOM. Background/radius match the
  // .ytp-settings-menu overlay-chip panel, YouTube's own current chip treatment.
  Object.assign(toast.style, {
    background:     'rgba(0, 0, 0, 0.6)',
    color:          '#eeeeee',
    fontFamily:     '"YouTube Noto", Roboto, Arial, Helvetica, sans-serif',
    fontSize:       '13px',
    fontWeight:     '500',
    padding:        '8px 14px',
    borderRadius:   '12px',
    position:       'absolute',
    left:           '16px',
    zIndex:         '99',
    pointerEvents:  'none',
    opacity:        '0',
    transition:     'opacity 200ms ease-out',
  });

  const player = document.querySelector('#movie_player');
  if (!player) {
    console.warn('[YTResume] Could not find #movie_player — toast not injected');
    return;
  }

  // Derive the vertical offset from the measured control-bar height (D-028) instead of a
  // hard-coded value, so it self-corrects if YouTube resizes the control bar.
  const chromeBottom = player.querySelector('.ytp-chrome-bottom');
  const controlBarHeight = chromeBottom ? chromeBottom.getBoundingClientRect().height : 59;
  toast.style.bottom = `${controlBarHeight + 12}px`;

  player.appendChild(toast);
  toastElement = toast;

  // Fade in (200ms) → hold (1600ms) → fade out (400ms) → remove from DOM
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toastTimeout = setTimeout(() => {
      toast.style.transition = 'opacity 400ms ease-in';
      toast.style.opacity = '0';
      toastTimeout = setTimeout(() => removeToast(), 400);
    }, 200 + 1600);
  });
}
```

**`cleanup()`:**

```javascript
function cleanup() {
  removeButton();
  removeToast();
}
```

#### DOM Injection Notes
- Button and toast are created via `document.createElement` — never via `innerHTML`
- Button injection uses `insertBefore` to preserve surrounding control layout; toast appends into `#movie_player`
- Element IDs `yt-resume-restart-btn` / `yt-resume-toast` allow safe idempotent removal
- Toast is removed from the DOM entirely after fade-out — never left hidden

#### Error Behavior
- If `.ytp-time-display` is not found, log warning and exit without injecting — resume still occurred
- `cleanup()` is idempotent; safe to call multiple times

---

### 4.8 `youtubeUtils.js`

**Purpose:** Pure utility functions for URL and page-type inspection. No side effects.

#### Public API

```typescript
youtubeUtils.isWatchPage(): boolean
youtubeUtils.getVideoId(): string | null
youtubeUtils.isShorts(): boolean
youtubeUtils.isLive(video: HTMLVideoElement): boolean
youtubeUtils.getTitle(): string | null
youtubeUtils.getChannelName(): string | null
```

> This section predates title/channel capture (added D-015/D-016 and Phase 8 polish respectively)
> and is otherwise stale per the doc-routing note at the top of this file — treat everything below
> except `getTitle`/`getChannelName` as historical until the Phase 9 rewrite.

#### Implementations

```javascript
function isWatchPage() {
  return window.location.pathname === '/watch' &&
         new URLSearchParams(window.location.search).has('v');
}

function getVideoId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('v') ?? null;
}

function isShorts() {
  return window.location.pathname.startsWith('/shorts/');
}

function isLive(video) {
  return video.duration === Infinity;
}

// Strips both the trailing " - YouTube" suffix and a leading "(3) "
// unread-notification-count prefix from document.title; falls back to a
// scoped DOM selector, then null. Never throws.
function getTitle() { /* see utils/youtubeUtils.js */ }

// DOM-only — there's no document.title equivalent for channel name.
// Scoped to the primary watch-page metadata box so it can't match a
// channel name inside the comments section. Never throws.
function getChannelName() { /* see utils/youtubeUtils.js */ }
```

---

### 4.9 `timeUtils.js`

**Purpose:** Pure utility functions for resume threshold logic and time calculations. No side effects.

#### Public API

```typescript
timeUtils.shouldResume(savedTime: number, duration: number, minWatchSeconds?: number, completionThreshold?: number): boolean
timeUtils.meetsMinimumWatched(savedTime: number, minWatchSeconds?: number): boolean
timeUtils.getResumeTime(savedTime: number, rewindSeconds?: number): number
```

**Phase 7 (Roadmap 7.1, 7.2, D-049):** every threshold is now a caller-supplied argument, not a
fixed module constant. The constants below became *defaults only*, used when a caller omits the
argument (direct/test callers; production callers always pass the settings-derived value read once
per navigation by `bootstrap.js` — see §4.1, §4.4, §4.5).

#### Implementations

```javascript
// Defaults only — production values come from Settings (storageManager.js §4.6)
const MIN_RESUME_SECONDS   = 30;
const COMPLETION_THRESHOLD = 0.95;
const ROLLBACK_SECONDS     = 2;

// Exposed separately (Phase 3) so resumeManager can reject a saved time
// below the minimum before paying for the metadata wait (D-038) — no
// duration value could make shouldResume() true in that case anyway.
function meetsMinimumWatched(savedTime, minWatchSeconds = MIN_RESUME_SECONDS) {
  return savedTime > minWatchSeconds;
}

function shouldResume(savedTime, duration, minWatchSeconds = MIN_RESUME_SECONDS, completionThreshold = COMPLETION_THRESHOLD) {
  if (!duration || isNaN(duration) || duration === Infinity) return false;
  return meetsMinimumWatched(savedTime, minWatchSeconds) &&
         savedTime < duration * completionThreshold;
}

function getResumeTime(savedTime, rewindSeconds = ROLLBACK_SECONDS) {
  return Math.max(0, savedTime - rewindSeconds);
}
```

---

### 4.10 `popup/popup.js` — Settings Panel (v2 — Phase 6)

**Purpose:** Renders the popup's two views (saved videos list, settings) and wires the settings
controls to `storageManager`. Owns no storage logic of its own — reads/writes go through
`storageManager.getSettings()` / `saveSettings()` / `resetSettings()` (§4.6).

**View switching:** `#view-list` and `#view-settings` are sibling containers inside `.container`,
toggled via a `.hidden` class (`display: none`) — instant replacement, no animation (UX Spec §6.2).
The gear button (`#settings-btn`, CP-31) shows the settings view; the back button (`#back-btn`,
CP-41) restores the list view. Exactly one is visible at a time.

**Segmented controls:** each `.segmented` container carries `data-setting="<key>"`; each `.segment`
button carries `data-value="<value>"`. On click, `Number(dataset.value)` is saved via
`saveSettings({ [key]: value })` and the group re-renders from the returned settings object (not from
the clicked button alone), so the UI always reflects what was actually persisted.

**Toggles:** `.toggle` buttons carry `data-setting="<key>"`, `role="switch"`, and toggle
`aria-checked`/`.active` on click, saving the boolean inverse of their current state.

**No Save button (D7):** every control saves on interaction; `renderSettings(settings)` re-syncs all
controls' visual state after each write, so a save that got merged with concurrent state elsewhere is
never silently misrepresented in the UI.

**Destructive actions:** `Clear saved progress` and `Reset to defaults` each use the inline
confirmation pattern (button hidden, confirmation panel shown in its place) — no `window.confirm()`,
no modal. `Clear saved progress` calls `storageManager.clearAllProgress()` (removes `youtubeResume`
only); `Reset to defaults` calls `storageManager.resetSettings()` (removes/overwrites
`youtubeResumeSettings` only). Each path is wired to a disjoint storage key, which is what makes T6.7
and T6.9 (cross-key isolation) structurally guaranteed rather than merely tested.

**Pinned-count disclosure on clear (v3 — Phase 5/6, D-080):** a module-level `pinnedCount` is kept in
sync with storage without a re-read: seeded from the initial `getAllProgress()` result, incremented/
decremented on each pin/unpin toggle (§4.11) and on deleting a pinned row, and reset to `0` after
`clearAllProgress()` resolves. When the `Clear saved progress` confirmation panel opens and
`pinnedCount > 0`, a `<p id="confirm-pinned-note">` (hidden by default) is unhidden and set to CP-66
(`This includes {p} pinned videos.`, plural) or CP-67 (`This includes 1 pinned video.`, singular);
otherwise it stays hidden. CP-49/CP-50 themselves are unchanged — this is an appended line, not a
rewrite. Closes a gap Phase 5 left open: D-080 specified this in the UX Spec but no Phase 5 task named
it as a code deliverable; Phase 6 built it per CLAUDE.md's "doc is wrong or contradicts the code, fix
it" latitude rather than just flagging the gap in docs (see D-096).

---

### 4.11 `popup/popup.js` — Saved Videos List (v2 — Phase 8)

**Purpose:** Renders `#view-list`, the popup's default view — a scrollable list of every
`youtubeResume` entry, sorted by `updated` descending. Reads through `storageManager.getAllProgress()`
and `getSettings()` (§4.6); owns no storage logic of its own.

**Row construction:** every row is built with `document.createElement` — no `innerHTML` anywhere
(hard constraint, T8.13). Each `<li class="video-row">` contains an `<a class="row-link">` (thumbnail
+ title + progress bar + meta line, whole-row click target) and a sibling `<button class="remove-btn">`
— siblings, not nested, so both are independently reachable by Tab (T8.12) and the remove click can
`preventDefault()` without fighting the anchor's own navigation.

**Thumbnails (D-004/D-005):** the `<img>` element itself is only created when `settings.loadThumbnails`
is true. When it's false, no `<img>` exists in the row at all — not a hidden one, not one with an
unset `src` — because `loading="lazy"` alone does not prevent a request once `src` is set (T8.8).
On load error, the handler removes the `<img>` and adds `.placeholder` to `.thumb-wrap`, whose
background colour is the only visual left (T8.7) — no broken-image icon, no console error from
application code (the browser's own "failed to load resource" network log for a 404 image is
unrelated to and unsuppressible by application code). Thumbnails render at 144×81 (D-055).

**Duration badge and watched-progress line (D-054):** built and appended to `.thumb-wrap` as an
independent step from the `<img>`/placeholder branch above — a `<span class="thumb-duration">` and a
`.thumb-progress-track > .thumb-progress-fill` pair. Because these are plain DOM/text/CSS, not an
image, they render identically whether `loadThumbnails` is on, off, or the thumbnail 404'd; the
precise `{position}/{duration} · {percent}%` numbers stay in `.row-meta` below rather than being
duplicated onto the thumbnail.

**Channel name:** `entry.channel` renders as a `.row-channel` paragraph between the title and meta
line, but only when present — no row is created for a missing channel (older entries, or a
same-session capture miss), so there's no placeholder text to maintain.

**Remove control:** `deleteProgress(videoId)` (§4.6) then a direct DOM removal of that `<li>` and a
count decrement — no full re-render, no re-read from storage (T8.9).

**Empty state:** `#empty-state` and `#video-list` are toggled via the same `.hidden` class used for
view switching; `updateCount(0)` is the single place that decides which is shown.

**Independent progress/settings reads and the load-failure state (v4 Phase 1, 1.7/D-121):**
`getAllProgress()` and `getSettings()` are no longer awaited together in one `Promise.all` — a
settings-read failure must never hide a valid library (CLAUDE.md's graceful-degradation principle:
"if resume fails, tracking still runs" applied to the popup). The progress read runs first, alone,
in its own `try`/`catch`:

```javascript
let store = null;
try {
  store = await storageManager.getAllProgress();
} catch (err) {
  console.warn('[YTResume] Failed to read saved videos:', err);
}

if (store) {
  let settings;
  try {
    settings = await storageManager.getSettings();
  } catch (err) {
    settings = storageManager.getDefaultSettings(); // never blocks the list on a settings failure
  }
  // ...build rows from store using settings, updateCount(entries.length)
} else {
  // #load-failure-state (CP-75/CP-76) — never #empty-state (CP-32/33)
}
```

If `getAllProgress()` itself rejects, `#load-failure-state` (new element, same layout position as
`#empty-state`, UX Spec §6.3) renders instead — CP-75 (`Couldn't load saved videos`) / CP-76
(`Something went wrong reading your saved videos. Try reopening the popup.`). This is a *distinct*
state from `#empty-state`, never conflated with it — `#empty-state`'s CP-32 (`No saved videos yet`)
asserts the library is genuinely empty, which is a specific, false claim when the real problem is that
the read failed. `getSettings()` failing alone never triggers this state; the list still renders
normally against `storageManager.getDefaultSettings()`. No retry button, no auto-retry — reopening the
popup is the existing, sufficient recovery path.

**Render budget (T8.2):** 200 entries render in ~25ms measured via `chrome-devtools-mcp` (D-051/D-052)
— comfortably under the 200ms budget (Roadmap 8.10) — because the list is built once from an
already-fetched object and appended in a single pass, with thumbnails loading progressively after.

**Ko-fi link (D-058):** a static `<a class="kofi-btn">` in `popup.html`'s header, not built by
`popup.js` — no dynamic state, so no reason to construct it at runtime. Inline `<svg>` markup in the
HTML source is not the `innerHTML` API and doesn't trip T8.13's grep.

**Pin control and sort (v3 — Phase 5, D-077/D-078):** each row carries `data-pinned`/`data-updated`
attributes mirroring its `pinned`/`updated` fields. The list is built once, sorted two-tier (pinned
first, then unpinned; `updated` descending within each group) — same single-pass construction as the
v2 build, no separate pass. A `<button class="pin-btn">` (outline glyph unpinned, filled glyph
pinned — both built from one `push_pin` SVG path toggling `fill`/`stroke`, via
`document.createElementNS`, not `innerHTML`) sits as a sibling of `.row-link` and `.remove-btn`,
in that DOM order, so Tab visits link → pin → remove. A persistent `.thumb-pin-badge` (same icon,
always filled) is appended to `.thumb-wrap` only when pinned — independent of row hover, so pinned
state reads without it.

**Pin/unpin re-render (5.7):** `storageManager.pinProgress`/`unpinProgress` resolve, then exactly one
row moves: `li.dataset.pinned`/`updated` are updated, the row is detached and re-inserted by scanning
current sibling `<li>`s' own `data-pinned`/`data-updated` for the first row the moved entry must
precede (`shouldPrecede`) — no other row is touched, no full list rebuild, no re-read from storage
(T5.1/T5.2/T5.7's ~19ms-at-200-entries-with-20-pinned measurement, D-095).

**Pin cap (D-067):** `pinProgress` rejects with a message containing `pin cap` when `MAX_PINNED` (20)
is already reached. `popup.js` matches on that substring to distinguish a cap refusal from any other
rejection; only the cap case shows the CP-65 inline message (`.pin-cap-message`, positioned over the
control's usual spot, auto-removed after 2.5s via `setTimeout`) — any other error just logs a warning,
matching the existing failure-matrix convention (§7.2).

### 4.12 `debugLogger.js`

**Purpose:** Phase 1 (v2.0) reliability-audit instrumentation, loaded first in `manifest.json`'s
`content_scripts` array — `storage/storageManager.js` → `utils/debugLogger.js` → the rest of
`utils/` → `content/*` (CLAUDE.md's load-order rule) — and also included directly in `popup/popup.html`
(D-084) since the popup context loads no content-script bundle. Kept as shipped infrastructure in
v3.0: Roadmap v3 6.1 confirmed it is not removed this release, since removing it would require editing
`manifest.json`/`popup.html`, which is out of scope for a docs-only phase and no v3 phase asked for it.

**Public API:**

```
debugLogger.DEBUG              → boolean   // module-level constant, false in shipped code
debugLogger.log(stage, data?)  → void      // no-op entirely when DEBUG is false
```

**No-op guarantee:** `log()` returns immediately if `DEBUG` is `false` — no `console.log` call, no
`JSON.stringify` of `data`, no observable side effect. This is what makes shipped behaviour identical
to a build with the calls removed outright (§7.1). When `DEBUG` is `true`, `log(stage, data)` prints
`[YTResume] {stage}` followed by `JSON.stringify(data)` if `data` was passed, or just the stage name
if it wasn't.

**Callers (v2.0+):** `resumeManager`, `playerObserver`, `progressTracker`, and `navigationManager`
call it at key decision points (ad state, guard checks, seek verification, save triggers, re-emit
checks) — see §7.1.5 for the full rationale. No v3 module added new call sites; the v3 defect fixes
(Phase 0–3) were diagnosed and verified via `chrome-devtools-mcp` live sampling (D-052) rather than by
extending this module.

**Constraint:** must never ship with `DEBUG = true` (CLAUDE.md hard constraint, §7.1.5).

---

## 5. Inter-Module Contracts

This table defines what each module **consumes** and what it **produces**. No module may import from a module not listed in its "Depends On" column.

| Module | Depends On | Exposes To |
|---|---|---|
| `bootstrap.js` | All modules | Nothing (entry point) |
| `navigationManager.js` | `youtubeUtils.js` | `bootstrap.js` |
| `playerObserver.js` | *(DOM only)* | `bootstrap.js`, `progressTracker.js` |
| `resumeManager.js` | `timeUtils.js`, `uiInjector.js` | `bootstrap.js` |
| `progressTracker.js` | `storageManager.js`, `playerObserver.js` | `bootstrap.js` |
| `storageManager.js` | *(chrome.storage.local only)* | `resumeManager.js`, `progressTracker.js`, `uiInjector.js`, `popup/popup.js` |
| `uiInjector.js` | `storageManager.js` | `resumeManager.js` |
| `youtubeUtils.js` | *(window.location, document.title/DOM)* | `navigationManager.js`, `bootstrap.js`, `progressTracker.js` (title/channel capture, v2) |
| `timeUtils.js` | *(no dependencies)* | `resumeManager.js`, `progressTracker.js` (v2, D-050) |
| `popup/popup.js` *(v2 — Phases 6/8)* | `storageManager.js` | Nothing (leaf; runs in its own document, never in page context) |
| `debugLogger.js` | *(no dependencies)* | `resumeManager.js`, `playerObserver.js`, `progressTracker.js`, `navigationManager.js` (§4.12) |

### 5.1 Generation/Cancellation Contract (v4 Phase 4, F03)

`bootstrap.js` owns a single monotonically increasing `currentGeneration` counter, incremented once
per `onVideoChange()` call. That call captures its own `generation` and derives `isCurrent = () =>
generation === currentGeneration` — a closure passed down to `resumeManager.tryResume()`. Because JS
is single-threaded, comparing a captured number against the shared counter is race-free: once a newer
navigation increments the counter, every older generation's `isCurrent()` becomes `false` forever,
with no possibility of it flipping back.

**Where `isCurrent()` is checked** — after every `await` in `bootstrap.js`'s pipeline, and after every
`await` inside `resumeManager.tryResume()`/`establishContentMetadata()` — before any seek, save, arm
call, or UI insertion:

- After the settings read (a stale navigation's delayed read must never activate as a newer,
  already-initialized navigation's tracker — R21).
- After `playerObserver.waitForVideo()` resolves, paired with `youtubeUtils.getVideoId() === videoId`
  (element-ownership confirmation, F03 4.3) before treating the resolved `<video>` as ready.
- After `storageManager.getProgress()` resolves, before calling `tryResume()`.
- In `onVideoChange()`'s `finally` block, before calling `progressTracker.arm()` — a superseded
  generation's own resume completing must never arm whichever generation is current now (R22).
- Inside `tryResume()`/`establishContentMetadata()`: after the ad wait, after the metadata wait,
  after the resume delay, after `seekWithVerification()`, after `reassertIfNativeOverride()`.

**Settling pending work on teardown** — `onVideoChange()` calls `playerObserver.disconnect()` at the
start of every invocation (teardown of the previous generation). `disconnect()` now rejects any
pending `waitForVideo()` promise instead of leaving it unresolved forever (R12 — the audit found a
20s-later still-unsettled promise here). `resumeManager`'s ad-wait poll (`waitForAdClear()`) also
takes `isCurrent` and checks it on every `AD_POLL_MS` tick — a recursive `setTimeout` chain, not a
second `setInterval` (§1.3's one-interval constraint) — so leaving a watch page during an ad settles
that wait within one tick instead of running for up to the full 60s ceiling (T4.2).

**Element ownership vs. metadata freshness (F04, T4.4)** — `bootstrap.js` also tracks the `<video>`
element and its `duration` seen at the start of the previous navigation. If a new navigation resolves
the *same* element with the *same* (non-NaN) `duration` it had before, that's a signal the element may
still carry the previous content's metadata even though it looks superficially valid — `tryResume()`
is passed `forceMetadataRefresh = true` and `establishContentMetadata()` gives the element one bounded
`REUSED_ELEMENT_REFRESH_MS` (1000ms) chance to fire a real `loadedmetadata` event before trusting the
carried-over value. Eligibility itself is always resolved against confirmed post-ad content metadata,
never an ad's duration — ad deferral runs *before* `shouldResume()`, not after (F04/R5); a mid-roll ad
interrupting the resume delay re-runs `establishContentMetadata()` and aborts if the revalidated
duration disagrees with what eligibility was originally decided against, rather than seeking against a
stale decision.

---

## 6. State Management

There is no global state object. Each module manages its own internal state privately. State is reset on teardown and re-initialized on each navigation event.

### 6.1 Per-Session State Lifecycle

| State | Owner | Initialized | Reset |
|---|---|---|---|
| `currentVideoId` | `navigationManager` | On `yt-navigate-finish` | On next navigation |
| Active `MutationObserver` | `playerObserver` | On `waitForVideo()` call | On `disconnect()` |
| `fallbackPollInterval` | `navigationManager` | On `start()` | On `stop()` — sole `setInterval` in the extension (D-059) |
| `ticksSinceSave` *(v2 — Phase 9, D-059)* | `progressTracker` | On `start()` | On `stop()` |
| `lastSavedTime` | `progressTracker` | On `start()` | On `stop()` |
| `minWatchSeconds` *(v2 — Phase 7)* | `progressTracker` | On `start()`, from `settings` param | On `stop()`, back to the 30s default |
| `buttonElement` | `uiInjector` | On `showRestartButton()` | On `cleanup()` or click |
| `dismissTimer` | `uiInjector` | On `showRestartButton()` | On `cleanup()` or click |
| `armed` *(v3 — Phase 3, D-066)* | `progressTracker` | `false` on `start()`; `true` via `arm()` after the resume lifecycle resolves | On `stop()`, back to `false` |
| `currentGeneration` *(v4 — Phase 4, F03)* | `bootstrap.js` | `0`, incremented once per `onVideoChange()` call | Never reset — monotonically increasing for the life of the content script (§5.1) |
| `lastVideoElement`/`lastVideoDuration` *(v4 — Phase 4, F04)* | `bootstrap.js` | `null` | Overwritten each navigation with the current `<video>`/`duration`, once past the identity check (§5.1) |

### 6.2 Persistent State

Persistent state lives in `chrome.storage.local` under three root keys (v2, PRD §7.2): `youtubeResume`
(videoId → `VideoProgress`, unchanged from v1), `youtubeResumeSettings` (user preferences), and
`youtubeResumeSchema` (integer schema version, currently `3` as of v3.0 Phase 4, D-071 — `pinned` is
the only field it adds, optional and defaulting to unpinned). The latter two are siblings of
`youtubeResume`, never nested inside it, since its keys are counted for the 200-entry eviction cap
(D-013). No module other than `storageManager.js` may read from or write to `chrome.storage.local`
directly — this now also covers the popup, which loads `storage/storageManager.js` as of Phase 4
instead of calling `chrome.storage.local` itself.

**Settings propagation (v2 — Phase 7, Roadmap 7.3, 7.6):** `bootstrap.js` reads `Settings` from
`storageManager.getSettings()` exactly once per navigation and passes the object to
`resumeManager.tryResume()` and `progressTracker.start()` as a parameter — neither module reads
storage itself. This means a setting changed in the popup while a YouTube tab is already open takes
effect on that tab's *next* navigation, not live; there is no mechanism (message passing, storage
listener) for pushing a change into an already-running session, by design.

---

## 7. Error Handling Strategy

### 7.1 Principles

1. **The extension must never crash the host page.** All module code runs in a try/catch context or uses `.catch()` on all Promises.
2. **Failures are silent to the user.** No alerts, toasts, or UI errors are shown for internal failures.
3. **Failures are logged to console.** Prefixed with `[YTResume]` for easy filtering in DevTools.
4. **Graceful degradation is always preferred.** If resume fails, tracking must still proceed. If tracking fails, the page continues to work normally.
5. **Diagnostic tracing (Phase 1+).** `utils/debugLogger.js` exposes a module-level `DEBUG` constant
   (default `false`) and a `log(stage, data)` helper that no-ops entirely when `DEBUG` is false, so
   shipped behaviour is unaffected. `resumeManager`, `playerObserver`, `progressTracker`, and
   `navigationManager` call it at key decision points (ad state, guard checks, seek verification,
   save triggers, re-emit checks) to make reliability issues reproducible without behaviour
   changes. Must never be committed with `DEBUG = true` — reconfirmed gated (not removed) at the
   end of v2.0 Phase 9 (Roadmap 9.1) and again reconfirmed shipped-as-is for v3.0 (Roadmap v3 6.1,
   §4.12).

### 7.2 Failure Matrix

| Failure | Module | Behavior |
|---|---|---|
| `#movie_player` not yet in DOM | `playerObserver` | Observe `document.body` until it appears (D-023); only the 10s overall timeout rejects |
| `<video>` not detected within 10s | `playerObserver` | Reject with timeout error; bootstrap skips gracefully |
| Ad active when resume would start | `resumeManager` | Defer seek until ad clears; 60s ceiling then abandon cleanly (D-019/D-020) |
| Ad starts during the 400ms delay | `resumeManager` | Re-defer to the ad wait and re-baseline, rather than evaluate the drift guard against a stale baseline; abandons only after 3 such rounds |
| `chrome.storage.local.get` fails | `storageManager` | Reject; caller skips resume (no saved data treated as absent) |
| `chrome.storage.local.set` fails | `storageManager` | Reject; progressTracker logs and continues — data loss acceptable |
| `currentTime` is `NaN`, negative, or exceeds `duration` at save time | `progressTracker` | Skip the save silently on every trigger; not logged as an error |
| `pagehide` fires before the write completes | `progressTracker` | Best-effort only — no synchronous save API exists; `visibilitychange → hidden` is the more reliable backstop (D-025) |
| `video.currentTime` assignment throws | `resumeManager` | Catch; skip Restart button injection; log warning |
| Seek lands >3s off target after 3 attempts | `resumeManager` | Log warning; skip Restart button/toast entirely — never claim a position the video didn't reach (PRD §5.6) |
| `video.duration` is NaN or 0 | `resumeManager` | Wait for `loadedmetadata`; 5s timeout, one retry (~10s total); skip if still unresolved (D-038) |
| `.ytp-time-display` not in DOM | `uiInjector` | Log warning; skip injection; resume still occurred |
| `yt-navigate-finish` never fires | `navigationManager` | Fallback URL polling activates after 1s |
| Leaving a watch page for a non-watch page | `navigationManager` | Emits `null`; bootstrap tears down tracking/UI/observer (D-036) |
| Returning to the same video after leaving | `navigationManager` | Re-emits (currentVideoId was reset to `null` on leaving); bootstrap re-initializes (D-036) |
| Rapid successive navigations | `bootstrap` | Each navigation calls teardown before init; last navigation wins |
| `storageManager.getSettings()` rejects (corrupt/missing/unreadable `youtubeResumeSettings`, or `chrome.storage` unavailable) | `bootstrap` | Fall back to `storageManager.getDefaultSettings()`; warn only; resume and tracking proceed with defaults (Roadmap 7.7, D-049, T7.10) |

---

## 8. DOM Reference & Selectors

These selectors are subject to change if YouTube updates its player markup. If a selector fails, the failing module must log a warning with the selector name for rapid diagnosis.

| Element | Selector | Used By | Notes |
|---|---|---|---|
| Player container | `#movie_player` | `playerObserver` | Root for MutationObserver |
| Video element | `video` *(inside #movie_player)* | All | Main playback target |
| Ad active — pre-roll | `.ad-showing` on `#movie_player` | `playerObserver`, `progressTracker` | Class present during ad |
| Ad active — mid-roll | `.ad-interrupting` on `#movie_player` | `playerObserver`, `progressTracker` | Class present during mid-roll |
| Controls left bar | `.ytp-left-controls` | `uiInjector` | Parent context of injection zone |
| Time display | `.ytp-time-display` | `uiInjector` | Restart button injected as next sibling; font/color values sourced from it (measured, `YT_DOM_AUDIT.md`) |
| Control bar | `.ytp-chrome-bottom` | `uiInjector` | Height read at runtime to derive toast `bottom` offset (D-028); measured `59px`, stable across default/theater |
| Settings menu panel | `.ytp-settings-menu` | `uiInjector` (reference only, not queried at runtime) | Source of the toast's measured `background`/`border-radius` values |

---

## 9. Performance Budget

| Metric | Limit | Implementation |
|---|---|---|
| Active interval timers | **1 max** | `navigationManager` owns the sole `setInterval` (1s URL-polling fallback, permanent for the life of the content script). `progressTracker` has no interval of its own — its 5s save cadence rides on `navigationManager`'s tick via `progressTracker.tick()`, counting to 5 (D-059, fixed Phase 9; a pre-v2 second interval existed until then) |
| Active MutationObservers | **1 max** | `playerObserver` disconnects after video found |
| `chrome.storage.local` writes/min | **≤ 12** | One per 5s interval; capped by delta guard |
| DOM elements injected | **2 max** | Restart button + toast (v2 — D-029 promoted the toast from optional to required); both auto-removed, independently settings-gated |
| Memory footprint | **< 5MB** | No large data structures; storage capped at 200 entries |
| Network requests (content script) | **0** | Strictly prohibited — unchanged in v2 |
| Network requests (popup) | **≤ 1 per visible thumbnail** | `<img src>` GET to `i.ytimg.com` only, only when `loadThumbnails` is on (D-004/D-005/D-006) — the only network request permitted anywhere in the extension |
| External scripts | **0** | No CDN dependencies |
| CPU overhead | **Negligible** | No animation loops, no heavy computation |

---

## 10. Implementation Order

This is the original v1.0 build sequence — module-by-module, not the same "Phase" numbering as
`docs/ROADMAP_v2.md`'s nine v2.0.0 phases. Kept as a historical record of build order; it is not a
re-statement of the v2.0.0 roadmap. Modules should be implemented in the following sequence to allow incremental testing at each step. Each phase is independently verifiable before proceeding.

| Phase | Modules | Verification |
|---|---|---|
| **1 — Foundation** | `youtubeUtils.js`, `timeUtils.js` | Unit tests pass for all pure functions |
| **2 — Storage** | `storageManager.js` | Manual: write/read/delete via DevTools → Application → Storage |
| **3 — Navigation** | `navigationManager.js` | Console log on video change detected; SPA navigation verified |
| **4 — Player Detection** | `playerObserver.js` | Console log when `<video>` resolves; timeout verified |
| **5 — Resume** | `resumeManager.js` | Seek occurs at correct time after 400ms delay |
| **6 — Tracking** | `progressTracker.js` | Storage updates every 5s visible in DevTools |
| **7 — UI** | `uiInjector.js` | Restart button appears, auto-dismisses, resets to 0:00 on click |
| **8 — Bootstrap** | `bootstrap.js` | Full end-to-end flow verified across navigation events |

---

## 11. Testing Strategy

There is no test runner in this project (CLAUDE.md) — every table below is a manual verification
script, run in Chrome via Load Unpacked. §11.3 is the original v1.0 regression baseline and is kept
as-is; §11.1/§11.2 gain v2 rows below for the modules/scenarios that didn't exist in v1.0 (settings,
saved videos panel, title/channel capture). Nothing in the added rows contradicts §11.3 — they cover
net-new surface area, not replacements. §11.1/§11.2 gain a further set of v3 rows below for the
storage-integrity fixes, the resume-arm/write-guard gate, and pinning (Roadmap v3 Phases 2–5); each
was self-verified this session by the methods named in its Notes column of D-085 through D-095
(`docs/DECISIONS.md`) rather than left as an unexecuted script — the tables below record what to
re-run on a future regression pass, not open work.

### 11.1 Unit Tests (Pure Modules)

Target: `youtubeUtils.js`, `timeUtils.js`, `storageManager.js`

| Module | Test Case | Input | Expected Output |
|---|---|---|---|
| `youtubeUtils` | Watch page | `/watch?v=abc123` | `isWatchPage() → true` |
| `youtubeUtils` | Shorts page | `/shorts/abc123` | `isWatchPage() → false`, `isShorts() → true` |
| `youtubeUtils` | Home page | `/` | `isWatchPage() → false` |
| `youtubeUtils` | Extract videoId | `/watch?v=dQw4w9WgXcQ` | `getVideoId() → 'dQw4w9WgXcQ'` |
| `timeUtils` | Below minimum | `savedTime=20, duration=3600` | `shouldResume() → false` |
| `timeUtils` | Above completion | `savedTime=3500, duration=3600` | `shouldResume() → false` |
| `timeUtils` | Valid resume | `savedTime=1200, duration=3600` | `shouldResume() → true` |
| `timeUtils` | Resume time | `savedTime=100` | `getResumeTime() → 98` |
| `timeUtils` | Resume time floor | `savedTime=1` | `getResumeTime() → 0` |
| `storageManager` | Write + read | Save `{time:100, duration:3600}` | Read back same values |
| `storageManager` | Eviction | Insert 201 entries | Only 200 remain; oldest removed |
| `storageManager` | Delete | Save then delete videoId | `getProgress() → null` |
| `storageManager` | Missing key | `getProgress('nonexistent')` | Returns `null` |
| `timeUtils` *(v2)* | Minimum-watched short-circuit | `meetsMinimumWatched(20, 30)` | `false` — rejects before any duration is known (D-038/D-043) |
| `youtubeUtils` *(v2)* | Title suffix strip | `document.title = "My Video - YouTube"` | `getTitle() → "My Video"` |
| `youtubeUtils` *(v2)* | Title notification-count strip | `document.title = "(3) My Video - YouTube"` | `getTitle() → "My Video"` (D-057) |
| `youtubeUtils` *(v2)* | Title parenthetical preserved | `document.title = "(Official Video) - YouTube"` | Leading `(Official Video)` is **not** stripped — only a digit-only prefix matches (D-057) |
| `storageManager` *(v2)* | Settings merge over defaults | `getSettings()` with no stored key | Returns `DEFAULT_SETTINGS` verbatim |
| `storageManager` *(v2)* | Settings self-heal | `youtubeResumeSettings` manually set to a string | `getSettings()` still returns a full valid `Settings` object |
| `storageManager` *(v2)* | Title/channel preserved on omission | `saveProgress(id, t, d)` after a prior save had a title | Existing `title`/`channel` untouched (D-016/D-045) |
| `storageManager` *(v3)* | Whitespace-only title/channel not written back | `saveProgress(id, t, d, '   ', '   ')` after a prior save had a real title | Existing `title`/`channel` untouched, not overwritten with blanks (D-087) |
| `storageManager` *(v3)* | Schema migration chain, v1→v3 | Seed a v1-shape (no `title`, no schema key) profile, call `migrate()` | Lands cleanly on schema 3; no entry dropped or rewritten beyond the version key (D-093, T4.1) |
| `storageManager` *(v3)* | Schema migration chain, v2→v3 | Seed a v2-shape profile (`youtubeResumeSchema: 2`), call `migrate()` | Lands on schema 3; existing entries gain no `pinned` field until explicitly pinned (D-071/D-093) |
| `storageManager` *(v3)* | Duplicate-merge pass is non-destructive | Seed two entries for the same `videoId` under any legacy shape | Merges into one entry; never deletes a distinct `videoId`'s entry (D-065, T2.2/T2.3/T2.7) |
| `storageManager` *(v3)* | Pin cap enforced | `pinProgress()` 21 times across 21 distinct saved videos | 21st call rejects (`pin cap` in error message); the first 20 remain pinned (D-067/D-093, T4.4) |
| `storageManager` *(v3)* | Eviction exempts pinned entries | 20 pinned + 200 unpinned entries, then one more `saveProgress()` | Only an unpinned entry is evicted; all 20 pins survive (D-093, T4.6) |
| `storageManager` *(v3)* | `clearAllProgress` removes pins too | Seed pinned entries, call `clearAllProgress()` | `youtubeResume` is fully empty, including pinned entries (D-093, T4.8) |
| `progressTracker` *(v3)* | Backward-jump write guard | Interval tick fires with `currentTime` >30s behind `lastSavedTime`, no intervening seek | Save is skipped (D-090); a genuine seek's own `seeked`-triggered save is not blocked (its `lastSavedTime` already advanced) |
| `progressTracker` *(v3)* | Disarmed-on-load gate | Call any tracked event before `arm()` has been called | Write is silently dropped, not queued (D-066/D-091) |

### 11.2 Integration Test Scenarios

| # | Scenario | Steps | Expected Behavior |
|---|---|---|---|
| I1 | Basic resume | Watch 5min of 1hr video, close tab, reopen | Resumes at ~5min |
| I2 | Crash recovery | Watch 10min, force-quit browser, reopen video | Resumes within 5s of last position |
| I3 | Below threshold | Watch 20s, close tab, reopen | Plays from beginning |
| I4 | Near completion | Watch 97% of video, close, reopen | Plays from beginning |
| I5 | Post-seek resume | Seek to 30min, watch 2min, close tab, reopen | Resumes at ~32min |
| I6 | Shorts ignored | Open a `/shorts/` URL | No resume logic, no tracking |
| I7 | Live stream ignored | Open a live stream | No resume logic, no tracking |
| I8 | Restart button | After resume, click ↺ Restart | Resets to 0:00; storage entry deleted |
| I9 | Restart auto-dismiss | After resume, wait 7s | Restart button removed from DOM |
| I10 | SPA navigation | Navigate from video A to video B | A's tracking stops; B's tracking starts |
| I11 | Ad handling | Video with pre-roll ad | Resume fires after ad; ad progress not tracked |
| I12 | Multiple tabs | Open same video in two tabs | Last-write-wins; no crash |
| I13 *(v2)* | Ad starts mid-resume-delay | Trigger an ad that begins during the 400ms resume delay | Resume re-defers to the ad wait and re-baselines, up to 3 rounds, instead of aborting (D-040) |
| I14 *(v2)* | Settings change, existing tab | Change `minWatchSeconds` in the popup while a video tab is open | No effect on that tab until its next navigation (§6.2) — takes effect on next video load, not live |
| I15 *(v2)* | Saved videos panel — remove | Open popup, click remove on a row | Row disappears immediately; entry deleted from `youtubeResume`; no full re-render (T8.9) |
| I16 *(v2)* | Saved videos panel — thumbnails off | Turn off `loadThumbnails`, reopen popup | No `<img>` elements exist in any row; zero `i.ytimg.com` requests (T8.8) |
| I17 *(v2)* | Clear vs. Reset key independence | `Clear saved progress`, then check settings | `youtubeResume` empty; `youtubeResumeSettings` unchanged (T6.7); reverse also holds for `Reset to defaults` (T6.9) |
| I18 *(v3)* | Resume attempt doesn't self-clobber | Navigate to a video with saved progress; observe the resume seek | The resume-triggered `seeked` event is silently dropped by the disarmed gate, not written back as a new (near-zero) save (D-066/D-091) |
| I19 *(v3)* | Restart rebases the write guard | Click Restart, then watch past `minWatchSeconds` | First post-restart interval save succeeds; not rejected as a false-positive backward jump from the stale pre-restart position (D-092, T3.8) |
| I20 *(v3)* | Pin/unpin moves exactly one row | Open popup with a mixed pinned/unpinned list, toggle pin on one row | That row alone re-sorts into the correct group boundary; storage matches DOM after the toggle (D-095, T5.1/T5.2) |
| I21 *(v3)* | Pin-limit-reached refusal | With 20 videos already pinned, attempt to pin a 21st | CP-65 inline message shown, auto-dismisses ~2.5s later; no entry becomes pinned (D-079/D-095, T5.3) |
| I22 *(v3)* | Clear-all pinned disclosure | Pin at least one video, click `Clear saved progress` | Confirmation panel shows CP-50 plus CP-66/CP-67 naming the pinned count; confirming still deletes pinned entries too (D-080, §4.10) |

### 11.3 Manual QA Checklist

**Storage verification (DevTools → Application → Extension Storage):**
- [ ] Entry created on first 5s interval
- [ ] `time` updates every ~5 seconds
- [ ] `updated` timestamp increments on each save
- [ ] Entry count never exceeds 200
- [ ] Entry removed after Restart button click

**Resume behavior:**
- [ ] Resume fires on tab close + reopen
- [ ] Resume fires after browser restart
- [ ] Resume does not fire for videos < 30s in
- [ ] Resume does not fire for videos > 95% complete
- [ ] Resume timestamp is 2 seconds before last saved position

**UI:**
- [ ] Restart button appears only when resume occurred
- [ ] Restart button is visually consistent with YouTube controls
- [ ] Restart button does not shift other controls
- [ ] Restart button disappears after 5–10 seconds
- [ ] Clicking Restart seeks to 0:00
- [ ] Clicking Restart clears storage entry
- [ ] No Restart button on non-resume page loads

**Navigation:**
- [ ] Tracking initializes on cold load to a watch URL
- [ ] Tracking reinitializes on SPA navigation to new video
- [ ] Previous video's interval is cancelled on navigation
- [ ] Extension is silent on `/shorts/`, `/live`, `/playlist`, non-YouTube pages

**Stability:**
- [ ] No console errors during 20-minute watch session
- [ ] No console errors across 10 SPA navigations
- [ ] Memory stable after 20+ navigations (Chrome Task Manager)

---

## 12. Constraints & Gotchas

### 12.1 YouTube-Specific Constraints

| Constraint | Detail |
|---|---|
| **SPA architecture** | YouTube never triggers `DOMContentLoaded` on navigation. Only `yt-navigate-finish` is reliable. |
| **Player init race** | `video.currentTime = X` called immediately after video detection will be silently overridden by YouTube's internal player init. The 400ms delay is non-negotiable. |
| **Shared video element** | Ads and main content use the same `<video>` element. `video.currentTime` during an ad reflects ad position, not video position. Always check `isAdPlaying()` before acting on currentTime. |
| **Dynamic controls DOM** | YouTube sometimes reconstructs the player controls DOM (e.g., during fullscreen, quality change). If the Restart button parent node is removed, the button disappears early — this is acceptable behavior. |
| **`video.duration` availability** | Duration is `NaN` until the browser has fetched enough metadata. Do not read `duration` immediately after video element detection. |

### 12.2 Manifest V3 Constraints

| Constraint | Detail |
|---|---|
| **No background page** | Manifest V3 replaces background pages with service workers. This extension requires neither — all logic runs in the content script. |
| **`chrome.storage.local` from content scripts** | Fully supported in content scripts under MV3. No messaging to a background worker required. |
| **CSP restrictions** | No inline `<script>` injection. All DOM manipulation uses `document.createElement`. |

### 12.3 Known Limitations (v2.0, carried into v3.0)

| Limitation | Accepted? | Future Fix |
|---|---|---|
| Up to 5 seconds of progress can be lost on unclean shutdown | ✅ Accepted | The 5s interval stays hard-coded by design in v2 (D-007) — not user-configurable, not reduced |
| Restart button may not inject if YouTube restructures `.ytp-time-display` | ✅ Accepted | Selector monitoring; re-measured once against live DOM in Phase 5 (`YT_DOM_AUDIT.md`), not automated |
| No cross-device sync | ✅ Accepted | `chrome.storage.sync` or backend in future |
| Last-write-wins on multi-tab (no conflict resolution) | ✅ Accepted | Sufficient for typical use |
| A setting changed in the popup does not take effect on an already-open YouTube tab until its next navigation | ✅ Accepted | No message-passing/storage-listener push exists by design (§6.2) |
| Thumbnail `<img>` requests to `i.ytimg.com` break the v1.0 absolute zero-network claim | ✅ Accepted, has an off switch | `loadThumbnails` setting, default on (D-004/D-005); privacy policy/store listing updates still **OPEN** (D-032/D-033), due before publishing, not before Phase 9 |

### 12.4 Known Limitations (v3.0)

| Limitation | Accepted? | Future Fix |
|---|---|---|
| 20-pin cap is not user-configurable | ✅ Accepted | Small fixed limit by design (D-067), consistent with the six-settings/200-entry-cap philosophy |
| Pin-limit-reached inline message (CP-65, `.pin-cap-message`) is not wrapped in `aria-live`, so a screen-reader user gets no announcement of the refusal | ❌ Gap, not yet fixed | Found during Phase 6 doc reconciliation (D-097, UX Spec §8.3); needs a code change, out of scope for a docs-only phase |
| Backward-jump write guard (D-090) only protects interval-triggered saves; a pathological caller writing directly through `storageManager.saveProgress()` with a backward timestamp outside the tracked event flow is not guarded | ✅ Accepted | No such caller exists in shipped code; documented as a boundary of the fix, not a residual bug |

---

*This document is the authoritative technical specification for YouTube Resume v3.0.0, reconciled
against shipped code in v2.0 Phase 9 (D-030) and again in v3.0 Phase 6 (Roadmap v3 6.6). Per
CLAUDE.md's precedence rules, this TDD outranks the UX Spec, Roadmap, and PRD for implementation
detail — but shipped code outranks all four; where a future discrepancy is found, fix the
code-affecting doc and log a Tier 2 decision in `DECISIONS.md`, don't silently drift. §11.3's v1.0
manual QA checklist is kept intact as the regression baseline (see §11 intro) — nothing elsewhere in
this document should be read as superseding it.*
