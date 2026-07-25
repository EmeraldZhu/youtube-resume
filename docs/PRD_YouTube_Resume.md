# Product Requirements Document
## YouTube Resume — Chrome Extension

---

| Field | Detail |
|---|---|
| **Product Name** | YouTube Resume |
| **Product Type** | Chrome Extension (Manifest V3) |
| **Version** | 2.0.0 |
| **Previous Version** | 1.0.0 (live on Chrome Web Store) |
| **Status** | Approved — Ready for Engineering |
| **Last Updated** | 2026-07-26 |
| **Owner** | Product |
| **Companion Documents** | ROADMAP_v2.md, TDD_YouTube_Resume.md, UX_Spec_YouTube_Resume.md v2.0.0 |

---

## Changelog — v1.0.0 → v2.0.0

| # | Change | Section |
|---|---|---|
| C1 | Resume is now explicitly ad-gated and the seek is verified rather than assumed | §5.5, §5.7 |
| C2 | Progress tracking adds `ended` and `pagehide`; `beforeunload` retired | §5.4 |
| C3 | User settings introduced — six tunable preferences | §5.8 (new) |
| C4 | Saved videos panel introduced, replacing the v1.0 status popup | §5.9 (new) |
| C5 | Storage schema advances to v2 (adds optional `title`) with a migration path | §7.3, §7.6 |
| C6 | "Zero network requests" relaxed to permit optional thumbnail images | §9, §10 |
| C7 | Non-goal NG4 (no settings page) removed | §3.2 |
| C8 | "Resume history page" removed from the roadmap — delivered in this release | §13 |
| C9 | §6.1 project structure corrected to match shipped code | §6.1 |

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

YouTube Resume is a lightweight Chrome extension that silently tracks a user's playback position across YouTube videos and automatically resumes from exactly where they left off — regardless of how the session ended. There is no account, no configuration required to get value, and no visible interface during normal playback.

The product philosophy is **invisible until needed, reliable always**.

v2.0.0 is a reliability and control release. v1.0 established the mechanism; v2.0 makes it dependable, makes its two in-player surfaces match YouTube's current design language, and gives the user two things they asked for: a way to see what has been saved, and a way to adjust the thresholds that were previously hard-coded.

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

Users of long-form content suffer the most from this gap. Losing your place in a 90-minute tutorial or a 3-hour podcast is a meaningfully frustrating experience.

### 2.3 v1.0 Shortfall

v1.0 shipped the mechanism but resume did not fire reliably. Suspected causes are catalogued as hypotheses H1–H8 in ROADMAP_v2.md §4 and are confirmed by evidence in Phase 1 before any fix is attempted. The dominant suspects are ad interference and a premature player-detection failure on slow cold loads.

Secondarily, v1.0 gave the user no visibility into what had been saved and no way to adjust behaviour that did not suit them.

### 2.4 Opportunity

A persistent, local, session-agnostic resume mechanism closes this gap entirely. Because it operates at the browser level — independently of YouTube's account infrastructure — it is reliable by design, provided the implementation is correct.

---

## 3. Goals & Non-Goals

### 3.1 Goals

| # | Goal | Introduced |
|---|---|---|
| G1 | Automatically resume any YouTube video from the last known position | v1.0 |
| G2 | Persist progress across browser crashes, restarts, and tab closures | v1.0 |
| G3 | Require zero user configuration to function | v1.0 |
| G4 | Be invisible and non-disruptive during normal playback | v1.0 |
| G5 | Provide a single, unobtrusive escape hatch: a Restart button that auto-dismisses | v1.0 |
| G6 | Store all watch data locally — no accounts, no telemetry | v1.0 |
| G7 | Work reliably on YouTube's SPA navigation model | v1.0 |
| **G8** | **Resume must succeed on every supported video, including ad-served videos, on both cold load and SPA navigation** | **v2.0** |
| **G9** | **Injected in-player UI must be visually indistinguishable from YouTube's own controls** | **v2.0** |
| **G10** | **Give users optional control over the thresholds that govern resume behaviour** | **v2.0** |
| **G11** | **Give users a way to see, open, and manage their saved videos** | **v2.0** |

> **G3 and G10 are not in conflict.** Defaults must remain correct for a user who never opens settings. Settings are an escape hatch, not a setup step.

### 3.2 Non-Goals (v2.0)

