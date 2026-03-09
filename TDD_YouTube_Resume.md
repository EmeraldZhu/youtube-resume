# Technical Design Document
## YouTube Resume — Chrome Extension

---

| Field | Detail |
|---|---|
| **Product** | YouTube Resume |
| **Document Type** | Technical Design Document (TDD) |
| **Version** | 1.0.0 |
| **Status** | Draft — Ready for Implementation |
| **Last Updated** | 2026-03-09 |
| **Companion Document** | PRD_YouTube_Resume.md v1.0.0 |

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

YouTube Resume is implemented entirely as a **Manifest V3 Chrome content script**. There is no background service worker, no popup, and no options page in v1.0. All logic runs within the YouTube page context, isolated by Chrome's default content script sandbox.

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
| Background script | None required |
| Popup | None in v1.0 |
| Options page | None in v1.0 |

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
├── storage/
│   └── storageManager.js       # chrome.storage.local abstraction
│
├── utils/
│   ├── youtubeUtils.js         # URL parsing, videoId extraction
│   └── timeUtils.js            # Threshold math, resume calculations
│
└── assets/
    └── icons/
        ├── icon16.png
        ├── icon48.png
        └── icon128.png
```

**Design rationale:**
- `content/` contains all runtime logic that executes in-page
- `storage/` is isolated to make it independently testable and swappable
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
4. playerObserver.waitForVideo()
   └── MutationObserver on #movie_player
   └── Resolves Promise<HTMLVideoElement> when <video> appears
   └── Rejects after 10s timeout
        │
        ▼
5. storageManager.getProgress(videoId)
   └── Returns VideoProgress | null
        │
        ├── [null] → skip to step 7
        │
        ▼
6. resumeManager.tryResume(video, savedProgress)
   └── Validates resume conditions
   └── Waits 400ms
   └── Sets video.currentTime = resumeTime
   └── Calls uiInjector.showRestartButton(video, videoId)
        │
        ▼
7. progressTracker.start(video, videoId)
   └── Registers interval + event listeners
   └── Saves progress via storageManager on each trigger
```

### 3.2 Teardown Flow

Executed at the start of each new `onVideoChange` call, before re-initialization.

```
progressTracker.stop()
    └── clearInterval(intervalId)
    └── Removes all event listeners (pause, seeked, visibilitychange, beforeunload)

uiInjector.cleanup()
    └── clearTimeout(dismissTimer)
    └── Removes button from DOM if still present

playerObserver.disconnect()
    └── Disconnects MutationObserver
```

### 3.3 Progress Save Flow

```
[trigger: interval | pause | seeked | visibilitychange | beforeunload]
        │
        ▼
progressTracker reads video.currentTime
        │
        ▼
Guard: abs(currentTime - lastSavedTime) >= 5 ?
        │
    NO  │  YES
    │   │
    │   ▼
    │  storageManager.saveProgress(videoId, currentTime, duration)
    │   └── Reads full store
    │   └── Upserts entry
    │   └── Checks entry count > 200 → evict oldest
    │   └── Writes back to chrome.storage.local
    │
    ▼
  (no-op)
```

---

## 4. Module Specifications

> Each module specification defines: **Purpose**, **Public API**, **Internal State**, **Detailed Logic**, and **Error Behavior**.

---

### 4.1 `bootstrap.js`

**Purpose:** Entry point. Owns no logic of its own. Wires all modules together and starts the system.

#### Public API
None. This module is self-executing on load.

#### Behavior

```javascript
// Pseudo-implementation
function init() {
  navigationManager.start((videoId) => {
    // Teardown previous session
    progressTracker.stop();
    uiInjector.cleanup();
    playerObserver.disconnect();

    if (!youtubeUtils.isWatchPage()) return;

    playerObserver.waitForVideo()
      .then(async (videoElement) => {
        const saved = await storageManager.getProgress(videoId);

        if (saved) {
          await resumeManager.tryResume(videoElement, saved, videoId);
        }

        progressTracker.start(videoElement, videoId);
      })
      .catch((err) => {
        console.warn('[YTResume] Player not detected:', err.message);
      });
  });
}

init();
```

