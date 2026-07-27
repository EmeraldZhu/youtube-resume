# UI/UX Specification
## YouTube Resume — Chrome Extension

---

| Field | Detail |
|---|---|
| **Product** | YouTube Resume |
| **Document Type** | UI/UX Specification |
| **Version** | 2.0.0 |
| **Previous Version** | 1.0.0 |
| **Status** | Approved — Ready for Implementation |
| **Last Updated** | 2026-07-26 |
| **Companion Documents** | PRD_YouTube_Resume.md v2.0.0, ROADMAP_v2.md, TDD_YouTube_Resume.md |

---

## Changelog — v1.0.0 → v2.0.0

| # | Change | Section |
|---|---|---|
| C1 | Restart button styling re-derived from measured YouTube DOM; the "no background or border" rule is **reversed** | §4.3, §4.6, §9.3 |
| C2 | Resume toast promoted from optional to required, and repositioned to clear the progress bar | §5 |
| C3 | Popup fully rewritten as two views: saved videos and settings | §6 |
| C4 | Popup width increases from 280px to 360px | §6.2 |
| C5 | Status row (`✓ Active on YouTube`) removed | §6 |
| C6 | Copy IDs CP-30 through CP-58 added; CP-12 and CP-13 retired | §7 |
| C7 | "No settings page" constraint rescoped to in-player UI only | §9.1 |

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Brand & Voice](#2-brand--voice)
3. [UI Surface Inventory](#3-ui-surface-inventory)
4. [Surface 1 — In-Player Restart Button](#4-surface-1--in-player-restart-button)
5. [Surface 2 — Resume Toast](#5-surface-2--resume-toast)
6. [Surface 3 — Extension Popup](#6-surface-3--extension-popup)
7. [Copy Reference](#7-copy-reference)
8. [Accessibility Requirements](#8-accessibility-requirements)
9. [Constraints & Anti-Patterns](#9-constraints--anti-patterns)

---

## 1. Design Philosophy

YouTube Resume has one job in the player and one job in the toolbar. The UI must reflect that with the same discipline.

### 1.1 Core Principles

| Principle | Meaning in Practice |
|---|---|
| **Invisible** | The extension produces zero UI during normal, uninterrupted playback. No badges, no banners, no tooltips unless earned by a meaningful event. |
| **Native** | Every pixel injected into YouTube's player must look like YouTube designed it — **as YouTube looks today, not as it looked when this document was first written.** Font, weight, colour, opacity, shape, and spacing must match the surrounding controls. |
| **Reliable** | UI only appears when something is certain to have happened. The Restart button does not appear unless a resume seek was applied **and verified**. No speculative UI. |
| **Legible** | *(new in v2.0)* Where the extension does show data — the saved videos panel — it must be immediately scannable. A list of video IDs is not legible; a list of thumbnails and titles is. |

### 1.2 The Trust Test

Before any UI element is added, ask: *does this element increase the user's trust in the product, or does it increase the product's visibility at the user's expense?*

If the answer is the latter, remove it.

### 1.3 The Native Test *(new in v2.0)*

**Native means native to current YouTube, not to a rule written about YouTube.**

v1.0 specified a flat, borderless Restart button and justified it as matching YouTube's flat dark control bar. YouTube subsequently moved to rounded-pill controls with hover fills. The rule outlived the thing it described, and the button now reads as foreign precisely because the anti-pattern rule was followed.

The lesson is codified: **in-player styling values are measured, not remembered.** Phase 5 of the roadmap produces `docs/YT_DOM_AUDIT.md` with computed values read from live YouTube. That file is the source of truth for §4.3 and §5.4, and re-measuring is the first step of any future visual fix.

---

## 2. Brand & Voice

### 2.1 Extension Identity

| Property | Value |
|---|---|
| **Name** | YouTube Resume |
| **Subtitle** | Automatically resume videos where you left off. |
| **Category** | Productivity / Utility |

### 2.2 Voice & Tone

| Attribute | Description | Example |
|---|---|---|
| **Direct** | Say exactly what happens | "Resumed from 17:23" not "Picking up right where you left off! 🎉" |
| **Minimal** | Fewest words that are still clear | "Restart" not "Restart Video From Beginning" |
| **Technical-neutral** | Functional language accessible to any user | "Clear saved progress" not "Flush storage cache" |
| **No marketing voice** | Copy inside the product is not an ad | No exclamation marks, no superlatives, no emoji in functional copy |
| **Plain over precise** *(v2.0)* | Settings labels favour the user's words over the code's | "Rewind on resume" not "Rollback seconds"; "Treat as finished at" not "Completion threshold" |

### 2.3 Copy Rules

1. **Sentence case everywhere.** "Clear saved progress" — not "Clear Saved Progress".
2. **No trailing punctuation on labels or button text.** Helper text below a setting is a sentence and does take a full stop.
3. **Active voice for actions.**
4. **Confirmation dialogs state the action plainly.**
5. **No first-person from the extension.** Never "I saved your progress".
6. **No jargon in settings.** *(v2.0)* If a label needs the user to understand a code concept, rewrite it.

---

## 3. UI Surface Inventory

| Surface | Trigger | Location | Duration | Status |
|---|---|---|---|---|
| **Restart Button** | Resume seek applied and verified | YouTube player controls bar | 7 seconds, then auto-removed | Required; user-disableable |
| **Resume Toast** | Resume seek applied and verified | Lower-left of the video frame, clear of the progress bar | ~2.2 seconds, fades out | **Required in v2.0**; user-disableable |
| **Popup — Saved videos** | User clicks the extension icon | Chrome toolbar popup | Persistent while open | Required |
| **Popup — Settings** | User clicks the gear in the popup header | Same popup, second view | Persistent while open | Required |

> **Toast status change:** the toast was optional in v1.0. It ships and is now required, because with two of the three in-player signals user-disableable, the specification must define both properly rather than treating one as provisional.

> **Settings is a view, not a page.** It renders inside the popup and replaces the list view in place. It must not open a browser tab, an options page, or a separate window.

---

## 4. Surface 1 — In-Player Restart Button

### 4.1 Purpose

A single, time-limited escape hatch after a resume occurs, for when the resume was unwanted.

### 4.2 Trigger Condition

Injected **only** when `resumeManager` has set `video.currentTime` **and verified** that the seek held. It must not appear on any other condition, and must not appear when `showRestartButton` is off.

### 4.3 Visual Specification

#### Copy

| State | Copy | ID |
|---|---|---|
| Default label | `↺ Restart` | CP-01 |
| Hover tooltip | `Restart video from the beginning` | CP-02 |

#### Placement

```
[ ▶ ]  [ 🔊 ]   3:03 / 18:34   [ ↺ Restart ]          [ ⚙ ] [ ⛶ ]
                      ↑               ↑
              .ytp-time-display   Injected here,
                                  as next sibling
```

Injected as the **next sibling** of `.ytp-time-display` inside `.ytp-left-controls`.

#### Styling

> **Measured, not assumed** — from `docs/YT_DOM_AUDIT.md` (Phase 5, D-026/D-046), read via
> `getComputedStyle()` on a live YouTube watch page. No native inline **text** button exists in the
> control bar to copy directly (icon buttons are flat, opacity-hover only — see the audit's
> "Finding"), so the pill fill and radius are derived from the nearest real analog: the measured
> `.ytp-menuitem` hover intensity and the 40px control-row height.

| Property | v1.0 value | v2.0 value (measured/derived) |
|---|---|---|
| `font-family` | `Roboto, Arial, sans-serif` | `"YouTube Noto", Roboto, Arial, Helvetica, sans-serif` — matches `.ytp-time-display` |
| `font-size` | `12px` | `14px` — matches `.ytp-time-display`; v1.0's 12px was confirmed undersized (V5) |
| `font-weight` | `500` | `500` — matches `.ytp-time-display` |
| `color` | `#ffffff` | `#eeeeee` — matches `.ytp-time-display` |
| `background` (rest) | `none` | **Reversed.** `rgba(255, 255, 255, 0.1)` — measured `.ytp-menuitem` hover-fill intensity, applied at rest since no native rest-state pill exists to copy |
| `background` (hover) | *(n/a)* | `rgba(255, 255, 255, 0.2)` — double the rest fill, giving clear hover affordance |
| `border-radius` | *(none)* | `20px` — full pill, derived from the 40px control-row height |
| `border` | `none` | `none` — no native control uses a border, only background fills |
| `padding` | `0 8px` | `0 12px` |
| `height` / `line-height` | *(none)* / `1` | `40px` / `40px` — matches the native control row height |
| Hover treatment | opacity → `1.0` | Background fill only (see above) — opacity stays `1` at all times |
| `cursor` | `pointer` | Retained |
| `vertical-align` | `middle` | Retained |
| `transition` | *(none)* | `background-color 0.1s cubic-bezier(0, 0, 0.2, 1)` — matches measured native icon-button transition timing |

**The test is not "does it follow the table". The test is "can you tell which control the extension added".**

#### Separator

The `↺` glyph is the implicit separator from the time display. No divider character.

### 4.4 Behavior Specification

| Event | Behavior |
|---|---|
| **Injected** | Appears immediately after a verified resume seek |
| **Hover** | Matches the native control hover state exactly; browser tooltip shows CP-02 |
| **Click** | `video.currentTime = 0`; storage entry deleted; button removed immediately |
| **Auto-dismiss** | Removed from DOM after 7 seconds |
| **Navigation** | Removed immediately if the user navigates before auto-dismiss |
| **Player rebuild** | If YouTube rebuilds the controls DOM (fullscreen, quality change), the button may disappear early — acceptable |
| **Setting off** | Not injected at all. Resume still occurs; the toast still appears if enabled |

### 4.5 Implementation Notes

- Create via `document.createElement('button')` — never `innerHTML`
- `id="yt-resume-restart-btn"` for idempotent removal
- No `!important`; rely on inline-style specificity
- `title` attribute supplies the native hover tooltip
- Do not inject if `.ytp-time-display` is absent; log a warning and return silently — the resume still happened
- Verify in default, theater, fullscreen, and miniplayer modes

### 4.6 What to Avoid

| Anti-Pattern | Reason |
|---|---|
| `"Start Over"` | Vague — doesn't communicate the result |
| `"Restart From Beginning"` | Redundant — "Restart" already implies it |
| `"↩ Restart"` | `↩` implies undo; `↺` implies replay |
| A persistent button | It is not a permanent control |
| **Styling from this document rather than from measurement** | The cause of the v1.0 mismatch |
| **A flat borderless button** | *(reversed in v2.0, D-027)* Confirmed via `docs/YT_DOM_AUDIT.md`: matching the old rule instead of shipping a real pill is what made the button read as foreign next to a rounded chip aesthetic elsewhere in the player (the settings-menu overlay) |

---

## 5. Surface 2 — Resume Toast

### 5.1 Status

**Required in v2.0.** User-disableable via the `showToast` setting, default on.

### 5.2 Purpose

Momentary confirmation that the extension acted. Users who miss the Restart button still receive passive confirmation that something intentional happened.

### 5.3 Trigger Condition

Displayed **only** when a resume seek is applied and verified and a valid `resumeTime` is known, and only when `showToast` is on.

### 5.4 Visual Specification

#### Copy

```
Resumed from 17:23
```

Formatted `m:ss` under one hour, `h:mm:ss` at one hour or longer.

| `resumeTime` (seconds) | Displayed As |
|---|---|
| 83 | `1:23` |
| 1043 | `17:23` |
| 3661 | `1:01:01` |

#### Placement

```
┌─────────────────────────────────────────────┐
│                                             │
│              [  Video Frame  ]              │
│                                             │
│   ┌──────────────────────┐                  │
│   │  Resumed from 17:23  │  ← toast         │
│   └──────────────────────┘                  │
│                                             │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │ ← must stay clear
│ ▶  🔊  3:03 / 18:34  ↺ Restart      ⚙  ⛶  │
└─────────────────────────────────────────────┘
```

Lower-left of the video frame, **fully clear of the progress bar**.

#### Known v1.0 Defects — must be fixed

| # | Defect | v1.0 cause |
|---|---|---|
| V1 | The red progress line runs directly through the toast | `bottom: 48px` was calibrated against a shorter control area than YouTube now uses |
| V2 | Corners read as generic and dated | `border-radius: 2px`; YouTube's current overlay chips are substantially rounder |
| V3 | Toast sits flush against the player edge | `left: 12px` is a smaller inset than YouTube's own overlays use |

#### Styling

> Measured from `docs/YT_DOM_AUDIT.md` (Phase 5, D-026/D-046) — the `.ytp-settings-menu` popup
> panel is YouTube's own current overlay-chip component, so its background and radius are used
> directly rather than approximated.

| Property | v1.0 value | v2.0 value (measured/derived) |
|---|---|---|
| `background` | `rgba(0, 0, 0, 0.75)` | `rgba(0, 0, 0, 0.6)` — matches the measured `.ytp-settings-menu` panel |
| `color` | `#ffffff` | `#eeeeee` — matches `.ytp-time-display` |
| `font-family` | `Roboto, Arial, sans-serif` | `"YouTube Noto", Roboto, Arial, Helvetica, sans-serif` |
| `font-size` | `13px` | `13px` — matches the measured `.ytp-tooltip` size (≈12.98px), retained |
| `font-weight` | `400` | `500` — matches the measured `.ytp-tooltip` weight |
| `padding` | `6px 12px` | `8px 14px` |
| `border-radius` | `2px` | `12px` — matches the measured `.ytp-settings-menu` panel. Confirmed defect (V2), now fixed |
| `position` | `absolute` | Retained |
| `bottom` | `48px` | **Derived at runtime** from `.ytp-chrome-bottom`'s measured height + 12px clearance (D-028), not hard-coded — measured `59px` control-bar height holds identically in default and theater mode |
| `left` | `12px` | `16px` — in the same range as the measured `.ytp-cards-button` corner inset (8–12px), increased per V3 |
| `z-index` | Overlay layer | Retained |
| `pointer-events` | `none` | Retained — non-negotiable |

#### Animation

| Phase | Duration | Easing |
|---|---|---|
| Fade in | `200ms` | `ease-out` |
| Hold | `1600ms` | — |
| Fade out | `400ms` | `ease-in` |
| **Total visible** | **~2200ms** | — |

### 5.5 Implementation Notes

- Inject into `#movie_player`, not the controls bar
- CSS `opacity` transition for fade — never a `visibility` toggle
- **Remove from the DOM entirely** after fade-out; a hidden leftover element is a defect
- Must not interfere with YouTube's own overlay messages
- Must not overlap the Restart button or the time display in any player mode
- When `showToast` is off, do not create the element at all

---

## 6. Surface 3 — Extension Popup

> **Fully rewritten in v2.0.** The v1.0 popup was a status card. v2.0 replaces it with a two-view utility: a saved videos list and a settings panel.

### 6.1 Purpose

| View | Purpose |
|---|---|
| **Saved videos** (default) | Show what the extension has saved, let the user open any of it, and let them remove individual entries |
| **Settings** | Adjust the six tunable preferences; clear all data; support and cross-promotion links |

### 6.2 Design Constraints

| Constraint | Value | Change from v1.0 |
|---|---|---|
| Width | **360px** fixed | Was 280px. A thumbnail list is unusable at 280px |
| Maximum height | 560px | New |
| Scroll behaviour | List region scrolls internally; header stays fixed | New |
| Render time | Under 200ms with 200 entries | Retained |
| Loading states | None. No spinners, no skeletons | Retained |
| Thumbnails | May load progressively after first paint; must never block the list | New |
| View transitions | Instant replacement. No slide, fade, or animation | New |
| Theme | Standard Chrome extension utility, not YouTube-themed | Retained |

> The v1.0 constraint "the popup must not feel like an app — it should feel like a system tooltip" is **formally relaxed**. A scrollable media list is not a tooltip. The replacement constraint: *the popup should feel like a well-built system utility — dense, fast, and free of decoration.*

### 6.3 View 1 — Saved Videos

#### Layout

```
┌────────────────────────────────────────────────┐
│  YouTube Resume            34 saved videos  ⚙ │ ← fixed header
├────────────────────────────────────────────────┤
│ ┌──────────┐                                   │
│ │          │  Building a UE5 game from      ✕ │
│ │  thumb   │  scratch — part 3                 │
│ │ 120×68   │  ▓▓▓▓▓▓▓░░░░░░░░░░░░░             │
│ └──────────┘  3:03 / 18:34 · 16% watched       │
├────────────────────────────────────────────────┤
│ ┌──────────┐                                   │
│ │  thumb   │  Advanced TypeScript patterns  ✕ │
│ │          │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░             │
│ └──────────┘  42:10 / 58:22 · 72% watched      │
├────────────────────────────────────────────────┤
│                     ⋮ scrolls                  │
└────────────────────────────────────────────────┘
```

#### Row Specification

| Element | Spec |
|---|---|
| Thumbnail | 120×68, `https://i.ytimg.com/vi/{videoId}/mqdefault.jpg`, `loading="lazy"` |
| Title | Two lines maximum, ellipsis overflow. Falls back to CP-37 |
| Progress bar | Fill proportional to `time / duration` |
| Meta line | CP-34 and CP-35 — `{position} / {duration} · {percent}% watched` |
| Remove control | `✕`, revealed on row hover, always keyboard-focusable |
| Whole-row target | `<a href="https://www.youtube.com/watch?v={id}" target="_blank" rel="noopener noreferrer">` |

**Sort order:** `updated` descending — most recently watched first. Not configurable.

**Thumbnail failure:** on load error, show a neutral placeholder. Never a broken-image icon, never a console error. Deleted and private videos are an expected case, not a bug.

**Thumbnails disabled:** render the placeholder and issue **no** network request. `loading="lazy"` is not sufficient — the `src` must not be set at all.

#### Empty State

```
┌────────────────────────────────────────────────┐
│  YouTube Resume                             ⚙ │
├────────────────────────────────────────────────┤
│                                                │
│            No saved videos yet                 │
│                                                │
│    Videos you watch will appear here once      │
│    your position is saved.                     │
│                                                │
└────────────────────────────────────────────────┘
```

The empty state doubles as the confirmation that the extension is installed and working. This is why the v1.0 status row could be removed.

### 6.4 View 2 — Settings

#### Layout

```
┌────────────────────────────────────────────────┐
│  ←  Settings                                   │ ← fixed header
├────────────────────────────────────────────────┤
│  Minimum watch time                            │
│  [ 10s ][ 30s ][ 1m ][ 2m ]                    │
│  Don't save or resume videos watched for       │
│  less than this.                               │
├────────────────────────────────────────────────┤
│  Treat as finished at                          │
│  [ 90% ][ 95% ][ 98% ]                         │
│  Videos watched past this point won't resume.  │
├────────────────────────────────────────────────┤
│  Rewind on resume                              │
│  [ Off ][ 2s ][ 5s ][ 10s ]                    │
│  Start slightly before where you left off.     │
├────────────────────────────────────────────────┤
│  Show "Resumed from" message           ( ●— )  │
│  Show Restart button                   ( ●— )  │
│  Load thumbnails                       ( ●— )  │
│  Thumbnails are loaded from YouTube.           │
│  Turn this off to keep the extension           │
│  fully offline.                                │
├────────────────────────────────────────────────┤
│  [ Clear saved progress ]                      │
│  [ Reset to defaults ]                         │
├────────────────────────────────────────────────┤
│  Support development ❤️   Buy me a coffee      │
├────────────────────────────────────────────────┤
│  Other tools                                   │
│  Session Switcher                              │
│  Switch between multiple account sessions.     │
└────────────────────────────────────────────────┘
```

#### Control Specification

| Setting | Control | Options | Default | Copy ID |
|---|---|---|---|---|
| `minWatchSeconds` | Segmented | 10s / 30s / 1m / 2m | 30s | CP-42 |
| `completionThreshold` | Segmented | 90% / 95% / 98% | 95% | CP-43 |
| `rewindSeconds` | Segmented | Off / 2s / 5s / 10s | 2s | CP-44 |
| `showToast` | Toggle | On / Off | On | CP-45 |
| `showRestartButton` | Toggle | On / Off | On | CP-46 |
| `loadThumbnails` | Toggle | On / Off | On | CP-47 |

**No free numeric input.** Preset choices only — this eliminates validation, invalid states, and keyboard entry on a narrow surface.

**No Save button.** Changes persist on interaction.

**Helper text** sits below its control in muted 12px. Toggles share one helper only where needed (thumbnails); the two UI toggles are self-explanatory.

#### Destructive Actions

Both use the **inline confirmation pattern** — the button is replaced in place by confirmation copy. Do not build a custom modal. Do not use `window.confirm()`.

```
Before:   [ Clear saved progress ]
After:    Clear all saved resume data?   [ Clear ] [ Cancel ]
Confirmed: button restored; list view now shows the empty state
```

| Action | Deletes | Must NOT touch |
|---|---|---|
| `Clear saved progress` | `youtubeResume` | Settings, schema version |
| `Reset to defaults` | Settings values | Saved videos |

This separation is a hard requirement, not a nicety. It is why settings live under their own storage key.

#### Support Section

The `❤️` emoji is the single intentional exception to the no-emoji rule. Affective, not functional. Used exactly once, only here.

- Visually de-emphasised: muted colour, 12px, no button treatment
- Never above the utility content
- Acceptable link copy: `Buy me a coffee` (recommended) or `Donate`
- Do not use "Support this project", "Help keep this free", or "Tip the developer" — these read as pressure copy

#### Cross-Promotion Section

- Appears **last**, below everything
- One product maximum
- One plain sentence of description, no superlatives
- Text link to the Chrome Web Store listing; no install button or badge
- Header `Other tools` is intentionally generic — it frames this as a directory, not an advert

### 6.5 Popup Visual Style

Standard Chrome extension utility styling. Not YouTube-themed.

| Property | Value |
|---|---|
| Background | `#ffffff` |
| Body text | `#1a1a1a` |
| Muted text | `#666666` |
| Border / divider | `#e5e5e5` |
| Progress bar fill | `#cc0000` |
| Progress bar track | `#e5e5e5` |
| Thumbnail placeholder | `#f0f0f0` |
| Destructive action text | `#c00000` |
| Width | `360px` fixed |
| Max height | `560px` |
| Section padding | `16px` |
| Row padding | `12px 16px` |
| Font family | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |
| Font size (body) | `13px` |
| Font size (labels / meta) | `12px` |
| Font size (video title) | `13px`, `font-weight: 500` |

Dark mode is not required for v2.0, but these choices must not actively break in dark environments.

### 6.6 Removed from v1.0

| Element | Reason |
|---|---|
| Status row — `Status` / `✓ Active on YouTube` (CP-12, CP-13) | A populated video list is self-evident proof the extension works. The empty state covers the zero-data case. The row existed because v1.0 had nothing else to show. |

---

## 7. Copy Reference

The single source of truth for all user-facing text.

### 7.1 Extension Metadata

| Field | Copy |
|---|---|
| Name | `YouTube Resume` |
| Short description | `Automatically resume YouTube videos where you left off.` |

### 7.2 In-Player UI

| ID | Surface | Element | Copy |
|---|---|---|---|
| CP-01 | Restart Button | Label | `↺ Restart` |
| CP-02 | Restart Button | Hover tooltip | `Restart video from the beginning` |
| CP-03 | Resume Toast | Message | `Resumed from {timestamp}` |

### 7.3 Popup — Saved Videos View *(new in v2.0)*

| ID | Element | Copy |
|---|---|---|
| CP-30 | Header title | `YouTube Resume` |
| CP-31 | Settings icon `aria-label` | `Settings` |
| CP-32 | Empty state title | `No saved videos yet` |
| CP-33 | Empty state body | `Videos you watch will appear here once your position is saved.` |
| CP-34 | Row — position | `{position} / {duration}` |
| CP-35 | Row — percentage | `{percent}% watched` |
| CP-36 | Row — remove `aria-label` | `Remove from saved videos` |
| CP-37 | Row — missing title fallback | `Untitled video` |
| CP-38 | Header — count, plural | `{n} saved videos` |
| CP-39 | Header — count, singular | `1 saved video` |

### 7.4 Popup — Settings View *(new in v2.0)*

| ID | Element | Copy |
|---|---|---|
| CP-40 | Header title | `Settings` |
| CP-41 | Back control `aria-label` | `Back to saved videos` |
| CP-42 | Setting label | `Minimum watch time` |
| CP-42h | Setting helper | `Don't save or resume videos watched for less than this.` |
| CP-43 | Setting label | `Treat as finished at` |
| CP-43h | Setting helper | `Videos watched past this point won't resume.` |
| CP-44 | Setting label | `Rewind on resume` |
| CP-44h | Setting helper | `Start slightly before where you left off.` |
| CP-45 | Setting label | `Show "Resumed from" message` |
| CP-46 | Setting label | `Show Restart button` |
| CP-47 | Setting label | `Load thumbnails` |
| CP-47h | Setting helper | `Thumbnails are loaded from YouTube. Turn this off to keep the extension fully offline.` |
| CP-48 | Button | `Clear saved progress` |
| CP-49 | Confirmation prompt | `Clear all saved resume data?` |
| CP-50 | Confirmation body | `This will remove resume positions for all {n} saved videos. This cannot be undone.` |
| CP-51 | Confirm button | `Clear` |
| CP-52 | Cancel button | `Cancel` |
| CP-53 | Button | `Reset to defaults` |
| CP-54 | Confirmation prompt | `Reset all settings to their defaults?` |
| CP-55 | Confirm button | `Reset` |
| CP-56 | Support — section label | `Support development ❤️` |
| CP-57 | Support — link | `Buy me a coffee` |
| CP-58 | Cross-promo — header | `Other tools` |
| CP-59 | Cross-promo — product name | `Session Switcher` |
| CP-60 | Cross-promo — description | `Switch between multiple account sessions.` |

### 7.5 Retired Copy IDs

| ID | Copy | Reason |
|---|---|---|
| CP-10, CP-11 | Popup product name and subtitle | Superseded by CP-30; the subtitle is redundant against the list itself |
| CP-12, CP-13 | `Status` / `✓ Active on YouTube` | Status row removed (§6.6) |
| CP-14, CP-15 | `Saved videos` / `{n}` | Superseded by CP-38 and CP-39 |
| CP-16 to CP-20 | v1.0 clear action copy | Superseded by CP-48 to CP-52 |
| CP-21 to CP-25 | v1.0 support and cross-promo copy | Superseded by CP-56 to CP-60 |

> Retired IDs must not be reused. Any string still matching a retired ID in shipped code is a defect.

---

## 8. Accessibility Requirements

### 8.1 Restart Button

| Requirement | Implementation |
|---|---|
| Screen reader label | `aria-label="Restart video from the beginning"` |
| Keyboard focusable | Native `<button>`; inherently focusable |
| Focus visible | Do not suppress `:focus-visible` |
| Contrast | Must meet WCAG AA against the player background at the measured colour |

### 8.2 Resume Toast

| Requirement | Implementation |
|---|---|
| Screen reader announcement | `role="status"` and `aria-live="polite"` |
| Non-interactive | `pointer-events: none`; no focusable children |
| Not relied on alone | The Restart button independently signals the resume |

### 8.3 Popup *(expanded in v2.0)*

| Requirement | Implementation |
|---|---|
| Row navigation | Every row reachable by Tab; Enter opens the video |
| Remove control | Keyboard-focusable even though revealed on hover; never hover-only |
| Thumbnails | `alt=""` — decorative; the adjacent title carries the meaning |
| Settings controls | Segmented groups use `role="radiogroup"` with `aria-checked`; toggles use `role="switch"` |
| Setting helper text | Associated with its control via `aria-describedby` |
| View change | Moving between list and settings sets focus to the new view's header |
| Confirmation copy | Inline pattern, announced via `aria-live="polite"` |
| Colour not sole signal | Progress conveyed by both bar and text percentage |
| Focus visible | Never suppressed anywhere in the popup |

---

## 9. Constraints & Anti-Patterns

### 9.1 Hard Constraints

| Constraint | Rationale |
|---|---|
| No UI during normal, uninterrupted playback | The extension's core promise |
| No persistent DOM modifications to YouTube | All injected elements have defined lifetimes and cleanup paths |
| **No settings, controls, or configuration surfaces inside the YouTube page** | *(rescoped in v2.0)* Settings exist, but only in the popup. The player stays clean |
| No notifications or browser alerts | Never interrupt outside the tab context |
| No onboarding flow | The empty state and the store description are the full onboarding |
| No `innerHTML`, no `eval`, no inline `<script>` | Security; Chrome Web Store review |
| No network requests from the content script, ever | Thumbnails are a popup-only exception |
| Popup makes no request when thumbnails are disabled | The offline promise must be literally true |

> The v1.0 constraint "No settings page in v1.0 — there is nothing for the user to configure" is superseded. There is now something to configure, and the reason it exists is that the hard-coded 30-second threshold did not suit every user.

### 9.2 Copy Anti-Patterns

| Anti-Pattern | Correct Alternative | Reason |
|---|---|---|
| `"Restart From Beginning"` | `↺ Restart` | Redundant |
| `"Start Over"` | `↺ Restart` | Vague |
| `"Your progress has been saved!"` | *(no copy — silent save)* | Announcing every save is noise |
| `"We couldn't find your saved position"` | *(no copy — silent skip)* | Tracking failures are silent |
| `"🎉 Resumed from 17:23!"` | `Resumed from 17:23` | Emoji and punctuation inflate a functional message |
| `"Clear Data"` | `Clear saved progress` | "Data" is technical |
| `"Rollback seconds"` | `Rewind on resume` | Code vocabulary leaking into the UI |
| `"Completion threshold"` | `Treat as finished at` | Same |
| `"Min. watch duration (s)"` | `Minimum watch time` | Abbreviations and units belong in the control, not the label |

### 9.3 Visual Anti-Patterns

| Anti-Pattern | Correct Approach |
|---|---|
| **Styling in-player UI from this document instead of from measurement** | Read computed values from live YouTube; record them in `YT_DOM_AUDIT.md` |
| ~~Restart button with background fill or border~~ | **Reversed in v2.0 (D-027).** No native inline text button exists to copy, so the pill fill is derived from the measured `.ytp-menuitem` hover intensity (`docs/YT_DOM_AUDIT.md`) rather than the old borderless rule |
| Toast overlapping the progress bar | Derive the vertical offset from the measured control-bar height; verify in all player modes |
| Toast with a square or near-square corner radius | Match YouTube's current overlay chip radius |
| Toast that requires dismissal | `pointer-events: none`; auto-fade; never blocking |
| Broken-image icon on a failed thumbnail | Neutral placeholder |
| Loading spinner in the popup | Render immediately; let thumbnails fill in |
| Animated view transitions in the popup | Instant replacement |
| Primary-styled destructive buttons | Ghost or secondary treatment |
| Free numeric input in settings | Preset segmented choices |
| Extension badge count on the toolbar icon | No badge; the extension is silent when idle |

---

*This document is the authoritative UI/UX specification for YouTube Resume v2.0.0. All copy, layout, and interaction decisions trace back to requirements defined here. Deviations require product sign-off and must be reflected in this document and the companion PRD.*