| # | Non-Goal | Rationale |
|---|---|---|
| NG1 | Cross-device sync | Requires backend or `storage.sync` quota design; out of scope |
| NG2 | Resume for Shorts, live streams, or embeds | Incompatible with resume semantics |
| NG3 | Visible in-player UI beyond the Restart button and resume toast | Contradicts invisible-by-default philosophy |
| NG5 | Analytics or telemetry | Privacy non-negotiable |
| NG6 | Firefox or Safari support | Chrome-first; extension model differs |
| **NG7** | **Live propagation of settings changes into already-open YouTube tabs** | Settings apply on next navigation; live push adds messaging complexity for negligible benefit |
| **NG8** | **Editing or renaming saved entries** | The panel is for viewing, opening, and removing — not curation |

> **NG4 (no settings page) is removed in v2.0.** A settings surface is now in scope, delivered as a panel inside the popup rather than a separate options page. See §5.8.

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
**When** they want to watch from the beginning
**Then** a temporary `↺ Restart` button is present for 5–10 seconds that resets to 0:00

#### UC-5: Near-Complete Video
**Given** a user has watched past the completion threshold
**When** they reopen the video
**Then** the extension does not attempt to resume

#### UC-6: Ad-Served Resume *(new in v2.0)*
**Given** a user opens a saved video that serves a 15-second unskippable pre-roll ad
**When** the ad finishes
**Then** the main video resumes at the saved position — the ad neither triggers nor cancels the resume

#### UC-7: Finding a Half-Watched Video *(new in v2.0)*
**Given** a user watched part of a video days ago and does not remember its title
**When** they click the extension icon
**Then** they see a list of saved videos with thumbnails and watch progress, and clicking one opens it and resumes

#### UC-8: Adjusting the Minimum Threshold *(new in v2.0)*
**Given** a user finds the 30-second minimum too long for their viewing habits
**When** they open settings and set it to 10 seconds
**Then** videos watched for more than 10 seconds are saved and resumed from that point on

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

YouTube is a Single Page Application. Neither the `<video>` element **nor the `#movie_player` container** is guaranteed to exist when the content script runs at `document_idle`.

**Detection strategy (revised in v2.0):**
- If `#movie_player` is absent, observe `document.body` until it appears — do **not** fail immediately
- Once the container exists, resolve when a `<video>` element appears inside it
- Overall timeout: 10 seconds. On timeout, log a warning and exit gracefully
- **At most one `MutationObserver` may be alive at any time.** The observer is re-targeted, never duplicated

> v1.0 rejected immediately when `#movie_player` was absent. On slow cold loads this guaranteed a missed resume. This is a primary reliability fix.

---

### 5.3 YouTube SPA Navigation

YouTube does not perform full page reloads during navigation. The extension listens for:

```
yt-navigate-finish
```

**On each navigation event:**
1. Tear down previous video's tracking state (clear interval, remove listeners, remove injected UI)
2. Re-run the full initialization flow for the new video

A URL-polling fallback activates if `yt-navigate-finish` has not fired within 2 seconds of a detected URL change.

**v2.0 addition:** returning to a video the user is already on must re-emit if the player was torn down in between.

---

### 5.4 Timestamp Tracking

| Property | Value |
|---|---|
| Tracking interval | Every 5 seconds |
| Timestamp precision | Seconds (integer) |
| Maximum data loss window | 5 seconds |

**Progress is saved on the following events:**

| Event | Trigger | Delta guard applies? |
|---|---|---|
| `setInterval` | Every 5 seconds | **Yes** |
| `pause` | User pauses video | No — saves unconditionally |
| `seeked` | User scrubs timeline | No — saves unconditionally |
| `ended` *(new in v2.0)* | Video reaches its end | No — saves unconditionally |
| `visibilitychange` | Tab hidden (`document.hidden === true`) | No — saves unconditionally |
| `pagehide` *(new in v2.0)* | Tab closing or navigating away | No — saves unconditionally, best-effort |

> **v1.0 correction:** the delta guard (`abs(current - lastSaved) >= 5`) applies **only** to the interval trigger. v1.0 documented an exemption for `pause` and `seeked` but placed the guard inside the shared save function, contradicting itself.

> **`beforeunload` is retired.** v1.0 claimed a synchronous `chrome.storage.local` save during unload. That API is asynchronous and frequently does not complete during teardown. `pagehide` combined with the `visibilitychange` save is materially more reliable. Both remain best-effort and must be documented as such.

