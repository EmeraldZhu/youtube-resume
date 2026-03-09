# Product Requirements Document
## YouTube Resume — Chrome Extension

---

| Field | Detail |
|---|---|
| **Product Name** | YouTube Resume |
| **Product Type** | Chrome Extension (Manifest V3) |
| **Version** | 1.0.0 |
| **Status** | Draft — Ready for Engineering |
| **Last Updated** | 2026-03-09 |
| **Owner** | Product |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Non-Goals](#3-goals--non-goals)
4. [Target Users & Use Cases](#4-target-users--use-cases)
5. [Functional Requirements](#5-functional-requirements)
6. [Technical Architecture](#6-technical-architecture)
7. [Data Model & Storage](#7-data-model--storage)
8. [Error Handling & Edge Cases](#8-error-handling--edge-cases)
9. [Performance Requirements](#9-performance-requirements)
10. [Privacy & Security](#10-privacy--security)
11. [Testing Requirements](#11-testing-requirements)
12. [Release Criteria](#12-release-criteria)
13. [Future Roadmap](#13-future-roadmap)
14. [Appendix](#14-appendix)

---

## 1. Executive Summary

YouTube Resume is a lightweight Chrome extension that silently tracks a user's playback position across YouTube videos and automatically resumes from exactly where they left off — regardless of how the session ended. There is no configuration required, no accounts, and no visible interface until the moment it becomes useful.

The product philosophy is **invisible until needed, reliable always**. Inspired by the principle that the best tool is one you never have to think about, YouTube Resume should feel less like a feature and more like a behavior YouTube always should have had.

---

## 2. Problem Statement

### 2.1 Background

YouTube's native watch history and resume functionality is tied to a signed-in Google account, operates inconsistently across sessions, and fails entirely in the following common scenarios:

- Browser crash or force-quit
- Computer restart or shutdown
- Accidental tab closure
- Signed-out sessions
- Slow or failed watch history sync
- Long-form content (podcasts, lectures, full-length documentaries)

### 2.2 User Pain

> *"I was 45 minutes into a 2-hour lecture when my browser crashed. When I came back, YouTube had no idea where I was."*

Users of long-form content — the exact audience YouTube has been aggressively growing into — suffer the most from this gap. Losing your place in a 90-minute tutorial or a 3-hour podcast is a meaningfully frustrating experience that erodes platform trust.

### 2.3 Opportunity

A persistent, local, session-agnostic resume mechanism can close this gap entirely. Because it operates at the browser level — independently of YouTube's account infrastructure — it is reliable by design.

---

## 3. Goals & Non-Goals

### 3.1 Goals

| # | Goal |
|---|---|
| G1 | Automatically resume any YouTube video from the last known position |
| G2 | Persist progress across browser crashes, restarts, and tab closures |
| G3 | Require zero user configuration or interaction to function |
| G4 | Be invisible and non-disruptive during normal playback |
| G5 | Provide a single, unobtrusive escape hatch: a "Restart" button that auto-dismisses |
| G6 | Store all data locally — no network calls, no accounts |
| G7 | Work reliably on YouTube's SPA navigation model |

### 3.2 Non-Goals (v1.0)

| # | Non-Goal | Rationale |
|---|---|---|
| NG1 | Cross-device sync | Requires backend; out of scope for v1 |
| NG2 | Resume for Shorts, live streams, or embeds | Incompatible with resume semantics |
| NG3 | Visible UI beyond the Restart button | Contradicts invisible-by-default philosophy |
| NG4 | A settings or configuration page | No user-tunable behavior in v1 |
| NG5 | Analytics or telemetry | Privacy non-negotiable |
| NG6 | Firefox or Safari support | Chrome-first; extension model differs |

---

## 4. Target Users & Use Cases

### 4.1 Primary Users

| Persona | Description | Key Need |
|---|---|---|
| **The Student** | Watches long university lectures and tutorials | Never loses place mid-lecture |
| **The Developer** | Watches multi-hour coding tutorials | Precise resume, no scrubbing |
| **The Podcast Listener** | Uses YouTube as a podcast client | Resume like a podcast app would |
| **The Casual Binge Viewer** | Watches documentary series or long essays | Tab closed accidentally → resume seamlessly |

### 4.2 Core Use Cases

#### UC-1: Crash Recovery
**Given** a user is 37 minutes into a 90-minute video  
**When** their browser crashes  
**Then** on reopening the video, playback resumes at ~37 minutes automatically

#### UC-2: Multi-Session Viewing
**Given** a user watches 20 minutes of a lecture and closes their laptop  
**When** they return the next morning and reopen the video  
**Then** playback resumes from where they left off

#### UC-3: Accidental Tab Close
**Given** a user accidentally closes a YouTube tab mid-video  
**When** they navigate back to the video  
**Then** playback resumes; no scrubbing required

#### UC-4: Restart Option
**Given** a user has resumed a video  
**When** they want to watch from the beginning (e.g., a music video)  
**Then** a temporary "↺ Restart" button is present for 5–10 seconds that resets to 0:00

#### UC-5: Near-Complete Video
**Given** a user has watched 97% of a video  
**When** they reopen it  
**Then** the extension does not attempt to resume (video is considered complete)

---

## 5. Functional Requirements

### 5.1 Page Activation

The extension activates **only** on YouTube watch pages.

**Supported URL pattern:**
```
https://www.youtube.com/watch?v=*
```

**Explicitly excluded patterns:**

| Pattern | Reason |
|---|---|
| `/shorts/*` | Resume semantics don't apply to short-form content |
| `/live/*` | Live streams have no fixed duration |
| `/embed/*` | Embedded players are third-party contexts |
| `/playlist` | Playlist-level tracking is out of scope |

---

### 5.2 Video Element Detection

YouTube is a Single Page Application. The `<video>` DOM element is **not guaranteed to exist on page load** and is injected asynchronously by YouTube's player.

**Detection strategy:**
- Attach a `MutationObserver` to `#movie_player`
- Resolve when a `<video>` element appears inside the player container
- Timeout after 10 seconds; log warning and exit gracefully if unresolved

---

### 5.3 YouTube SPA Navigation

YouTube does not perform full page reloads during navigation. The extension must listen for YouTube's custom navigation event:

```
yt-navigate-finish
```

**On each navigation event:**
1. Tear down previous video's tracking state (clear interval, remove listeners)
2. Re-run the full initialization flow for the new video

---

### 5.4 Timestamp Tracking

Once a valid `<video>` element is detected and the video is confirmed as a supported type:

| Property | Value |
|---|---|
| Tracking interval | Every 5 seconds |
| Timestamp precision | Seconds (integer) |
| Maximum data loss window | 5 seconds |

**Progress is saved on the following events:**

| Event | Trigger | Notes |
|---|---|---|
| `setInterval` | Every 5 seconds | Core tracking loop |
| `pause` | User pauses video | Immediate save |
| `seeked` | User scrubs timeline | Captures large position jumps |
| `visibilitychange` | Tab hidden/backgrounded | `document.hidden === true` |
| `beforeunload` | Tab close / navigation | Last-chance save |

**Tracking must be skipped when:**
- `video.duration === Infinity` (live stream)
- The video URL matches `/shorts/`
- An advertisement is active (see §5.7)

---

### 5.5 Resume Logic

When a supported video is loaded:

```
1. Extract videoId from URL params
2. Load saved progress from chrome.storage.local
3. If no saved progress → exit (begin fresh tracking)
4. If saved progress exists:
   a. Wait 300–500ms for player initialization to stabilize
   b. Validate resume conditions (see below)
   c. If valid → seek to resumeTime
   d. Inject Restart button
   e. Begin progress tracking
```

**Resume Validation Conditions:**

| Condition | Rule | Reason |
|---|---|---|
| Minimum threshold | `savedTime > 30` seconds | Avoids resuming videos barely started |
| Completion threshold | `savedTime < duration × 0.95` | Avoids resuming near-complete videos |

**Resume Seek Target:**

```
resumeTime = savedTime - 2
```

Two seconds of rollback restores narrative context lost since the last save.

**Resume Timing:**

The seek must be delayed **300–500ms** after the video element is ready. YouTube's player initialization can override an immediate seek, causing the video to reset to 0:00.

---

### 5.6 Restart Button (Resume UI)

The Restart button is the **only UI surface** this extension exposes. It appears **only when a resume has occurred**.

#### Behavior Specification

| Property | Value |
|---|---|
| Trigger | Resume seek was successfully applied |
| Injection location | YouTube player controls bar, adjacent to the time display |
| Visual format | `↺ Restart` — styled to match YouTube's native control UI |
| Auto-dismiss | Removed from DOM after 5–10 seconds |
| Click action | Set `video.currentTime = 0`, delete storage entry for videoId |

#### Example UI State

```
▶  0:08 / 35:13  ↺ Restart                    ⚙ ⛶
```

#### Styling Requirements

- Font, color, and weight must match YouTube's player controls
- Must not shift or reflow other control elements
- Must not persist in DOM after dismissal timeout

---

### 5.7 Advertisement Detection

YouTube injects ads into the player using the same `<video>` element as the main content. Resume logic **must not activate during ads**.

**Detection approach:**
- Check for presence of `.ad-showing` or `.ad-interrupting` class on `#movie_player`
- If either class is present, defer resume logic until they are absent
- Use a `MutationObserver` on `#movie_player` class list to detect ad start/end transitions

---

## 6. Technical Architecture

### 6.1 Project Structure

```
youtube-resume/
│
├── manifest.json
│
├── content/
│   ├── youtube.js            # Entry point; bootstraps on yt-navigate-finish
│   ├── playerObserver.js     # MutationObserver for video element + ad detection
│   ├── resumeManager.js      # Core resume logic and validation
│   └── uiInjector.js         # Restart button injection and lifecycle
│
├── storage/
│   └── storage.js            # Typed wrapper around chrome.storage.local
│
├── utils/
│   ├── youtubeUtils.js       # videoId extraction, URL validation, SPA helpers
│   └── timeUtils.js          # Time arithmetic, threshold calculations
│
└── assets/
    └── icons/                # Extension icons (16, 48, 128px)
```

### 6.2 Component Responsibilities

#### `youtube.js` — Entry Point
- Listens for `yt-navigate-finish`
- Calls `youtubeUtils.isWatchPage()` to validate URL
- Orchestrates module initialization and teardown on each navigation

#### `playerObserver.js` — Player Observer
- Attaches `MutationObserver` to `#movie_player`
- Resolves a Promise when `<video>` element appears
- Monitors `.ad-showing` / `.ad-interrupting` class changes
- Exposes `waitForVideo(): Promise<HTMLVideoElement>`
- Exposes `isAdPlaying(): boolean`

#### `resumeManager.js` — Resume Manager
- Loads saved progress via `storage.js`
- Validates resume conditions
- Applies seek after delay
- Registers all tracking event listeners
- Manages the 5-second interval timer (at most **one** active timer)
- Exposes `initialize(videoId, videoElement): void`
- Exposes `teardown(): void`

#### `uiInjector.js` — UI Injector
- Injects the Restart button into the player control bar
- Applies YouTube-consistent styling
- Sets auto-dismiss timer
- Handles click event → reset to 0:00 and clear storage

#### `storage.js` — Storage Abstraction
- Wraps `chrome.storage.local.get` / `set` / `remove`
- Returns typed `VideoProgress` objects
- Enforces 200-entry limit with LRU eviction on write
- Exposes:
  - `getProgress(videoId): Promise<VideoProgress | null>`
  - `saveProgress(videoId, time, duration): Promise<void>`
  - `deleteProgress(videoId): Promise<void>`

#### `youtubeUtils.js` — YouTube Utilities
- `isWatchPage(): boolean`
- `getVideoId(): string | null`
- `isShorts(): boolean`

#### `timeUtils.js` — Time Utilities
- `shouldResume(savedTime, duration): boolean`
- `getResumeTime(savedTime): number`

### 6.3 Manifest (v3)

```json
{
  "manifest_version": 3,
  "name": "YouTube Resume",
  "version": "1.0.0",
  "description": "Automatically resume YouTube videos exactly where you left off.",
  "permissions": ["storage"],
  "host_permissions": ["https://www.youtube.com/*"],
  "content_scripts": [
    {
      "matches": ["https://www.youtube.com/*"],
      "js": [
        "storage/storage.js",
        "utils/youtubeUtils.js",
        "utils/timeUtils.js",
        "content/playerObserver.js",
        "content/uiInjector.js",
        "content/resumeManager.js",
        "content/youtube.js"
      ],
      "run_at": "document_idle"
    }
  ],
  "icons": {
    "16": "assets/icons/icon16.png",
    "48": "assets/icons/icon48.png",
    "128": "assets/icons/icon128.png"
  }
}
```

---

## 7. Data Model & Storage

### 7.1 Storage Mechanism

| Property | Value |
|---|---|
| API | `chrome.storage.local` |
| Persistence | Survives browser restarts and crashes |
| Backend | None |
| Network calls | None |

### 7.2 Root Storage Key

All data is stored under a single root key:

```
youtubeResume
```

### 7.3 Data Schema

```typescript
type VideoProgress = {
  time: number;       // Playback position in seconds (integer)
  duration: number;   // Total video duration in seconds (integer)
  updated: number;    // Unix timestamp (seconds) of last save
};

type StorageRoot = {
  [videoId: string]: VideoProgress;
};
```

**Example stored value:**

```json
{
  "dQw4w9WgXcQ": {
    "time": 1043,
    "duration": 2120,
    "updated": 1710000000
  },
  "9bZkp7q19f0": {
    "time": 187,
    "duration": 253,
    "updated": 1710003600
  }
}
```

### 7.4 Storage Lifecycle

| Operation | Trigger | Action |
|---|---|---|
| **Write** | Every 5s interval, pause, seek, visibilitychange, beforeunload | Upsert entry for videoId |
| **Read** | On video load (after SPA navigation) | Fetch entry for videoId |
| **Delete** | Restart button clicked | Remove entry for videoId |
| **Evict** | Entry count exceeds 200 | Remove oldest N entries by `updated` |

### 7.5 Storage Eviction Policy

- Maximum entries: **200 videos**
- Eviction trigger: On every write, after upsert, if `Object.keys(store).length > 200`
- Eviction strategy: Sort all entries by `updated` ascending, remove oldest until count ≤ 200
- This ensures the most recently watched videos are always retained

---

## 8. Error Handling & Edge Cases

### 8.1 Error Scenarios

| Scenario | Expected Behavior |
|---|---|
| `<video>` element never appears (10s timeout) | Log warning, exit gracefully, no tracking |
| `chrome.storage.local` read fails | Log error, skip resume, begin fresh tracking |
| `chrome.storage.local` write fails | Log error, continue — data loss acceptable |
| Video duration is `0` or `NaN` at resume time | Skip resume, retry when `loadedmetadata` fires |
| Resume seek throws exception | Catch, log, do not inject Restart button |
| Ad detection class not present | Default to non-ad state; track normally |
| SPA navigation fires before teardown completes | Cancel pending timers synchronously in teardown |

### 8.2 Edge Cases

| Edge Case | Handling |
|---|---|
| User seeks manually before resume fires | Cancel pending resume seek |
| Video is shorter than 30 seconds | Resume conditions fail; no resume attempted |
| `savedTime` equals `resumeTime` (video < 2s) | Floor resumeTime at 0; no seek |
| Multiple rapid SPA navigations | Each `yt-navigate-finish` tears down previous state before init |
| User opens same video in multiple tabs | Last write wins; no coordination needed |
| Video ID reused by YouTube (extremely rare) | `updated` timestamp ensures freshness; stale data evicted naturally |

---

## 9. Performance Requirements

| Metric | Requirement |
|---|---|
| Memory footprint | < 5MB |
| Active interval timers | Maximum 1 per video session |
| Storage writes per minute | Maximum 12 (one per 5s) |
| DOM mutations injected | 1 element (Restart button), auto-removed |
| CPU overhead | Negligible; no tight loops or heavy computation |
| Startup impact | Zero — content script deferred to `document_idle` |

**Strict prohibitions:**
- No `requestAnimationFrame` loops
- No polling on video state beyond the 5-second interval
- No network requests of any kind
- No `document.write` or full DOM replacement

---

## 10. Privacy & Security

### 10.1 Privacy Principles

| Principle | Implementation |
|---|---|
| No data leaves the device | All storage via `chrome.storage.local` only |
| No user identification | No account, profile, or fingerprinting |
| No analytics | No telemetry, event tracking, or error reporting |
| No third-party dependencies | Zero external scripts or CDN calls |
| Data minimization | Only `time`, `duration`, and `updated` stored per video |

### 10.2 Permissions Justification

| Permission | Justification |
|---|---|
| `storage` | Required to persist and retrieve playback positions locally |
| `host_permissions: youtube.com` | Required to inject content script into YouTube pages |

No other permissions are requested. The extension does not request `tabs`, `history`, `cookies`, `identity`, or any other sensitive permission.

### 10.3 Security Considerations

- Content script is isolated from the page's JavaScript context (Chrome's default isolation)
- No `eval()` or dynamic code execution
- No `innerHTML` injection (UI is created via `document.createElement`)
- No external script loading

---

## 11. Testing Requirements

### 11.1 Unit Tests

| Module | Test Cases |
|---|---|
| `youtubeUtils.js` | Valid watch URL, Shorts URL, live URL, embed URL, non-YouTube URL |
| `timeUtils.js` | Resume below threshold (≤30s), resume above completion (≥95%), valid resume range, rollback calculation |
| `storage.js` | Write and read round-trip, eviction at 200+1 entries, delete removes entry, graceful read on empty store |

### 11.2 Integration Tests

| Scenario | Expected Result |
|---|---|
| Load video with no saved progress | No seek occurs; tracking begins from 0 |
| Load video with `savedTime = 45s`, `duration = 3600s` | Seek to 43s; Restart button appears |
| Load video with `savedTime = 29s` | No resume (below threshold) |
| Load video with `savedTime = 3420s`, `duration = 3600s` (95%) | No resume (near completion) |
| Crash simulation (force-close) | On reopen, resume occurs from last 5s save window |
| SPA navigation to new video | Previous tracking stops; new tracking initializes |
| Ad plays then main video starts | Resume logic fires after ad ends, not during |
| Restart button clicked | Seek to 0:00; storage entry deleted |
| Restart button auto-dismissed | Button removed from DOM after 5–10s |

### 11.3 Manual QA Checklist

- [ ] Extension activates on `/watch?v=` pages
- [ ] Extension does not activate on `/shorts/`, `/live`, `/embed`
- [ ] Progress is saved every 5 seconds (verify via DevTools → Storage)
- [ ] Resume fires correctly after simulated crash
- [ ] Resume fires correctly after normal tab close and reopen
- [ ] Restart button appears only when resume occurs
- [ ] Restart button matches YouTube's UI styling
- [ ] Restart button auto-dismisses within 5–10 seconds
- [ ] Clicking Restart sets time to 0:00 and clears storage entry
- [ ] No console errors during normal use
- [ ] No memory leaks after 20+ SPA navigations (verify via Chrome Task Manager)

---

## 12. Release Criteria

All of the following must be true before v1.0 ships:

| # | Criterion |
|---|---|
| R1 | All unit tests pass |
| R2 | All integration test scenarios pass |
| R3 | Manual QA checklist is 100% complete |
| R4 | Memory footprint confirmed < 5MB under sustained use |
| R5 | No unhandled exceptions in console during standard use flows |
| R6 | Extension passes Chrome Web Store review requirements |
| R7 | Manifest V3 compliance verified |
| R8 | Privacy policy drafted and linked in store listing |

---

## 13. Future Roadmap

These are deliberately out of scope for v1.0 but represent the natural evolution of the product.

| Feature | Description | Priority |
|---|---|---|
| **Cross-device sync** | Use `chrome.storage.sync` or a lightweight backend to sync progress across devices | High |
| **Resume history page** | A popup or options page showing recently tracked videos | Medium |
| **Progress bar indicator** | Visual marker on YouTube's seek bar showing the last resume point | Medium |
| **Chapter-aware resume** | Resume to the start of the chapter containing the last saved position | Low |
| **Resume hotkey** | Keyboard shortcut to manually trigger resume | Low |
| **Watch analytics** | Local-only stats (total watch time, videos tracked) | Low |
| **Firefox / Safari** | Port to WebExtension API for cross-browser support | High |

---

## 14. Appendix

### 14.1 Key Technical Constraints

- **Manifest V3:** Background scripts replaced by service workers. This extension requires no background script — all logic runs in the content script context.
- **SPA Architecture:** YouTube does not reload the page on navigation. All state must be manually torn down and re-initialized on `yt-navigate-finish`.
- **Player Initialization Race:** YouTube's player can override `video.currentTime` if set too early. A 300–500ms delay after video element detection is required to win this race reliably.

### 14.2 YouTube DOM Reference

| Element | Selector | Purpose |
|---|---|---|
| Player container | `#movie_player` | MutationObserver root |
| Video element | `video` (inside `#movie_player`) | Playback control target |
| Ad active state | `.ad-showing`, `.ad-interrupting` on `#movie_player` | Ad detection |
| Controls bar | `.ytp-left-controls` | Restart button injection target |
| Time display | `.ytp-time-display` | Adjacent to Restart button |

### 14.3 Glossary

| Term | Definition |
|---|---|
| **SPA** | Single Page Application — a web app that updates content without full page reloads |
| **videoId** | The `v` query parameter in a YouTube watch URL (e.g., `dQw4w9WgXcQ`) |
| **resumeTime** | The calculated seek target: `savedTime - 2` seconds |
| **savedTime** | The last persisted playback position for a video, in seconds |
| **LRU eviction** | Least Recently Used — removes the oldest entries when storage limit is exceeded |
| **yt-navigate-finish** | A custom DOM event YouTube fires after SPA navigation completes |
| **Manifest V3** | Chrome's current extension platform standard, replacing Manifest V2 |

---

*This document is the authoritative specification for YouTube Resume v1.0. All implementation decisions should trace back to requirements defined here. Deviations require product sign-off.*
