# Product Requirements Document
## YouTube Resume — Chrome Extension

---

| Field | Detail |
|---|---|
| **Product Name** | YouTube Resume |
| **Product Type** | Chrome Extension (Manifest V3) |
| **Version** | 4.0.0 |
| **Previous Version** | 3.0.0 (live on Chrome Web Store) |
| **Status** | Approved — Ready for Engineering |
| **Last Updated** | 2026-09-08 |
| **Owner** | Product |
| **Companion Documents** | ROADMAP_v4.md, TDD_YouTube_Resume.md, UX_Spec_YouTube_Resume.md, DECISIONS.md |

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

## Changelog — v2.0.0 → v3.0.0

| # | Change | Section |
|---|---|---|
| C10 | Three defects reported against v2.0.0 addressed as explicit product guarantees: title-change resume breakage, runaway "Untitled video" duplication, and near-zero timestamp overwrites | §5.10 (new) |
| C11 | Data-durability guarantee stated explicitly as a product promise, not just an implementation detail | §5.10, G13 |
| C12 | Pinned videos introduced — users can protect specific saved videos from the 200-entry eviction cap | §5.11 (new), G12 |
| C13 | Storage schema advances to v3 (adds optional `pinned`) | §7.3, §7.5 |
| C14 | §6.1 project structure and §6.3 manifest snippet corrected to include `utils/debugLogger.js`, which has shipped since v2.0.0 but was omitted from both | §6.1, §6.3 |
| C15 | Non-Goals reaffirmed for v3.0 — no change to which items are in or out of scope; settings page (removed as a non-goal in v2.0) remains in scope | §3.2 |

## Changelog — v3.0.0 → v4.0.0

| # | Change | Section |
|---|---|---|
| C16 | Resume reliability restated as explicit product guarantees: success is reported only after a verified outcome, and a failed resume never overwrites the saved checkpoint with a startup position | §5.10 |
| C17 | Completion redefined: a video counts as finished only when playback actually reached the end, separately from the resume cutoff; the displayed percentage no longer rounds up to 100% | §5.10 |
| C18 | Bulk removal of completed videos added to the saved videos panel, preserving pinned entries by default | §5.12 (new) |
| C19 | "Treat as finished at" gains a fourth option, "Only at the end" | §5.8, §5.10 |
| C20 | Explicit timestamp links take precedence over saved progress | §5.13 (new) |
| C21 | Storage writes are serialized so concurrent tabs cannot lose entries | §5.10, §6.1, §6.3 |
| C22 | Storage schema advances to v4 (adds optional `ended`) — Phase 3's write-ownership/freshness mechanism (§5.10) does not need or add its own persisted schema fields; see §7.3's note | §7.3 |
| C23 | §6.1 project structure and §6.3 manifest snippet corrected to include `background/storageWriter.js` and the `background.service_worker` manifest key; adds no permission and no network capability | §6.1, §6.3, §10.3 |
| C24 | Non-Goals reaffirmed for v4.0 — no change to which items are in or out of scope; the background service worker is an architecture change, not a scope change | §3.2 |

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

v3.0.0 is a trust and curation release. It resolves three defects reported against v2.0.0 that undermined the core promise — resume breaking on a title change, storage filling with untitled duplicate entries, and a saved position occasionally being silently overwritten with a near-zero value — and adds pinning, so a user with a long saved-videos list can guarantee specific entries survive the 200-entry cap indefinitely.

v4.0.0 is a reliability and correctness release, following a full extension audit. Resume success is now reported only after it is actually verified, never assumed; a failed resume can no longer overwrite a saved checkpoint. "Finished" is redefined to mean playback genuinely reached the end, decoupled from the resume cutoff, which in turn makes bulk removal of completed videos possible. Concurrent tabs saving progress at the same time can no longer lose each other's writes. Explicit timestamp links now take defined precedence over saved progress.

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
| **G12** | **Let users protect specific saved videos from the 200-entry eviction cap by pinning them** | **v3.0** |
| **G13** | **Guarantee that a saved position is never replaced by a near-zero position the user did not cause** | **v3.0** |

> **G3 and G10 are not in conflict.** Defaults must remain correct for a user who never opens settings. Settings are an escape hatch, not a setup step.

### 3.2 Non-Goals (v4.0)