**Tracking must be skipped when:**
- `video.duration === Infinity` (live stream)
- The URL matches an excluded pattern (§5.1)
- An advertisement is active (§5.7)
- `currentTime` is `NaN`, negative, or exceeds `duration`
- Total watched time is below the configured minimum (§5.8)

---

### 5.5 Resume Logic

```
1. Extract videoId from URL params
2. Load user settings (fall back to defaults on any failure)
3. Load saved progress from chrome.storage.local
4. If no saved progress → exit (begin fresh tracking)
5. If saved progress exists:
   a. If duration is unavailable, wait for 'loadedmetadata' (5s timeout)
   b. Validate resume conditions against settings
   c. If an ad is active, wait for it to end (60s ceiling), then continue
   d. Record currentTime, then wait 400ms for player initialization
   e. If the user has manually seeked during the wait, abort
   f. Seek to resumeTime
   g. Verify the seek landed; retry up to 3 times
   h. Show Restart button and resume toast, subject to settings
   i. Begin progress tracking
```

**Resume Validation Conditions:**

| Condition | Rule | Default | Configurable |
|---|---|---|---|
| Minimum threshold | `savedTime > minWatchSeconds` | 30s | Yes (§5.8) |
| Completion threshold | `savedTime < duration × completionThreshold` | 0.95 | Yes (§5.8) |

**Resume Seek Target:**

```
resumeTime = max(0, savedTime - rewindSeconds)
```

Default `rewindSeconds` is 2, restoring narrative context lost since the last save.

**Resume Timing — non-negotiable:**

The seek must be delayed **400ms** after the video element is ready. YouTube's player initialization can override an immediate seek. This value is **not user-configurable** — exposing it invites users to silently break their own resume.

**Manual-seek abort guard (revised in v2.0):**

The v1.0 guard aborted if `video.currentTime > 5` after the delay. This was incorrect: during a pre-roll ad, `currentTime` reflects **ad** position, so any ad longer than 5 seconds silently cancelled the resume.

The v2.0 guard compares against the position recorded immediately before the delay, aborting only if playback has moved more than 10 seconds beyond natural drift. It does not evaluate while an ad is active.

**Seek verification (new in v2.0):**

After assignment, the extension re-reads `currentTime` after 250ms. If the actual position is more than 3 seconds from target, it re-assigns, to a maximum of 3 attempts. Unbounded retry loops are prohibited.

---

### 5.6 Restart Button

The Restart button appears **only when a resume seek was successfully applied and verified**.

| Property | Value |
|---|---|
| Trigger | Resume seek verified |
| Injection location | YouTube player controls bar, adjacent to the time display |
| Visual format | `↺ Restart`, styled to match YouTube's **current** control UI |
| Auto-dismiss | Removed from DOM after 7 seconds |
| Click action | `video.currentTime = 0`; delete storage entry for videoId |
| User control | Can be disabled in settings (§5.8) |

> **v2.0 visual change:** v1.0 mandated a flat, borderless text button on the grounds that it matched YouTube's control bar. YouTube has since moved to rounded-pill controls with hover fills, so that rule now produces the mismatch it was written to prevent. Styling is re-derived from measured values against live YouTube DOM. See UX Spec §4.

---

### 5.7 Advertisement Detection

YouTube injects ads into the player using the same `<video>` element as the main content.

**Detection approach:**
- Check for `.ad-showing` or `.ad-interrupting` on `#movie_player`
- If either is present, **defer** resume until both are absent
- Never save progress while either is present
- Never evaluate the manual-seek abort guard while either is present

**Hard ceiling:** if ads have not cleared within 60 seconds, abandon the resume, log a warning, and begin tracking normally. The extension must never hang waiting on an ad state.

> This requirement existed in v1.0 §5.7 but was omitted from the v1.0 technical design and therefore never implemented. It is a primary reliability fix in v2.0.

---

### 5.8 User Settings *(new in v2.0)*

Six settings, presented as a panel inside the extension popup (not a separate options page, not a browser tab).