#### Error Behavior
- If `playerObserver.waitForVideo()` rejects (timeout), log warning and skip resume + tracking for this navigation
- Must not throw uncaught exceptions — all promise chains must have `.catch()`

---

### 4.2 `navigationManager.js`

**Purpose:** Detect YouTube SPA navigation events and emit a normalized `videoChange` callback.

#### Public API

```typescript
navigationManager.start(onVideoChange: (videoId: string) => void): void
navigationManager.stop(): void
```

#### Internal State

```typescript
let currentVideoId: string | null = null;
let fallbackPollInterval: number | null = null;
```

#### Detailed Logic

**Primary detection — `yt-navigate-finish`:**

```javascript
document.addEventListener('yt-navigate-finish', () => {
  const newId = youtubeUtils.getVideoId();
  if (newId && newId !== currentVideoId) {
    currentVideoId = newId;
    onVideoChange(newId);
  }
});
```

**Fallback detection — URL polling:**

Used only if `yt-navigate-finish` does not fire within 2 seconds of a detected URL change. This accounts for potential future YouTube structural changes.

```javascript
// Poll every 1000ms; compare window.location.href
// If videoId changes and yt-navigate-finish has not already fired for this ID → emit
```

**Initial load handling:**

On `start()`, check immediately if the current page is already a watch page (cold load directly to a video URL). If so, emit `onVideoChange` immediately with the current `videoId`.

#### Error Behavior
- If `getVideoId()` returns null (non-watch page), do not emit — silently skip
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

**`waitForVideo()`:**

```javascript
function waitForVideo(): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const container = document.querySelector('#movie_player');
    if (!container) {
      reject(new Error('Player container #movie_player not found'));
      return;
    }

    // Check if already present
    const existing = container.querySelector('video');
    if (existing) { resolve(existing); return; }

    observer = new MutationObserver(() => {
      const video = container.querySelector('video');
      if (video) {
        observer.disconnect();
        clearTimeout(timeoutHandle);
        resolve(video);
      }
    });

    observer.observe(container, { childList: true, subtree: true });

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
- If `#movie_player` is not found in the DOM, reject immediately with a descriptive error
- Timeout rejection bubbles up to `bootstrap.js` catch handler

---

### 4.4 `resumeManager.js`

**Purpose:** Validate saved progress against resume conditions and execute the seek. Coordinates with `uiInjector`.

#### Public API

```typescript
resumeManager.tryResume(
  video: HTMLVideoElement,
  saved: VideoProgress,
  videoId: string
): Promise<void>
```

#### Internal Constants

```typescript
const RESUME_DELAY_MS = 400;
```

#### Detailed Logic

```javascript
async function tryResume(video, saved, videoId) {
  // Wait for duration to be available
  if (!video.duration || isNaN(video.duration)) {
    await waitForMetadata(video); // resolves on 'loadedmetadata'
  }

  if (!timeUtils.shouldResume(saved.time, video.duration)) {
    return; // Conditions not met — exit silently
  }

  // Buffer for YouTube player initialization race
  await delay(RESUME_DELAY_MS);

  // Guard: if user has already manually seeked during delay, abort
  if (video.currentTime > 5) return;

  const resumeTime = timeUtils.getResumeTime(saved.time);

  try {
    video.currentTime = resumeTime;
  } catch (err) {
    console.warn('[YTResume] Seek failed:', err.message);
    return;
  }

  uiInjector.showRestartButton(video, videoId);
}
```

**`waitForMetadata(video)`:**
```javascript
// Returns Promise that resolves when video.duration is a valid finite number
// Listens for 'loadedmetadata' event with a 5s timeout fallback
```

#### Error Behavior
- If `video.currentTime` assignment throws, catch and log — do not inject Restart button
- If metadata never loads (5s timeout), skip resume for this video

---

### 4.5 `progressTracker.js`

**Purpose:** Track playback progress continuously and save it to storage on defined triggers.

#### Public API

```typescript
progressTracker.start(video: HTMLVideoElement, videoId: string): void
progressTracker.stop(): void
```