| # | Non-Goal | Rationale |
|---|---|---|
| NG1 | Cross-device sync | Requires backend or `storage.sync` quota design; out of scope |
| NG2 | Resume for Shorts, live streams, or embeds | Incompatible with resume semantics |
| NG3 | Visible in-player UI beyond the Restart button and resume toast | Contradicts invisible-by-default philosophy |
| NG5 | Analytics or telemetry | Privacy non-negotiable |
| NG6 | Firefox or Safari support | Chrome-first; extension model differs |
| **NG7** | **Live propagation of settings changes into already-open YouTube tabs** | Settings apply on next navigation; live push adds messaging complexity for negligible benefit |
| **NG8** | **Editing or renaming saved entries** | The panel is for viewing, opening, and removing — not curation |

> **NG8 has one bounded exception: pinning (§5.11).** Pinning is curation in that it changes retention
> (exempt from the 200-entry cap) and ordering (sorts to top) — but it never edits or renames an
> entry's content (title, channel, thumbnail, saved position). NG8's prohibition targets content
> edits specifically; pinning doesn't reopen it.

> **NG4 (no settings page) is removed in v2.0 and stays removed in v3.0.** A settings surface shipped as a panel inside the popup rather than a separate options page, and remains in scope — it is not a non-goal being reconsidered. See §5.8.
>
> **Unchanged for v3.0:** cross-device sync (NG1), resume for Shorts/live/embed (NG2), analytics or telemetry (NG5), and Firefox/Safari support (NG6) all remain non-goals. Pinning (§5.11) does not reopen any of these — it is additive to the existing local-storage model.

> **Unchanged for v4.0:** cross-device sync (NG1), resume for Shorts/live/embed (NG2), analytics or telemetry (NG5), and Firefox/Safari support (NG6) all remain non-goals, unaffected by v4.0's reliability and completion work. The background service worker introduced in v4.0 (§6.1, §6.3) is an architecture change to how storage writes are serialized, not a scope change — it adds no permission, no network capability (§10.3), and no user-facing capability of its own.

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

#### UC-9: Protecting a Video from Eviction *(new in v3.0)*
**Given** a user has a saved video they want to keep indefinitely, even as their 200-entry list fills with newer videos
**When** they pin it from the saved videos panel
**Then** it sorts to the top of the list and is never removed by the 200-entry cap, regardless of how many other videos are saved afterward

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

> **v4 Phase 5 correction (F05/R8):** an unconditional `seeked` save is only safe when the seek is corroborated by real keyboard/pointer input in the last ~2 seconds. A native jump can fire `seeked` too; an uncorroborated one is now checked against the same large-backward-jump guard an interval save faces, instead of saving through it unconditionally.

**Tracking must be skipped when:**
- `video.duration === Infinity` (live stream)
- The URL matches an excluded pattern (§5.1)
- An advertisement is active (§5.7)
- `currentTime` is `NaN`, negative, or exceeds `duration`
- Total watched time is below the configured minimum (§5.8)
- A seek is currently in flight (`video.seeking === true`) — *(new in v4 Phase 6, 6.7)*: a pending seek is never persisted as a completed position, on any trigger.