| Setting | Effect | Options | Default |
|---|---|---|---|
| Minimum watch time | Videos watched for less than this are neither saved nor resumed | 10s / 30s / 1m / 2m | 30s |
| Treat as finished at | Videos watched past this fraction do not resume | 90% / 95% / 98% | 95% |
| Rewind on resume | Seconds subtracted from the saved position when resuming | Off / 2s / 5s / 10s | 2s |
| Show "Resumed from" message | Whether the resume toast appears | On / Off | On |
| Show Restart button | Whether the Restart button appears | On / Off | On |
| Load thumbnails | Whether the saved videos panel fetches thumbnail images | On / Off | On |

**Requirements:**
- Defaults must be correct for a user who never opens settings (G3)
- Changes persist immediately; there is no Save button
- Settings are stored under a **separate root key** from watch data, so that clearing saved progress never resets preferences and entry eviction can never delete a setting
- A missing, corrupt, or unreadable settings value falls back to its default silently — a settings failure must never block a resume
- Controls are preset choices (segmented buttons and toggles) rather than free numeric entry, eliminating invalid states
- Changes apply on the next navigation in any open YouTube tab (NG7)

**Deliberately not configurable:** the 400ms resume delay, the 5-second save interval, and the 200-entry storage cap.

---

### 5.9 Saved Videos Panel *(new in v2.0)*

Clicking the extension icon opens a panel listing saved videos, newest first.

**Each row shows:**
- Video thumbnail
- Video title, falling back to `Untitled video` where unknown
- A progress bar
- Saved position and total duration, plus percentage watched

**Behaviour:**
- Clicking a row opens that video in a new tab; the extension then resumes it through the normal resume path — no separate mechanism
- Each row has a remove control deleting that single entry, updating the list in place
- Empty state is shown when nothing is saved
- The header shows the saved count and a control to open settings
- Rendering completes in under 200ms with a full 200 entries; thumbnails may load progressively but must not block the list

**Thumbnails:**
- Loaded from YouTube's public image CDN at `https://i.ytimg.com/vi/{videoId}/mqdefault.jpg`
- This requires no additional permission and transmits no user data beyond the ordinary request
- Failures (deleted or private videos) show a neutral placeholder, never a broken image
- When the thumbnails setting is off, no request is made at all and the extension remains fully offline

**Opening a video requires no `tabs` permission** — rows are ordinary links.

---

## 6. Technical Architecture

### 6.1 Project Structure

> Corrected in v2.0 to match shipped code. The v1.0 PRD listed a superseded layout (`youtube.js`, `storage.js`) that was never built.

```
youtube-resume/
│
├── manifest.json
│
├── content/
│   ├── bootstrap.js            # Entry point; wires all modules together
│   ├── navigationManager.js    # SPA navigation detection
│   ├── playerObserver.js       # <video> + container + ad state detection
│   ├── resumeManager.js        # Resume validation, ad gating, verified seek
│   ├── progressTracker.js      # Interval + event-based progress saving
│   └── uiInjector.js           # Restart button + resume toast
│
├── storage/
│   └── storageManager.js       # chrome.storage.local abstraction, settings, migration
│
├── utils/
│   ├── youtubeUtils.js         # URL parsing, videoId extraction, title capture
│   └── timeUtils.js            # Threshold math, resume calculations, formatting
│
├── popup/
│   ├── popup.html              # Two views: saved videos, settings
│   ├── popup.js
│   └── popup.css
│
└── assets/
    └── icons/
        ├── icon-16.png
        ├── icon-48.png
        └── icon-128.png
```

> Icon filenames are `icon-16.png` style, hyphenated. Earlier docs said `icon16.png`; the shipped filenames are authoritative.

### 6.2 Component Responsibilities

| Module | Responsibility |
|---|---|
| `bootstrap.js` | Orchestration only. Owns no logic. Loads settings once per navigation and passes them down. Every promise chain ends in `.catch()`. |
| `navigationManager.js` | Detects video changes via `yt-navigate-finish`, cold load, URL-polling fallback, and same-video re-entry |
| `playerObserver.js` | Resolves the `<video>` element, waiting for `#movie_player` if necessary. Exposes ad state. Owns the single `MutationObserver`. |
| `resumeManager.js` | Validates against settings, gates on ad state, applies the 400ms delay, seeks, and verifies |
| `progressTracker.js` | Owns the single `setInterval` and all playback event listeners. Captures the video title on save. |
| `storageManager.js` | The **only** module that touches `chrome.storage.local`. Owns watch data, settings, eviction, and schema migration. |
| `uiInjector.js` | Injects and tears down the Restart button and resume toast. `document.createElement` only. |
| `youtubeUtils.js` | Pure URL and page-type inspection, plus video title extraction |
| `timeUtils.js` | Pure threshold math and timestamp formatting |
| `popup/*` | Saved videos list and settings panel. Reads through `storageManager` semantics; no direct DOM injection into YouTube. |