#### Internal State

```typescript
let intervalId: number | null = null;
let lastSavedTime: number = 0;
let activeVideo: HTMLVideoElement | null = null;
let activeVideoId: string | null = null;
```

#### Detailed Logic

**`start(video, videoId)`:**

```javascript
function start(video, videoId) {
  activeVideo = video;
  activeVideoId = videoId;
  lastSavedTime = video.currentTime;

  // Core interval
  intervalId = setInterval(() => attemptSave(), 5000);

  // Event-based triggers
  video.addEventListener('pause',        handlePause);
  video.addEventListener('seeked',       handleSeeked);
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('beforeunload', handleUnload);
}
```

**`attemptSave()`:**

```javascript
function attemptSave() {
  if (!activeVideo || !activeVideoId) return;
  if (playerObserver.isAdPlaying()) return;
  if (activeVideo.duration === Infinity) return; // live stream guard

  const current = Math.floor(activeVideo.currentTime);
  const duration = Math.floor(activeVideo.duration);

  if (Math.abs(current - lastSavedTime) < 5) return; // delta guard

  lastSavedTime = current;
  storageManager.saveProgress(activeVideoId, current, duration)
    .catch(err => console.warn('[YTResume] Save failed:', err.message));
}
```

**Event handlers** — all call `attemptSave()` directly:

| Handler | Notes |
|---|---|
| `handlePause` | Saves immediately on pause (no delta guard) |
| `handleSeeked` | Saves immediately on seek completion (no delta guard) |
| `handleVisibility` | Saves only if `document.hidden === true` |
| `handleUnload` | Saves synchronously using `chrome.storage.local` (best-effort) |

> **Note:** `pause` and `seeked` bypass the delta guard because they represent meaningful user intent, not a periodic check.

**`stop()`:**

```javascript
function stop() {
  clearInterval(intervalId);
  intervalId = null;

  if (activeVideo) {
    activeVideo.removeEventListener('pause',  handlePause);
    activeVideo.removeEventListener('seeked', handleSeeked);
  }
  document.removeEventListener('visibilitychange', handleVisibility);
  window.removeEventListener('beforeunload', handleUnload);

  activeVideo = null;
  activeVideoId = null;
  lastSavedTime = 0;
}
```

#### Error Behavior
- All `storageManager.saveProgress()` calls are fire-and-forget with `.catch()` — tracking must never crash the page
- `stop()` is idempotent — safe to call multiple times or before `start()`

---

### 4.6 `storageManager.js`

**Purpose:** Typed abstraction over `chrome.storage.local`. Owns all storage read/write/eviction logic.

#### Public API

```typescript
storageManager.getProgress(videoId: string): Promise<VideoProgress | null>
storageManager.saveProgress(videoId: string, time: number, duration: number): Promise<void>
storageManager.deleteProgress(videoId: string): Promise<void>
```

#### Types

```typescript
type VideoProgress = {
  time: number;       // Playback position, seconds (integer)
  duration: number;   // Total video duration, seconds (integer)
  updated: number;    // Unix timestamp in seconds
};

type StorageRoot = {
  [videoId: string]: VideoProgress;
};

const STORAGE_KEY = 'youtubeResume';
const MAX_ENTRIES = 200;
```

#### Detailed Logic

**`getProgress(videoId)`:**

```javascript
async function getProgress(videoId) {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const store = result[STORAGE_KEY] ?? {};
  return store[videoId] ?? null;
}
```

**`saveProgress(videoId, time, duration)`:**

```javascript
async function saveProgress(videoId, time, duration) {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const store = result[STORAGE_KEY] ?? {};

  store[videoId] = {
    time,
    duration,
    updated: Math.floor(Date.now() / 1000),
  };

  // Eviction: trim to MAX_ENTRIES before writing
  const keys = Object.keys(store);
  if (keys.length > MAX_ENTRIES) {
    const sorted = keys.sort((a, b) => store[a].updated - store[b].updated);
    const toRemove = sorted.slice(0, keys.length - MAX_ENTRIES);
    toRemove.forEach(k => delete store[k]);
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: store });
}
```