> **v4 Phase 6 checkpoint-loss budget (6.8):** the guarantees above assume the page has a chance to run JS — an ordinary tab close, navigation away, or SPA exit flushes the last known-good sample synchronously as part of teardown (`progressTracker.stop()`), so the worst-case loss there is bounded by however long ago that last good sample was captured (at most ~1 poll tick, ≤1s, under normal playback). An **abrupt termination that kills the page process outright — a browser crash, the OS killing the tab, or Chrome force-quitting** — gets no such chance to run teardown code at all. In that case the worst-case loss window is the time since the last successful `setInterval`/event-triggered save actually completed and was acknowledged by the writer (up to 5 seconds under the ordinary cadence, more under a throttled/suspended background tab — see §5.4's tracking-interval table). This is a deliberately bounded, honest budget, not a promise of exact recovery after every kind of termination; PRD/TDD and the roadmap's Phase 6 exit criteria measure ordinary close/reopen and crash/kill/discard separately for exactly this reason (Roadmap v4 Phase 6, T6.6).

> **v4 Phase 6 deferred recovery (6.1/6.2):** a per-video session whose player discovery timed out, or whose resume's metadata wait timed out, is not abandoned outright — it stays eligible to complete automatically on the next meaningful signal: the tab becoming visible, a `pageshow` (bfcache/back-forward restore), the player element being replaced without a video-ID change, or (for a metadata timeout specifically) a later `loadedmetadata` event. A session that already reached normal, successful playback is never re-seeked merely because one of these signals fires (6.4) — recovery only ever acts on a session that never got established in the first place.

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

**Manual-seek abort guard (revised in v2.0; direction/intent-aware since v4 Phase 5):**

The v1.0 guard aborted if `video.currentTime > 5` after the delay. This was incorrect: during a pre-roll ad, `currentTime` reflects **ad** position, so any ad longer than 5 seconds silently cancelled the resume.

The v2.0 guard compared against the position recorded immediately before the delay, aborting on any forward movement beyond 10 seconds of natural drift — by magnitude alone, regardless of cause. v4 Phase 5 found this both over- and under-inclusive (F08): a native jump with no genuine user action behind it doesn't deserve to cancel resume at all, while a real backward seek could theoretically go unrecognized. The guard now checks direction-agnostic drift against elapsed time and playback rate (0 expected drift while paused), then asks whether the drift correlates with an actual keyboard/pointer/accessible-control interaction in the last 800ms — not the `seeked` event alone, which a native jump can also fire. Corroborated → this is a deliberate user seek; cancel automatic resume outright and track the rest of the session normally, as if the user had always been driving. Uncorroborated → native interference; proceed with the resume anyway, overriding it.

**Seek verification (new in v2.0; readiness-aware since v4 Phase 5):**

After assignment, the extension re-reads `currentTime` after 250ms. v4 Phase 5 found numeric proximity alone insufficient (F01/R1): a seek mid-flight (`video.seeking === true`, or a frame that hasn't actually loaded) can read as numerically close without having landed. A seek now counts as verified only when `!seeking`, `readyState` indicates the frame has loaded, **and** drift is within 3 seconds — re-assigning otherwise, to a maximum of 3 attempts. Unbounded retry loops remain prohibited; a seek that never settles within that bounded window is reported internally as a *pending* outcome — never silently treated as success, and never retried indefinitely — a session that never becomes ready this way is Phase 6's Deferred Recovery Lifecycle to complete later.

A verified seek is not the end of native-override risk either (F01/R2): YouTube's own restore cue can still move playback several seconds later. A bounded (~2s) background check keeps watching after the seek settles and corrects a late override, standing down immediately if it detects genuine user input instead.

**Timestamp precedence (new in v4 Phase 5, D-107/F20):** if the navigation URL carries an explicit, valid `t=` value, it wins outright for that navigation — automatic saved-position resume is cancelled before it starts, and the resulting playback is tracked as an ordinary user-directed session from the beginning, not specially protected. YouTube's own player performs the actual timestamp seek; the extension's only job is not to fight it with a competing saved-position seek. An absent or malformed `t=` value is ignored and automatic resume proceeds normally.

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
| Treat as finished at | Videos watched past this fraction do not resume | 90% / 95% / 98% / Only at the end *(v4.0)* | 95% |
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

*(v4.0)* **"Only at the end"** suppresses resume only once a video has genuinely finished (§5.10), rather than at any percentage-of-duration threshold — see §5.10 for what "finished" means.

**Deliberately not configurable:** the 400ms resume delay, the 5-second save interval, and the 200-entry storage cap.

---

### 5.9 Saved Videos Panel *(new in v2.0)*

Clicking the extension icon opens a panel listing saved videos, newest first.

**Each row shows:**
- Video thumbnail (144×81), with the video's duration and a watched-progress line overlaid on it, YouTube-style
- A pinned badge on the thumbnail *(v3.0)*, shown only when the video is pinned — visible without hovering
- Video title, falling back to `Untitled video` where unknown
- Channel/uploader name, omitted entirely when not yet captured (no placeholder text)
- Saved position and total duration, plus percentage watched

**Behaviour:**
- Clicking a row opens that video in a new tab; the extension then resumes it through the normal resume path — no separate mechanism
- Each row has a remove control deleting that single entry, updating the list in place
- Each row has a pin/unpin control *(v3.0, §5.11)*, revealed on hover like the remove control; toggling it re-sorts only that row, not the full list
- Empty state is shown when nothing is saved
- The header shows the saved count, an icon-only Ko-fi support link, and a control to open settings
- Rendering completes in under 200ms with a full 200 entries; thumbnails may load progressively but must not block the list
- While the panel stays open, it stays live *(new in v4.0)*: a video's progress updating elsewhere, an entry being evicted, or another window's action all reflect in the open list without the user needing to reopen it. Turning thumbnails off applies immediately to already-rendered rows, not only on next open

**Thumbnails:**
- Loaded from YouTube's public image CDN at `https://i.ytimg.com/vi/{videoId}/mqdefault.jpg`
- This requires no additional permission and transmits no user data beyond the ordinary request
- Failures (deleted or private videos) show a neutral placeholder, never a broken image
- When the thumbnails setting is off, no request is made at all and the extension remains fully offline
- The duration badge and watched-progress line are plain text/CSS, not part of the image — they render on placeholders and with thumbnails disabled, without making any request

**Opening a video requires no `tabs` permission** — rows are ordinary links.

**Title capture** strips both a trailing `" - YouTube"` suffix and a leading `(3)`-style unread-notification-count prefix from the browser tab title, so neither ever leaks into a saved title.

---

### 5.10 Defect Resolution *(new in v3.0)*

Three defects were reported against v2.0.0. This section states the user-visible symptom and the
guaranteed post-fix behaviour for each, as product requirements. **The mechanism behind each fix is
still under investigation as of this PRD revision** (ROADMAP_v3.md Phase 0) and is intentionally not
described here — mechanism is the roadmap's and the TDD's responsibility, not the PRD's.

| Defect | Symptom (as reported) | Guaranteed behaviour after the fix |
|---|---|---|
| **D-A** | Resume stopped working for a video after its title changed (e.g. the creator edited the title after upload) | A video's saved position and resume behaviour depend **only** on its YouTube video ID. A title change — by the creator, by YouTube, or by any other means — must never affect whether or where that video resumes. |
| **D-B** | Storage filled with 200 entries all labeled "Untitled video," crowding out real saved videos | Each video the user actually watches occupies **at most one** entry, regardless of whether its title was available to capture at the moment of saving. A title being unavailable must never cause a duplicate entry, and must never by itself consume eviction capacity that a real, distinct video would otherwise use. |
| **D-C** | Resume intermittently failed, and inspecting the saved data showed the position had been overwritten to nearly zero | See the data-durability guarantee below. |

**Data-durability guarantee (product promise):** A saved playback position is never replaced by a
near-zero position that the user did not cause. If the user genuinely seeks or restarts a video to
its beginning, that is saved normally. A saved position must never be silently overwritten by a
near-zero value arising from any other condition — a bug, a timing issue, an unrelated page event, or
anything else. This is G13 and holds regardless of which specific mechanism Phase 0 finds responsible
for defect D-C.

**Resume reliability guarantees *(new in v4.0)*:** Resume success is reported to the user — and to any
UI that depends on it (§5.6) — only after the outcome has been verified, never on the assumption that
a seek instruction was accepted. A resume attempt that fails, at any stage, must never overwrite the
saved checkpoint with the video's unresumed startup position; the last genuine saved position always
survives a failed resume, so the user never loses recoverable progress because an attempt to restore
it went wrong.

**Completion, redefined *(new in v4.0)*:** "Finished" and "resumable" are two different, independently
tracked facts about a video. The resume cutoff (`completionThreshold`, §5.8) governs only whether
resume is offered near the end of a video — it has never meant, and still does not mean, that the
video was actually watched to completion. A video is **finished** only when playback genuinely reached
its end. The saved videos panel's displayed watched-percentage (§5.9) no longer rounds up to 100% for
a video that was merely close to the end; it shows 100% only for a video that actually finished. This
distinction is what makes bulk removal of completed videos (§5.12) safe: it operates on "finished,"
never on "past the resume cutoff" or "displays near 100%."

For videos saved before this distinction existed, a conservative fallback applies: such an entry is
treated as finished only if its saved position is within the smallest unit the existing integer-second
storage can represent of its duration — never by the resume cutoff or the rounded displayed
percentage. Erring toward **not** counting a legacy video as finished is the safe direction, since the
user can still remove it individually.

**Storage write durability *(new in v4.0)*:** Saved progress, deletions, pins, and settings changes
from multiple open YouTube tabs are never lost to each other. Two tabs saving progress around the same
time each end up reflected in storage — neither write silently disappears because the other happened
first, last, or concurrently.

**Write ownership and freshness *(new in v4.0, Phase 3)*:** When the same video is open in more than
one tab, a tab that has merely gone idle or lost focus does not get to overwrite a fresher checkpoint
another, actually-active tab just saved — a stale tab's next pause/hidden event must never clobber
further-along progress. That protection is not permanent: a tab that resumes genuine watching (real
playback progressing, or a deliberate seek) can take ownership again normally. Deleting a saved video,
or clearing all saved videos, must not be quietly undone a moment later by an unrelated, unchanged tab
for that same video still sitting open — its next lifecycle event does not resurrect what was just
removed, though continuing to genuinely watch that video afterward is allowed to save a new entry for
it, since that is legitimate renewed progress, not resurrection. A save that could not be written is
retried automatically, without any action from the user, the next time a natural save moment occurs —
never silently dropped and never left stuck retrying the same failed value forever once it succeeds.

### 5.11 Pinned Videos *(new in v3.0)*

Users can pin a saved video from the saved videos panel (§5.9) to protect it from automatic removal.

**Requirements:**
- Any saved video can be pinned or unpinned from the panel
- Pinned videos always sort above unpinned videos in the panel, regardless of when they were last watched
- Pinned videos are **never** evicted by the 200-entry cap (§7.5) — the cap applies to unpinned videos only
- A maximum of **20** videos may be pinned at once. Attempting to pin a 21st is refused; no existing pin is ever removed automatically to make room
- **"Clear saved progress" in settings removes pinned videos too.** Pinning protects against the automatic 200-entry cap; it is not an exemption from an explicit, user-initiated deletion of all saved data
- Pinning requires no new permission and issues no network request

### 5.12 Bulk Removal of Completed Videos *(new in v4.0)*

The saved videos panel (§5.9) gains a "Remove completed" action alongside the existing single-row
remove and "Clear saved progress" controls.

**Requirements:**
- Removes every saved video that is **finished** (§5.10) — never videos that are merely past the
  resume cutoff or displaying a percentage close to 100%
- **Pinned videos are preserved by default.** A separate, explicit opt-in is required to include
  pinned videos in the removal
- Before anything is removed, the user sees the exact count of videos that will be removed, reflecting
  the current preserve-pins/include-pins choice
- The action is a single confirmation step, consistent with the panel's existing remove and
  clear-all controls — it does not introduce a new confirmation pattern
- The action either removes the full eligible set or removes nothing; a partial removal is never left
  visible to the user
- There is no undo. Once confirmed, removal is final, consistent with the panel's existing single-row
  remove and "Clear saved progress" controls, neither of which offers undo today
- Requires no new permission and issues no network request

### 5.13 Timestamp Link Precedence *(new in v4.0)*

YouTube watch URLs can carry an explicit timestamp (`t=` parameter) set by whoever shared the link —
the creator, another viewer, or the user themselves — separately from anything this extension has
saved for that video.

**Requirements:**
- A valid, explicit timestamp in the URL takes precedence over any saved progress for that video.
  Automatic resume does not run for that navigation
- Playback that results from an explicit timestamp is treated as an ordinary viewing session: it is
  tracked and saved normally (§5.4), and does not receive any special protection beyond that
- An absent or malformed timestamp parameter has no effect — resume behaves exactly as it does today
  (§5.5)
- This precedence rule requires no new permission and issues no network request

---

## 6. Technical Architecture

### 6.1 Project Structure

> Corrected in v2.0 to match shipped code. The v1.0 PRD listed a superseded layout (`youtube.js`, `storage.js`) that was never built. **Corrected again in v3.0:** `utils/debugLogger.js` had shipped since v2.0.0 (Phase 1 instrumentation) but was missing from this tree and from §6.3's manifest snippet. **Corrected again in v4.0:** a `background/` directory is added — the extension's first background service worker (§6.3, §10.3).

```
youtube-resume/
│
├── manifest.json
│
├── background/
│   └── storageWriter.js        # Sole writer of every chrome.storage.local mutation; serializes writes across tabs
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
│   ├── storageValidation.js    # Pure schema/validation/repair logic shared by storageManager.js
│   │                             # and storageWriter.js; no chrome.storage access of its own
│   └── storageManager.js       # chrome.storage.local abstraction, settings, migration
│
├── utils/
│   ├── debugLogger.js          # Gated debug logging ([YTResume]-prefixed); no-ops when DEBUG is false
│   ├── youtubeUtils.js         # URL parsing, videoId extraction, title/channel capture
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
| `resumeManager.js` | Validates against settings, gates on ad state, applies the 400ms delay, seeks, and verifies. *(v3.0)* Re-asserts the seek once, 500ms after the initial one, in case a native YouTube resume raced and overrode it (G13/D-090). |
| `progressTracker.js` | Owns the single `setInterval` and all playback event listeners. Captures the video title and channel name on save. *(v3.0)* Starts disarmed on every load and only arms once the resume attempt resolves, so a resume-triggered seek is never mistaken for a user write; rejects an interval-triggered save that jumps backward more than 30s without a preceding seek (G13/D-066/D-090). |
| `storageManager.js` | The module every other module calls for watch data, settings, eviction, and schema migration. Reads `chrome.storage.local` directly. *(v4.0)* Mutations route through `storageWriter.js` (below), which is the only module that writes to `chrome.storage.local`; `storageManager.js`'s own API is unchanged. |
| `storageWriter.js` *(v4.0)* | Background service worker. The sole writer for every `chrome.storage.local` mutation (§6.3). Serializes writes so concurrent tabs cannot lose entries (§5.10). |
| `uiInjector.js` | Injects and tears down the Restart button and resume toast. `document.createElement` only. |
| `debugLogger.js` | Gated debug logging, `[YTResume]`-prefixed. No-ops when `DEBUG` is `false`; no other module makes ad hoc `console.log` calls. |
| `youtubeUtils.js` | Pure URL and page-type inspection, plus video title and channel name extraction |
| `timeUtils.js` | Pure threshold math and timestamp formatting |
| `popup/*` | Saved videos list and settings panel. Reads through `storageManager` semantics; no direct DOM injection into YouTube. |

### 6.3 Manifest (v3)

```json
{
  "manifest_version": 3,
  "name": "YouTube Resume",
  "version": "4.0.0",
  "description": "Automatically resume YouTube videos exactly where you left off.",
  "permissions": ["storage"],
  "host_permissions": ["https://www.youtube.com/*"],
  "background": {
    "service_worker": "background/storageWriter.js"
  },
  "action": {
    "default_popup": "popup/popup.html"
  },
  "content_scripts": [
    {
      "matches": ["https://www.youtube.com/*"],
      "js": [
        "storage/storageValidation.js",
        "storage/storageManager.js",
        "utils/debugLogger.js",
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

**Permissions must not change in v4.0 either.** The `background.service_worker` key added above (§10.3) is a manifest structure change, not a permission — it requires no new entry in `permissions` or `host_permissions`, and issues no network request of its own.

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
| `youtubeResumeQuarantine` | Data the boundary-repair pass could not safely resolve into `youtubeResume` (§7.3), plus a bounded log of recent repair merges | v4.0 (Phase 1) |

> Schema version, settings, and quarantine are **separate root keys**, never nested inside `youtubeResume`. That object's keys are counted for the 200-entry cap and iterated during eviction; any non-videoId key inside it would corrupt both. `youtubeResumeQuarantine` is never read by any resume/tracking/popup code path and is never auto-emptied.

### 7.3 Data Schema — v4

```typescript
type VideoProgress = {
  time: number;       // Playback position in seconds (integer)
  duration: number;   // Total video duration in seconds (integer)
  updated: number;    // Unix timestamp (seconds) of last save
  title?: string;     // v2.0 — video title, max 200 chars, optional
  channel?: string;   // v2.0 (post-Phase-8 polish) — channel/uploader name, max 200 chars, optional
  pinned?: boolean;   // v3.0 — user-set; absent/false = unpinned; see §5.11
  ended?: boolean;    // v4.0 (Phase 7) — true only when playback genuinely reached the end; absent/false = not finished; see §5.10
};
// v4.0 (Phase 3): no new persisted fields. Write ownership/freshness (§5.10) is decided from the
// existing `updated` timestamp plus write-ownership/freshness state the service worker keeps only
// for its own in-process lifetime (never a durability boundary, same as its command queue) — not a
// schema addition. An earlier planning pass anticipated persisted `revision`/`owner` fields for this;
// Phase 3's actual implementation found the existing `updated` field already sufficient and left the
// schema at v3 until Phase 7's `ended` bump. See DECISIONS.md.

type Settings = {
  minWatchSeconds: number;       // default 30
  completionThreshold: number;   // default 0.95; v4.0 — also accepts 1, meaning the fourth "Only at the end" option (§5.8)
  rewindSeconds: number;         // default 2
  showToast: boolean;            // default true
  showRestartButton: boolean;    // default true
  loadThumbnails: boolean;       // default true
};
```

**Identity invariant (v3.0, Roadmap Phase 1):** the YouTube video ID is the sole, structurally
enforced identity for a `youtubeResume` entry — the only value ever used as its storage key or in
any equality/lookup check. `title` and `channel` are refreshed, display-only metadata: they are
never read for lookup, comparison, or key derivation anywhere in the codebase, so a title change
(e.g. a creator editing it after upload) can never create a duplicate entry or break resume for the
same video. **Unchanged in v4.0:** `ended` is likewise never used for lookup, comparison, or key
derivation — the video ID remains the only identity a `youtubeResume` entry has.

**Example stored value:**

```json
{
  "youtubeResume": {
    "dQw4w9WgXcQ": {
      "time": 1043,
      "duration": 2120,
      "updated": 1710000000,
      "title": "Building a UE5 game from scratch",
      "channel": "Some Game Dev Channel",
      "ended": false
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
  "youtubeResumeSchema": 4
}
```

**Title capture:** read from `document.title` with both the trailing ` - YouTube` suffix and a leading `(3)`-style unread-notification-count prefix stripped, falling back to a DOM selector, then to omission. `document.title` is used in preference to YouTube's metadata selectors because it is materially more stable across YouTube redesigns. A missing title must never block a save.

**Channel capture:** read from a DOM selector scoped to the primary watch-page metadata box (there is no `document.title` equivalent for channel name). A missing channel must never block a save, and existing entries are never backfilled — the panel simply omits the channel line until the video is watched again.

**Boundary validation (v4.0, Phase 1):** every field is validated where it enters or leaves storage, with a per-field default on failure rather than a whole-entry rejection — a bad `time`/`duration`/`updated` value never blocks the other valid fields on the same row, and a bad row never blocks an unrelated write. `time` must be finite and non-negative (else 0), `duration` finite and positive (else 0), `updated` finite, non-negative, and not implausibly far in the future (else 0). `title`/`channel` are kept only if string-typed. A stored row whose *value* isn't a usable object (`null`, an array, a primitive) is excluded from what reads return, and is quarantined (§7.2) rather than silently dropped, the next time the boundary-repair pass runs. Settings are validated the same way, field by field, against each setting's allowed presets (§5.8) rather than merged over the defaults wholesale — a wrong-typed or out-of-range stored value for one setting falls back to that setting's own default without touching the others.

**Boundary repair (v4.0, Phase 1):** the identity-resolution step that folds a stored key into its canonical video ID (§7.6-adjacent, `resolveVideoId`) only ever accepts an identity **proven** by exact parsing — the key itself (surrounding whitespace tolerated) or one of a small set of explicitly supported URL forms. It never guesses at a malformed key (e.g. a 12+ character token) by pattern-matching a substring out of it — doing so risks reassigning that data to a different, unproven video ID. A key it cannot resolve, or a row whose value isn't usable, is moved to `youtubeResumeQuarantine` (§7.2) instead of being merged into a guess or dropped; nothing quarantined is ever permanently deleted by this pass. When two rows do resolve to the same video ID, the merge preserves `pinned` from either side (a pinned duplicate never loses its pin) and any other compatible field, and the merge itself is recorded in a small bounded log alongside the quarantine key so the pre-merge values stay inspectable.

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
- **v3.0:** pinned entries (`pinned: true`, §5.11) are excluded entirely from the 200-entry count and from eviction candidacy — the cap of 200 applies to unpinned entries only. A separate hard cap of 20 pinned entries applies to pinning itself, enforced at pin time rather than by eviction.
- **v4.0 (Phase 1):** the 200-unpinned cap is enforced immediately after *every* operation that can change which entries are eligible for it — a save, an unpin, and the boundary-repair pass's merges — not only inside the write path. Unpinning an entry while the library already holds 200 unpinned entries immediately evicts the oldest eligible unpinned entry (by `updated`), the same selection rule eviction already uses at save time; the count is never left at 201 pending some later save.

### 7.6 Schema Migration — v1 → v2 *(new)*

The v1 → v2 change is **purely additive**: `title` is optional and every v1 entry remains valid under v2. Migration is therefore non-destructive by construction.

**On first run after update:**
1. Read `youtubeResumeSchema`. If it equals 2, stop — nothing to do
2. If absent, write `youtubeResumeSchema: 2`
3. If `youtubeResumeSettings` is absent, write the defaults
4. **Leave every existing `youtubeResume` entry untouched.** Do not rewrite, reorder, or backfill

Entries without a title display the fallback label in the panel until the user next watches that video, at which point a title is captured naturally.

**Requirements:** migration is idempotent, never deletes an entry, and never blocks resume if it fails. A migration failure logs a warning and the extension continues with defaults.

**v3.0 (Roadmap Phase 2):** the mechanism above is implemented as a version-aware step chain (one step
per schema version) instead of a single "write current version" check, so each step's idempotency is
explicit and independent rather than only true in aggregate — see TDD §4.6. This phase does not itself
introduce a new schema version. It also adds two non-destructive repair passes, both defensive rather
than reactive to a confirmed defect (Phase 0 found no evidence of malformed storage keys — see Roadmap
v3 "Phase 0 Findings"):
- **Duplicate merge:** any two `youtubeResume` entries found to resolve to the same underlying video ID
  are merged into one, keeping the furthest playback position and the most recently updated
  title/channel. Never reduces the count of distinct real videos represented, only duplicate rows for
  the same one.
- **Unresolved-ID rejection:** `saveProgress()` refuses (rejects its promise, logged, never thrown
  uncaught) any write whose `videoId` isn't a plausible YouTube video ID shape. No entry is written.

**Schema Migration — v2 → v3 (Roadmap v3 Phase 4, D-071):** the version bump itself — `pinned` added,
`youtubeResumeSchema` advanced to 3 — lands exclusively in Phase 4, as one more step in the version-aware
chain above, not in Phase 2's repair work. Also purely additive: `pinned` is optional and every
existing entry is valid without it (absent = unpinned). No entry is rewritten by the migration step
itself; `pinned` is only ever set by an explicit pin action (§5.11).

**Schema Migration — v3 → v4 (Roadmap v4 Phase 7, D-071-style precedent):** the version bump — `ended`
added, `youtubeResumeSchema` advanced to 4 — lands exclusively in Phase 7, as one more step in the
version-aware chain above, matching how v2→v3's `pinned` bump landed exclusively in its own phase
rather than wherever the migration mechanism was last touched. Purely additive: `ended` is optional and
every existing entry remains valid without it. An entry with no `ended` field is not assumed unfinished
outright; it falls back to the conservative legacy-inference rule described in §5.10 (finished only if
its saved position is within the smallest unit the existing integer-second storage can represent of
its duration). No entry is rewritten by the migration step itself; `ended` is set only by ordinary
playback reaching its end going forward. **Phase 3 does not bump the schema** — its write-ownership/
freshness mechanism (§5.10) uses the existing `updated` field and worker-lifetime-only state, adding no
persisted field (see §7.3's note; reverses an earlier planning-stage assumption, DECISIONS.md).

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
| Data minimization | Only `time`, `duration`, `updated`, `title`, and `channel` stored per video |
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

**v4.0 adds no permissions either.** The background service worker introduced at §6.1/§6.3
(`background/storageWriter.js`) runs under the extension's existing `storage` permission — background
service workers require no permission of their own to be declared in a manifest. It issues no network
request of any kind, matching the content script's zero-network policy (§9).

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
| `youtubeUtils.js` | Watch, Shorts, live, embed, non-YouTube URLs; videoId extraction; title extraction, suffix/notification-count-prefix stripping; channel name extraction |
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
| *(v3.0)* Title changes after saving | Resume and lookup unaffected; still one entry per video ID (G13/D-A) |
| *(v3.0)* Title unavailable at save time, repeatedly | At most one entry per video ID; no "Untitled video" pile-up (D-B) |
| *(v3.0)* Interval save fires with a stale, far-behind `currentTime` | Save rejected; last genuine position is not overwritten (G13/D-C) |
| *(v3.0)* Pin 20 videos, attempt a 21st | 21st refused; the 20 remain pinned; no auto-unpin |
| *(v3.0)* 200 unpinned + 20 pinned entries, one more save | Only an unpinned entry is evicted |
| *(v3.0)* Clear saved progress with pinned videos present | All entries removed, including pinned ones; confirmation names the pinned count |

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
| R16 | Defects D-A, D-B, and D-C (§5.10) no longer reproduce; a saved position is never replaced by a near-zero position the user did not cause (G13) |
| R17 | At most 20 pinned videos exist at any time; pinned videos are never evicted by the 200-entry cap (G12) |
| R18 | Resume success is reported only after a verified outcome; a failed resume never overwrites the saved checkpoint with the video's startup position (§5.10) |
| R19 | A video is treated as finished only when playback genuinely reached its end; the panel's displayed percentage no longer rounds up to 100% for a video that merely came close (§5.10) |
| R20 | "Remove completed" removes only finished videos, preserves pinned entries by default, and previews the exact count before acting (§5.12) |
| R21 | "Treat as finished at" offers a fourth "Only at the end" option and persists it like the existing three (§5.8) |
| R22 | An explicit, valid timestamp link takes precedence over saved progress for that navigation (§5.13) |
| R23 | Concurrent saves from multiple open tabs never lose an entry (§5.10) |
| R24 | Permissions unchanged from v3.0; the new background service worker requests no permission and issues no network request (§10.3) |
| R25 | Manifest V3 compliance verified; version reads `4.0.0` |
| R26 | Storage schema reads v4; every existing v1–v3 entry remains valid without `ended` (§7.3, §7.6) |
| R27 | All project documents consistent with shipped code |

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

- **Manifest V3:** through v3.0, no background script was required; all logic ran in the content script and popup. **v4.0** adds a background service worker (`background/storageWriter.js`, §6.1, §6.3) as the sole writer of `chrome.storage.local` mutations — an architecture change, not a permission or scope change (§3.2, §10.3)
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

*This document is the authoritative product specification for YouTube Resume v3.0.0. Implementation decisions trace back to requirements defined here. Deviations require product sign-off. For implementation detail, the TDD takes precedence; the PRD takes precedence on product intent and scope.*