### 6.3 Manifest (v3)

```json
{
  "manifest_version": 3,
  "name": "YouTube Resume",
  "version": "2.0.0",
  "description": "Automatically resume YouTube videos exactly where you left off.",
  "permissions": ["storage"],
  "host_permissions": ["https://www.youtube.com/*"],
  "action": {
    "default_popup": "popup/popup.html"
  },
  "content_scripts": [
    {
      "matches": ["https://www.youtube.com/*"],
      "js": [
        "storage/storageManager.js",
        "utils/youtubeUtils.js",
        "utils/timeUtils.js",
        "content/playerObserver.js",
        "content/uiInjector.js",
        "content/resumeManager.js",
        "content/navigationManager.js",
        "content/progressTracker.js",
        "content/bootstrap.js"
      ],
      "run_at": "document_idle"
    }
  ],
  "icons": {
    "16": "assets/icons/icon-16.png",
    "48": "assets/icons/icon-48.png",
    "128": "assets/icons/icon-128.png"
  }
}
```

**Permissions must not change in v2.0.** No `tabs`, no `unlimitedStorage`, no additional host permissions. Thumbnails load as ordinary images and require none.

---

## 7. Data Model & Storage

### 7.1 Storage Mechanism

| Property | Value |
|---|---|
| API | `chrome.storage.local` |
| Persistence | Survives browser restarts and crashes |
| Backend | None |
| Watch data leaving the device | None |

### 7.2 Root Keys

| Key | Contents | Introduced |
|---|---|---|
| `youtubeResume` | Map of `videoId → VideoProgress` | v1.0 |
| `youtubeResumeSettings` | User preferences | v2.0 |
| `youtubeResumeSchema` | Integer schema version | v2.0 |

> Schema version and settings are **separate root keys**, never nested inside `youtubeResume`. That object's keys are counted for the 200-entry cap and iterated during eviction; any non-videoId key inside it would corrupt both.

### 7.3 Data Schema — v2

```typescript
type VideoProgress = {
  time: number;       // Playback position in seconds (integer)
  duration: number;   // Total video duration in seconds (integer)
  updated: number;    // Unix timestamp (seconds) of last save
  title?: string;     // v2.0 — video title, max 200 chars, optional
};

type Settings = {
  minWatchSeconds: number;       // default 30
  completionThreshold: number;   // default 0.95
  rewindSeconds: number;         // default 2
  showToast: boolean;            // default true
  showRestartButton: boolean;    // default true
  loadThumbnails: boolean;       // default true
};
```

**Example stored value:**

```json
{
  "youtubeResume": {
    "dQw4w9WgXcQ": {
      "time": 1043,
      "duration": 2120,
      "updated": 1710000000,
      "title": "Building a UE5 game from scratch"
    }
  },
  "youtubeResumeSettings": {
    "minWatchSeconds": 30,
    "completionThreshold": 0.95,
    "rewindSeconds": 2,
    "showToast": true,
    "showRestartButton": true,
    "loadThumbnails": true
  },
  "youtubeResumeSchema": 2
}
```

**Title capture:** read from `document.title` with the trailing ` - YouTube` stripped, falling back to a DOM selector, then to omission. `document.title` is used in preference to YouTube's metadata selectors because it is materially more stable across YouTube redesigns. A missing title must never block a save.

### 7.4 Storage Lifecycle

| Operation | Trigger | Action |
|---|---|---|
| **Write** | Interval, pause, seek, end, visibility change, page hide | Upsert entry for videoId |
| **Read** | On video load, and on popup open | Fetch entry, or all entries for the panel |
| **Delete (single)** | Restart button clicked, or removed from the panel | Remove entry for videoId |
| **Delete (all)** | Clear saved progress in settings | Remove `youtubeResume` only — settings and schema untouched |
| **Evict** | Entry count exceeds 200 after a write | Remove oldest by `updated` until 200 remain |

### 7.5 Storage Eviction Policy