**`deleteProgress(videoId)`:**

```javascript
async function deleteProgress(videoId) {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const store = result[STORAGE_KEY] ?? {};
  delete store[videoId];
  await chrome.storage.local.set({ [STORAGE_KEY]: store });
}
```

#### Error Behavior
- All methods are `async` and will reject if `chrome.storage.local` is unavailable
- Callers must handle rejections — `storageManager` does not swallow errors internally
- `getProgress` returns `null` for any missing key — never throws on absence

---

### 4.7 `uiInjector.js`

**Purpose:** Inject the Restart button into YouTube's player controls, manage its visibility lifecycle, and handle click behavior.

#### Public API

```typescript
uiInjector.showRestartButton(video: HTMLVideoElement, videoId: string): void
uiInjector.cleanup(): void
```

#### Internal State

```typescript
let buttonElement: HTMLElement | null = null;
let dismissTimer: number | null = null;
const DISMISS_DELAY_MS = 7000; // 7 seconds, within the 5–10s spec range
```

#### Detailed Logic

**`showRestartButton(video, videoId)`:**

```javascript
function showRestartButton(video, videoId) {
  cleanup(); // Remove any existing button first

  const button = document.createElement('button');
  button.id = 'yt-resume-restart-btn';
  button.textContent = '↺ Restart';

  // Styling — match YouTube's control bar aesthetics
  Object.assign(button.style, {
    background:     'none',
    border:         'none',
    color:          '#ffffff',
    fontSize:       '12px',
    fontFamily:     'Roboto, Arial, sans-serif',
    fontWeight:     '500',
    cursor:         'pointer',
    padding:        '0 8px',
    lineHeight:     '1',
    opacity:        '0.9',
    verticalAlign:  'middle',
    letterSpacing:  '0.01em',
  });

  button.addEventListener('mouseover', () => { button.style.opacity = '1'; });
  button.addEventListener('mouseout',  () => { button.style.opacity = '0.9'; });

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
  dismissTimer = setTimeout(() => cleanup(), DISMISS_DELAY_MS);
}
```

**`cleanup()`:**

```javascript
function cleanup() {
  clearTimeout(dismissTimer);
  dismissTimer = null;

  if (buttonElement && buttonElement.parentNode) {
    buttonElement.parentNode.removeChild(buttonElement);
  }
  buttonElement = null;
}
```

#### DOM Injection Notes
- Button is created via `document.createElement` — never via `innerHTML`
- Injection uses `insertBefore` to preserve surrounding control layout
- Button ID `yt-resume-restart-btn` allows safe idempotent removal

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
```

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
```

---

### 4.9 `timeUtils.js`

**Purpose:** Pure utility functions for resume threshold logic and time calculations. No side effects.

#### Public API

```typescript
timeUtils.shouldResume(savedTime: number, duration: number): boolean
timeUtils.getResumeTime(savedTime: number): number
```

#### Implementations

```javascript
// Constants
const MIN_RESUME_SECONDS   = 30;
const COMPLETION_THRESHOLD = 0.95;
const ROLLBACK_SECONDS     = 2;

function shouldResume(savedTime, duration) {
  if (!duration || isNaN(duration) || duration === Infinity) return false;
  return savedTime > MIN_RESUME_SECONDS &&
         savedTime < duration * COMPLETION_THRESHOLD;
}

function getResumeTime(savedTime) {
  return Math.max(0, savedTime - ROLLBACK_SECONDS);
}
```

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
| `storageManager.js` | *(chrome.storage.local only)* | `resumeManager.js`, `progressTracker.js`, `uiInjector.js` |
| `uiInjector.js` | `storageManager.js` | `resumeManager.js` |
| `youtubeUtils.js` | *(window.location only)* | `navigationManager.js`, `bootstrap.js` |
| `timeUtils.js` | *(no dependencies)* | `resumeManager.js` |

---

## 6. State Management

There is no global state object. Each module manages its own internal state privately. State is reset on teardown and re-initialized on each navigation event.

### 6.1 Per-Session State Lifecycle