- Maximum entries: **200 videos**
- Eviction runs on every write, after upsert
- Strategy: sort by `updated` ascending, remove oldest until count ≤ 200
- Eviction must never remove the entry just written
- Eviction counts only entries inside `youtubeResume`; other root keys are out of scope

### 7.6 Schema Migration — v1 → v2 *(new)*

The v1 → v2 change is **purely additive**: `title` is optional and every v1 entry remains valid under v2. Migration is therefore non-destructive by construction.

**On first run after update:**
1. Read `youtubeResumeSchema`. If it equals 2, stop — nothing to do
2. If absent, write `youtubeResumeSchema: 2`
3. If `youtubeResumeSettings` is absent, write the defaults
4. **Leave every existing `youtubeResume` entry untouched.** Do not rewrite, reorder, or backfill

Entries without a title display the fallback label in the panel until the user next watches that video, at which point a title is captured naturally.

**Requirements:** migration is idempotent, never deletes an entry, and never blocks resume if it fails. A migration failure logs a warning and the extension continues with defaults.

---

## 8. Error Handling & Edge Cases

### 8.1 Error Scenarios

| Scenario | Expected Behavior |
|---|---|
| `#movie_player` absent at script run | Wait for it via observer; do not fail immediately |
| `<video>` never appears (10s timeout) | Log warning, exit gracefully, no tracking |
| Ad state never clears (60s ceiling) | Abandon resume, log warning, begin tracking |
| Seek fails verification 3 times | Log warning, do not inject UI, begin tracking |
| `chrome.storage.local` read fails | Log warning, skip resume, begin fresh tracking |
| `chrome.storage.local` write fails | Log warning, continue — data loss acceptable |
| Settings read fails or is corrupt | Use defaults silently; never block resume |
| Migration fails | Log warning; continue with defaults; never delete data |
| Video duration is `0` or `NaN` at resume time | Wait for `loadedmetadata`, 5s timeout, then skip |
| Resume seek throws | Catch, log, do not inject UI |
| Thumbnail fails to load | Neutral placeholder; no console error |
| Ad detection class not present | Default to non-ad state; track normally |
| SPA navigation fires before teardown completes | Cancel pending timers synchronously in teardown |

### 8.2 Edge Cases

| Edge Case | Handling |
|---|---|
| User seeks manually before resume fires | Cancel pending resume seek (revised guard, §5.5) |
| Playback drifts naturally during the 400ms delay | Must **not** be treated as a manual seek |
| Pre-roll ad longer than the old 5-second guard | Must **not** cancel the resume |
| Video shorter than the minimum threshold | Resume conditions fail; no resume attempted |
| `savedTime` less than `rewindSeconds` | Floor `resumeTime` at 0 |
| Rewind set to Off | Resume at exactly `savedTime` |
| Multiple rapid SPA navigations | Each event tears down previous state before init; last navigation wins |
| Same video open in multiple tabs | Last write wins; no coordination |
| Video deleted or made private after saving | Entry remains; thumbnail placeholder shown; row still removable |
| Panel opened with 200 entries | Renders under 200ms; thumbnails load lazily |
| Video ID reused by YouTube (extremely rare) | `updated` timestamp ensures freshness; stale data evicted naturally |

---

## 9. Performance Requirements

| Metric | Requirement |
|---|---|
| Memory footprint | < 5MB |
| Active interval timers | Maximum 1 at any time |
| Active MutationObservers | Maximum 1 at any time |
| Storage writes per minute | Maximum 12 |
| DOM elements injected into YouTube | Maximum 2 (Restart button, toast), both auto-removed |
| CPU overhead | Negligible; no tight loops |
| Startup impact | Zero — content script deferred to `document_idle` |
| Popup render time | < 200ms with 200 entries |

**Network policy (revised in v2.0):**

| Context | Requests permitted |
|---|---|
| Content script on YouTube | **Zero.** No exceptions. |
| Popup, thumbnails enabled | Thumbnail image GETs to `i.ytimg.com` only |
| Popup, thumbnails disabled | **Zero.** |

> v1.0 stated zero network requests unconditionally. v2.0 permits thumbnail images in the popup only, defaulted on and user-disableable. No other request of any kind is permitted anywhere in the extension.

**Strict prohibitions:**
- No `requestAnimationFrame` loops
- No polling on video state beyond the 5-second interval and the bounded seek verification
- No external scripts, no CDN dependencies, no analytics endpoints
- No `document.write`, no `innerHTML`, no `eval`

---

## 10. Privacy & Security

### 10.1 Privacy Principles

| Principle | Implementation |
|---|---|
| No watch data leaves the device | All storage via `chrome.storage.local` only |
| No user identification | No account, profile, or fingerprinting |
| No analytics | No telemetry, event tracking, or error reporting |
| No third-party scripts | Zero external scripts or CDN code |
| Data minimization | Only `time`, `duration`, `updated`, and `title` stored per video |
| Network transparency | The single network exception is disclosed, and can be turned off |

### 10.2 Thumbnail Disclosure *(new in v2.0)*

When the saved videos panel is open **and** thumbnails are enabled, the popup requests images from `https://i.ytimg.com`, Google's public thumbnail CDN.

- The request contains the video ID, which is already public
- No identifier, watch history, or personal data is transmitted beyond the ordinary request
- No request is made unless the user opens the popup
- Turning thumbnails off eliminates the request entirely, restoring fully-offline operation

This must be stated plainly in the privacy policy and the store listing. Do not describe v2.0 as making zero network requests.

### 10.3 Permissions Justification

| Permission | Justification |
|---|---|
| `storage` | Required to persist and retrieve playback positions and settings locally |
| `host_permissions: youtube.com` | Required to inject the content script into YouTube pages |

No other permission is requested. The extension does not request `tabs`, `history`, `cookies`, `identity`, `unlimitedStorage`, or any other permission. **v2.0 adds no permissions.**

### 10.4 Security Considerations

- Content script is isolated from the page's JavaScript context
- No `eval()` or dynamic code execution
- No `innerHTML` — all DOM created via `document.createElement`
- No inline `<script>`
- No external script loading
- Panel links use `rel="noopener noreferrer"`

---

## 11. Testing Requirements

Full phase-by-phase test tables are in ROADMAP_v2.md. This section defines the categories that must be covered.

### 11.1 Unit Tests

| Module | Test Cases |
|---|---|
| `youtubeUtils.js` | Watch, Shorts, live, embed, non-YouTube URLs; videoId extraction; title extraction and suffix stripping |
| `timeUtils.js` | Threshold boundaries at each configurable value; rewind at Off/2/5/10; floor at 0; timestamp formatting under and over one hour |
| `storageManager.js` | Read/write round-trip; eviction at 201; delete; empty store; settings merge over defaults; corrupt settings; migration idempotency |

### 11.2 Integration Tests

| Scenario | Expected Result |
|---|---|
| No saved progress | No seek; tracking begins |
| Valid saved progress, no ad | Seek to `savedTime - rewindSeconds`; verified; UI shown |
| Valid saved progress, 15s pre-roll ad | No action during ad; correct seek after ad ends |
| Below minimum threshold | No resume |
| Above completion threshold | No resume |
| Slow cold load, `#movie_player` late | Resume still fires |
| Manual seek during the 400ms delay | Resume aborts |
| Natural drift during the delay | Resume proceeds |
| Crash simulation | Resume from last save window |
| SPA navigation | Previous tracking stops; new tracking starts |
| Restart button clicked | Seek to 0:00; entry deleted |
| Each of the six settings changed | Behaviour changes accordingly |
| Panel row clicked | Video opens and resumes |
| Thumbnails disabled | Zero network requests |
| Upgrade from a real v1.0 profile | Zero data loss |

### 11.3 Manual QA Checklist

- [ ] Activates on `/watch?v=`; silent on `/shorts/`, `/live`, `/embed`, `/playlist`
- [ ] Resume succeeds 20/20 on cold load and 20/20 on SPA navigation
- [ ] Resume succeeds on ad-served videos
- [ ] Resume survives slow-connection cold loads
- [ ] Restart button and toast are visually indistinguishable from YouTube's controls
- [ ] Toast does not overlap the progress bar in default, theater, or fullscreen mode
- [ ] Restart button auto-dismisses within 5–10 seconds
- [ ] All six settings persist and take effect
- [ ] Clearing saved progress does not reset settings
- [ ] Resetting settings does not delete saved progress
- [ ] Panel renders 200 entries under 200ms
- [ ] Panel rows open and resume correctly
- [ ] Thumbnails off produces zero network requests
- [ ] No UI appears during normal, uninterrupted playback
- [ ] No console errors across a 30-minute session or 25 navigations
- [ ] Memory stable after 25+ navigations