| State | Owner | Initialized | Reset |
|---|---|---|---|
| `currentVideoId` | `navigationManager` | On `yt-navigate-finish` | On next navigation |
| Active `MutationObserver` | `playerObserver` | On `waitForVideo()` call | On `disconnect()` |
| `intervalId` | `progressTracker` | On `start()` | On `stop()` |
| `lastSavedTime` | `progressTracker` | On `start()` | On `stop()` |
| `buttonElement` | `uiInjector` | On `showRestartButton()` | On `cleanup()` or click |
| `dismissTimer` | `uiInjector` | On `showRestartButton()` | On `cleanup()` or click |

### 6.2 Persistent State

All persistent state lives in `chrome.storage.local` under the key `youtubeResume`. No module other than `storageManager.js` may read from or write to `chrome.storage.local` directly.

---

## 7. Error Handling Strategy

### 7.1 Principles

1. **The extension must never crash the host page.** All module code runs in a try/catch context or uses `.catch()` on all Promises.
2. **Failures are silent to the user.** No alerts, toasts, or UI errors are shown for internal failures.
3. **Failures are logged to console.** Prefixed with `[YTResume]` for easy filtering in DevTools.
4. **Graceful degradation is always preferred.** If resume fails, tracking must still proceed. If tracking fails, the page continues to work normally.

### 7.2 Failure Matrix

| Failure | Module | Behavior |
|---|---|---|
| `#movie_player` not found | `playerObserver` | Reject promise; log warning; bootstrap skips resume + tracking |
| `<video>` not detected within 10s | `playerObserver` | Reject with timeout error; bootstrap skips gracefully |
| `chrome.storage.local.get` fails | `storageManager` | Reject; caller skips resume (no saved data treated as absent) |
| `chrome.storage.local.set` fails | `storageManager` | Reject; progressTracker logs and continues — data loss acceptable |
| `video.currentTime` assignment throws | `resumeManager` | Catch; skip Restart button injection; log warning |
| `video.duration` is NaN or 0 | `resumeManager` | Wait for `loadedmetadata`; timeout 5s; skip if unresolved |
| `.ytp-time-display` not in DOM | `uiInjector` | Log warning; skip injection; resume still occurred |
| `yt-navigate-finish` never fires | `navigationManager` | Fallback URL polling activates after 2s |
| Rapid successive navigations | `bootstrap` | Each navigation calls teardown before init; last navigation wins |

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
| Time display | `.ytp-time-display` | `uiInjector` | Restart button injected as next sibling |

---

## 9. Performance Budget

| Metric | Limit | Implementation |
|---|---|---|
| Active interval timers | **1 max** | `progressTracker` owns the sole `setInterval` |
| Active MutationObservers | **1 max** | `playerObserver` disconnects after video found |
| `chrome.storage.local` writes/min | **≤ 12** | One per 5s interval; capped by delta guard |
| DOM elements injected | **1** | Restart button only; auto-removed |
| Memory footprint | **< 5MB** | No large data structures; storage capped at 200 entries |
| Network requests | **0** | Strictly prohibited |
| External scripts | **0** | No CDN dependencies |
| CPU overhead | **Negligible** | No animation loops, no heavy computation |

---

## 10. Implementation Order

Modules should be implemented in the following sequence to allow incremental testing at each step. Each phase is independently verifiable before proceeding.

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

### 12.3 Known Limitations (v1.0)

| Limitation | Accepted? | Future Fix |
|---|---|---|
| Up to 5 seconds of progress can be lost on unclean shutdown | ✅ Accepted | Reduce interval (v2 consideration) |
| Restart button may not inject if YouTube restructures `.ytp-time-display` | ✅ Accepted | Selector monitoring in v2 |
| No cross-device sync | ✅ Accepted | `chrome.storage.sync` or backend in future |
| Last-write-wins on multi-tab (no conflict resolution) | ✅ Accepted | Sufficient for typical use |

---

*This document is the authoritative technical specification for YouTube Resume v1.0. All implementation decisions should trace back to requirements defined in the companion PRD. Discrepancies between this TDD and the PRD must be resolved in the PRD first, then reflected here.*