---

## 12. Release Criteria

| # | Criterion |
|---|---|
| R1 | Resume succeeds 40/40 across cold load and SPA navigation, with and without ads |
| R2 | Zero data loss upgrading from a real v1.0 profile |
| R3 | In-player UI visually indistinguishable from YouTube's native controls |
| R4 | All six settings persist and demonstrably change behaviour |
| R5 | Saved videos panel renders 200 entries under 200ms |
| R6 | Permissions unchanged from v1.0 |
| R7 | Zero network requests with thumbnails disabled |
| R8 | No `innerHTML`, `eval`, or inline `<script>` anywhere |
| R9 | Exactly one `setInterval` and one `MutationObserver` alive at any time |
| R10 | Every promise chain ends in `.catch()` |
| R11 | No UI during normal, uninterrupted playback |
| R12 | All user-facing copy matches UX Spec §7 |
| R13 | Privacy policy updated to disclose the thumbnail exception |
| R14 | Manifest V3 compliance verified; version reads `2.0.0` |
| R15 | All five project documents consistent with shipped code |

---

## 13. Future Roadmap

Out of scope for v2.0.

| Feature | Description | Priority |
|---|---|---|
| **Cross-device sync** | `chrome.storage.sync` or a lightweight backend | High |
| **Firefox / Safari** | Port to the WebExtension API | High |
| **Progress bar indicator** | Visual marker on YouTube's seek bar showing the last resume point | Medium |
| **Search and filter in the panel** | Useful once users routinely hold 200 entries | Medium |
| **Playlist-aware resume** | Resume position within a playlist, not just a video | Medium |
| **Chapter-aware resume** | Resume to the start of the containing chapter | Low |
| **Resume hotkey** | Keyboard shortcut to manually trigger resume | Low |
| **Watch analytics** | Local-only stats | Low |

> **Removed from the roadmap:** "Resume history page" — delivered in v2.0 as the saved videos panel (§5.9).

---

## 14. Appendix

### 14.1 Key Technical Constraints

- **Manifest V3:** no background script required; all logic runs in the content script and popup
- **SPA architecture:** no page reload on navigation; all state manually torn down and re-initialized
- **Player initialization race:** YouTube's player can override `video.currentTime` if set too early. The 400ms delay is required, and in v2.0 the seek is additionally verified
- **Shared video element:** ads and main content use the same `<video>`. `currentTime` during an ad reflects ad position. This is the single most important correctness constraint in the resume path

### 14.2 YouTube DOM Reference

| Element | Selector | Purpose |
|---|---|---|
| Player container | `#movie_player` | Observer root; ad state carrier |
| Video element | `video` inside `#movie_player` | Playback control target |
| Ad active state | `.ad-showing`, `.ad-interrupting` on `#movie_player` | Ad detection |
| Controls bar | `.ytp-left-controls` | Restart button injection context |
| Time display | `.ytp-time-display` | Restart button injected as next sibling |

> Measured styling values are recorded separately in `docs/YT_DOM_AUDIT.md`, produced in Roadmap Phase 5. These selectors are subject to change without notice; any failure must log a warning naming the selector.

### 14.3 Glossary

| Term | Definition |
|---|---|
| **SPA** | Single Page Application — updates content without full page reloads |
| **videoId** | The `v` query parameter in a YouTube watch URL |
| **resumeTime** | The seek target: `savedTime - rewindSeconds`, floored at 0 |
| **savedTime** | The last persisted playback position, in seconds |
| **Delta guard** | The rule that the interval save only writes when the position has moved at least 5 seconds |
| **Ad gating** | Deferring resume until `.ad-showing` and `.ad-interrupting` are both absent |
| **Seek verification** | Re-reading `currentTime` after a seek to confirm it was not overridden |
| **LRU eviction** | Removing the oldest entries when the storage limit is exceeded |
| **yt-navigate-finish** | YouTube's custom DOM event fired after SPA navigation completes |
| **Manifest V3** | Chrome's current extension platform standard |

---

*This document is the authoritative product specification for YouTube Resume v2.0.0. Implementation decisions trace back to requirements defined here. Deviations require product sign-off. For implementation detail, the TDD takes precedence; the PRD takes precedence on product intent and scope.*
