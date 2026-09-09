# UI/UX Specification
## YouTube Resume — Chrome Extension

---

| Field | Detail |
|---|---|
| **Product** | YouTube Resume |
| **Document Type** | UI/UX Specification |
| **Version** | 4.0.0 |
| **Previous Version** | 3.0.0 |
| **Status** | Approved — Ready for Implementation |
| **Last Updated** | 2026-09-08 |
| **Companion Documents** | PRD_YouTube_Resume.md v4.0.0, ROADMAP_v4.md, TDD_YouTube_Resume.md (still v3.0.0 — stale, see CLAUDE.md doc-routing table) |

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

## Changelog — v2.0.0 → v3.0.0

| # | Change | Section |
|---|---|---|
| C8 | Pin control added to each row in the saved videos view; pinned rows sort first | §6.3 |
| C9 | Pin-limit-reached refusal state specified (20-pin cap) | §6.3 |
| C10 | Lazy title backfill documented for the saved videos view (reuses existing CP-37 fallback, no new copy) | §6.3 |
| C11 | "Clear saved progress" confirmation specified to disclose that pinned videos are deleted too | §6.4 |
| C12 | Copy IDs CP-62 through CP-67 added for pinning | §7.3 |

## Changelog — v3.0.0 → v4.0.0

| # | Change | Section |
|---|---|---|
| C13 | Resume toast honesty: toast fires only after a **verified** resume; pending/deferred/failed outcomes are explicitly specified as silent, not an error state | §5.3, §5.6 |
| C14 | "Remove completed" action added to the saved videos view: discoverable placement, live matching count, preview-before-confirm, pinned-entries-preserved-by-default with an include-pinned opt-in, existing inline confirmation pattern | §6.3 |
| C15 | Zero-match state for "Remove completed" and a distinct load-failure state for the saved videos list (no longer conflated with "No saved videos yet") specified | §6.3 |
| C16 | Displayed percentage capped below 100% unless the completion marker is present; distinct completed-row label specified | §6.3 |
| C17 | Popup rows specified to reconcile against storage changes while open, without losing keyboard focus; per-row actions disable while a mutation is pending; counts derive from acknowledged state only | §6.3 |
| C18 | "Treat as finished at" gains a fourth segment, "Only at the end"; CP-43h helper copy updated for accuracy | §6.4 |
| C19 | Turning thumbnails off specified to apply immediately to already-rendered rows within the same popup session, with an explicit boundary for requests already in flight | §6.4 |
| C20 | Accessibility: focus handoff on row removal/pin re-sort/confirmation open-cancel, programmatic setting-group-label association, list-count-change announcement, `prefers-reduced-motion` support | §8 |
| C21 | Copy IDs CP-68 through CP-79 added | §7.3, §7.4 |
| C22 | Row pin/remove `aria-label`s and the list announcer now identify the specific video by title rather than a generic name (F17); copy IDs CP-80 through CP-84 added, retiring CP-36/CP-62/CP-63 | §7.3 |

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

"Verified" is the whole trigger — not "attempted," not "the seek call returned without throwing." A seek that lands off-target, is later overridden by YouTube's own native restore, or never settles is **not** a resume the toast reports on. See §5.6.

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
- **Reduced motion** *(v4.0, F18)*: when `prefers-reduced-motion: reduce` is set, skip the fade transitions and show/remove the toast at full opacity for the same ~2200ms total window — the timing budget doesn't change, only the animated opacity ramp

### 5.6 Non-Success States *(new in v4.0)*

The toast has exactly one visible state: a verified resume happened. Every other outcome is silent
on this surface, matching the standing principle "failures are silent to the user, logged to console"
(CLAUDE.md) and the audit's own instruction not to invent an intrusive failure state (F01/F05).

| Outcome | What the user sees | What happens instead |
|---|---|---|
| **Pending** — a resume attempt is still in progress (waiting on ad clearance, player/metadata readiness, or seek-verification retry) | Nothing. No toast, no placeholder, no spinner | The attempt continues in the background up to its bounded deadline; console-only diagnostics if `DEBUG` is enabled locally |
| **Deferred** — the attempt can't proceed yet but isn't abandoned (tab restored inactive, page frozen/discarded, ads still clearing) | Nothing, for as long as the deferral lasts | If the deferred attempt later succeeds and is verified, the toast (and Restart button) appear **at that later time** — a delayed success is still a success, shown once, not retroactively for the missed window |
| **Failed** — verification never confirms a landed, stable position within the attempt's bounded window, or the attempt is abandoned (ceiling reached, cancelled by newer navigation, native override wins) | Nothing. No toast, no in-player banner, no icon change | Playback continues untouched from wherever it naturally is; the failure is logged to console only, never surfaced as UI |

**Do not build:** an error toast, a "couldn't resume" message, a retry prompt, or any in-player
indicator that a resume was attempted and didn't work. §1.1's "no UI during normal, uninterrupted
playback" principle extends here — a user who never notices a failed resume is not owed a UI element
explaining that nothing happened. The saved checkpoint itself is preserved on failure (not overwritten
by the pre-resume startup position) so the next attempt — a later readiness event, or the user simply
reopening the video — has an accurate position to try again; that preservation, not a UI signal, is
the product's actual answer to "the resume failed."

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
┌──────────────────────────────────────────────────┐
│  YouTube Resume        ☕        34 saved videos ⚙│ ← fixed header
├──────────────────────────────────────────────────┤
│ ┌────────────┐                                   │
│ │📌          │20:00  Building a UE5 game from 📌✕│ ← pinned row
│ │   thumb    │       scratch — part 3             │
│ │  144×81    │       Some Game Dev Channel         │
│ │ ▓▓▓▓░░░░░░ │       4:05 / 20:00 · 20% watched   │
│ └────────────┘                                   │
├──────────────────────────────────────────────────┤
│ ┌────────────┐                                   │
│ │            │58:22  Advanced TypeScript       📌✕│ ← unpinned row
│ │   thumb    │       patterns                     │
│ │ ▓▓▓▓▓▓▓▓▓░ │       Some Coding Channel           │
│ └────────────┘       42:10 / 58:22 · 72% watched  │
├──────────────────────────────────────────────────┤
│                     ⋮ scrolls                    │
└──────────────────────────────────────────────────┘
```

> The `📌` glyphs above stand in for the pin affordance in this ASCII mock only. Per §9.2/D-058
> precedent (the Ko-fi icon), the shipped pin control and pinned-state badge are drawn as inline SVG,
> never the pin emoji — no functional copy uses emoji.

**Header, revised (post-Phase-8 polish):** an icon-only Ko-fi link (`☕`, drawn as an inline SVG — not the reserved ❤️ emoji) sits centered between the title and the count/gear, via a 3-column header grid. `aria-label` CP-61.

#### Row Specification

| Element | Spec |
|---|---|
| Thumbnail | 144×81 (16:9), `https://i.ytimg.com/vi/{videoId}/mqdefault.jpg`, `loading="lazy"` |
| Duration badge | Bottom-right of the thumbnail, `{duration}`, dark pill — plain text/CSS overlay, not baked into the image (D-054) |
| Watched-progress line | Bottom edge of the thumbnail, fill proportional to `time / duration` — the at-a-glance YouTube-style indicator; the precise numbers stay in the meta line below, not duplicated |
| **Pinned badge** *(v3.0)* | Top-left corner of the thumbnail, small filled pin glyph (inline SVG, not emoji) — rendered **only** when the entry is pinned. Passive indicator, not interactive; `aria-hidden="true"` on the glyph itself since the row's pin control (below) already carries an accessible name for the state |
| Title | Two lines maximum, ellipsis overflow. Falls back to CP-37 |
| Channel name | One line, ellipsis overflow, muted. Omitted entirely (no placeholder) when not yet captured |
| Meta line | CP-34 and CP-35 — `{position} / {duration} · {percent}% watched`. **Percentage is capped at 99%** unless the completion marker is present (see "Completion Display" below) — a row never reads "100% watched" from playhead position alone |
| **Pin control** *(v3.0; labels updated v4.0, F17)* | Inline SVG icon button, positioned in the row's action area immediately to the left of the remove control (`📌 ✕` reading order). Revealed on row hover, like the remove control — but see the note below on the persistent pinned badge, which is what signals pinned state without hovering. Always keyboard-focusable. Outline glyph when unpinned; filled glyph when pinned. `aria-pressed="true"`/`"false"` reflects state; `aria-label` switches between CP-80 (unpinned → "Pin {title}") and CP-81 (pinned → "Unpin {title}") |
| Remove control | `✕`, revealed on row hover, always keyboard-focusable. `aria-label` is CP-82 (v4.0, F17 — "Remove {title} from saved videos") |
| Whole-row target | `<a href="https://www.youtube.com/watch?v={id}" target="_blank" rel="noopener noreferrer">` |

**Pinned state is visible without hovering** via the thumbnail's persistent pinned badge above; the
*interactive* pin/unpin control is still hover-revealed like the remove control, consistent with this
row's existing disclosure pattern. The two are deliberately separate: one shows state, the other
changes it.

**Sort order** *(revised in v3.0)*: pinned entries first, most recently watched first within that
group; then unpinned entries, most recently watched first within that group. Neither ordering is
user-configurable — pin/unpin is the only lever, and `updated` is the only within-group sort.

**Title not yet backfilled** *(v3.0 clarification, no new copy)*: if a title could not be captured
when an entry was first saved, the row shows the existing CP-37 fallback (`Untitled video`) — this
is unchanged from v2.0. What's new in v3.0 is that a title is no longer permanently stuck: the next
time the user watches that same video, the title is captured normally and the row updates to show it
the next time the panel is opened. There is no live update while the panel is already open and no
retroactive fetch for videos not currently being watched — this mirrors the existing channel-name
behaviour exactly (§7.3's CP-37 row; PRD §5.9).

#### Pin Limit Reached

Attempting to pin a 21st video is a **refusal, not a silent no-op, and never an auto-unpin.**

- No `alert()`, no `confirm()`, no modal of any kind — consistent with §9.1's "no browser alerts" constraint
- A brief inline message (CP-65) appears in the row's action area, replacing the pin control briefly,
  then the control returns — the same "temporarily replace, then restore" family of pattern as the
  destructive-action inline confirmations in §6.4, but auto-dismissing rather than awaiting a choice
  (there is nothing to confirm; the action was simply refused)
- Auto-dismiss after **~2.5 seconds**, matching the resume toast's brevity (§5) — long enough to read, short enough not to block the row
- The attempted video remains unpinned; the 20 existing pins are untouched

**Thumbnail failure:** on load error, show a neutral placeholder. Never a broken-image icon, never a console error. Deleted and private videos are an expected case, not a bug. The duration badge and progress line still render on the placeholder — they're independent of the image itself.

**Thumbnails disabled:** render the placeholder and issue **no** network request. `loading="lazy"` is not sufficient — the `src` must not be set at all. The duration badge and progress line still render — they're text/CSS, not a request, so D-005's zero-network guarantee is unaffected.

**Thumbnails re-enabled or disabled mid-session** *(v4.0, F17)*: applying `loadThumbnails` is not
deferred to the next popup open. The instant the toggle changes in Settings, every already-rendered
row in the (still-in-memory) saved videos list is updated to match: turning thumbnails off clears
every rendered `<img>`'s `src` immediately (rows not yet scrolled into view never get one queued in
the first place); turning them on sets `src` on every row currently showing the placeholder. The
honest boundary, stated plainly rather than implied: **a request already sent before the toggle
changed cannot be recalled** — an image mid-flight when the user switches thumbnails off may still
finish loading and paint once. This is a network timing fact, not a bug, and nothing in the popup
should claim otherwise (CP-47h is unchanged; it already only promises the *off* state stops new
requests, not that in-flight ones vanish).

#### Completion Display *(new in v4.0)*

A row shows the completed-row label (CP-77) in place of the percentage — replacing the entire meta
line, not just the percent segment — whenever the completion marker is present: a genuine `ended`
event was recorded, or, for a legacy entry saved before that marker existed, the conservative
inference rule holds (position is within the smallest unit the stored integer-second data can
represent of the duration). Every other row shows the existing `{position} / {duration} · {percent}%
watched` meta line with percent capped at 99, per the Row Specification table above. Reaching 99% by
playhead position alone — including a seek to the very end — is still just 99% watched here; only the
completion marker earns the completed label. This is a display rule only: it does not change resume
eligibility, which is governed entirely by the `completionThreshold` setting (§6.4).

#### Remove Completed *(new in v4.0)*

**Placement:** a text button in the list header, next to the count (`{n} saved videos` area),
discoverable without opening Settings — this is a saved-videos-view action, not a settings action,
since it operates on what's currently listed. Disabled (not hidden) when the live matching count is
zero, so the control's existence is always discoverable even in a library with nothing to remove.

```
┌──────────────────────────────────────────────────┐
│  YouTube Resume    ☕   34 saved videos ⚙        │
│  [ Remove completed (6) ]  [ ] Include pinned     │ ← new row, header area
├──────────────────────────────────────────────────┤
```

**Label and live count:** the button reads CP-68 (`Remove completed`) with the current matching count
shown alongside it, using the plural/singular pair CP-69/CP-70 exactly like the header's own
CP-38/CP-39 convention. The count is **live** — it re-derives from the same completion predicate used
for the completed-row label above, recomputed whenever the underlying list changes (a new save
completes a video, a row is removed, a pin toggles the include-pinned scope), never a stale snapshot
taken when the popup opened.

**Pinned scope:** pinned entries are **excluded by default** from both the count and the removal,
regardless of completion state — pinning already means "keep this," and a user who pinned a finished
video most likely wants it kept as a reference, not swept up because it also happens to be complete.
An **include-pinned** checkbox/toggle sits beside the button (CP-73, `Include pinned videos`) — when
checked, completed pinned entries join the count and the removal set for that one action only; the
checkbox itself does not persist as a setting and resets to unchecked the next time the popup opens.

**Preview before confirm:** the count the user sees on the button *is* the preview — there is no
separate "are you sure, N will be removed" step distinct from what's already visible before the click.
Clicking the button (only enabled when the count is ≥1) goes straight to the existing inline
confirmation pattern (the CP-48/49 pattern, §6.4): the button and checkbox are replaced in place by
confirmation copy naming the same count, then the user commits or cancels.

```
Before:    [ Remove completed (6) ]  [ ] Include pinned
After:     Remove completed videos?
           This will permanently remove 6 completed videos. This cannot be undone.  [ Remove ] [ Cancel ]
Confirmed: header row restored, count re-derives, list reflects the removal
```

- CP-71 (prompt) — `Remove completed videos?`
- CP-72 (body) — `This will permanently remove {countLabel}. This cannot be undone.` where
  `{countLabel}` is CP-69 or CP-70 verbatim (`6 completed videos` / `1 completed video`) — reusing the
  same count strings the button already showed, so the number in the confirmation always matches what
  the user just previewed
- CP-79 (confirm button) — `Remove` — distinct from CP-51 (`Clear`), since this action removes a
  filtered subset, not everything
- Cancel button reuses the existing generic CP-52 (`Cancel`) — same button, same behavior, no new copy

**No modal, no `window.confirm()`, no undo window** — consistent with every other destructive action
in this popup (§6.4). One coordinated batch mutation; unrelated entries, settings, and schema are
untouched.

**Zero-match state:** when the live count is 0 — nothing matches the completion predicate in the
current pinned scope — the button is disabled (not removed) and CP-74 (`No completed videos to
remove`) appears in its place inline, so the reason for the disabled state is stated, not left to
guesswork. Checking "Include pinned" while at zero re-evaluates immediately; if that makes the count
≥1, the button re-enables and CP-74 is replaced by the live count.

#### List Reconciliation *(new in v4.0, F16)*

The list is not a one-time snapshot for the life of the popup. While the popup stays open:

- Rows reconcile against storage changes as they happen (playback elsewhere updating progress, an
  eviction, another tab pinning/removing the same entry) — the visible list, header count, and
  Remove-completed count all stay accurate to current storage, not to what was true when the popup
  opened.
- Reconciling **never steals keyboard focus.** If the user is mid-interaction with a row (focused on
  its pin/remove control, or inside an open inline confirmation), a storage-driven update to a
  *different* row must not move focus. An update to the *focused* row's own data (e.g. its progress
  ticking up) updates the row in place without disturbing which element has focus.
- **Per-row actions disable while their own mutation is pending** — a pin/unpin or remove click
  disables that row's controls immediately until the storage write is acknowledged, preventing a
  second queued click on the same row from double-counting. This does not block interaction with
  *other* rows.
- **Counts derive from acknowledged state only**, never an optimistic increment/decrement made before
  the storage write resolves. The header count, the Remove-completed count, and the pinned count all
  update only once storage confirms the change — a rapid double-click produces one state change, not
  two miscounted ones.

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

#### Load-Failure State *(new in v4.0, F12)*

CP-32 (`No saved videos yet`) must **never** be shown when reading storage failed — it asserts "your
library is empty," which is a specific, false claim to make when the truth is "the popup couldn't
read your library." This state renders in the same layout position as the empty state but with
distinct copy, so the two are never visually or semantically interchangeable:

```
┌────────────────────────────────────────────────┐
│  YouTube Resume                             ⚙ │
├────────────────────────────────────────────────┤
│                                                │
│         Couldn't load saved videos             │
│                                                │
│    Something went wrong reading your saved     │
│    videos. Try reopening the popup.            │
│                                                │
└────────────────────────────────────────────────┘
```

- CP-75 (title) — `Couldn't load saved videos`
- CP-76 (body) — `Something went wrong reading your saved videos. Try reopening the popup.`

Triggered when the progress read itself fails or returns malformed data the popup cannot safely
render — not when settings alone fail to load. A settings-read failure must not hide valid saved-video
data: the list renders normally against safe setting defaults, per the existing graceful-degradation
principle (CLAUDE.md), and only the progress read failing produces this state. No retry button and no
auto-retry loop — "reopening the popup" is the existing, sufficient recovery path, consistent with
this popup's no-loading-states, no-spinner constraint (§6.2).

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
│  [ 90% ][ 95% ][ 98% ][ Only at the end ]      │
│  Videos watched past this point won't resume.  │
│  "Only at the end" waits until the video       │
│  actually finishes.                            │
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
| `completionThreshold` | Segmented | 90% / 95% / 98% / Only at the end *(v4.0)* | 95% | CP-43, CP-78 |
| `rewindSeconds` | Segmented | Off / 2s / 5s / 10s | 2s | CP-44 |
| `showToast` | Toggle | On / Off | On | CP-45 |
| `showRestartButton` | Toggle | On / Off | On | CP-46 |
| `loadThumbnails` | Toggle | On / Off | On | CP-47 |

**"Only at the end"** *(new in v4.0)* is a fourth point on the same segmented control, not a separate
setting — selecting it means the video must actually finish (the completion marker from §6.3's
"Completion Display") before resume/near-completion suppression applies, rather than crossing any
percentage-of-duration line. A user who stops at 99% of a long video and never finishes it will still
resume normally under this option, unlike 90/95/98%.

**No free numeric input.** Preset choices only — this eliminates validation, invalid states, and keyboard entry on a narrow surface.

**No Save button.** Changes persist on interaction.

**Helper text** sits below its control in muted 12px. Toggles share one helper only where needed (thumbnails); the two UI toggles are self-explanatory.

**`loadThumbnails` takes effect immediately, not on next popup open** *(v4.0, F17)* — see §6.3's
"Thumbnails re-enabled or disabled mid-session" for the exact behavior and its stated boundary
(requests already sent cannot be recalled). CP-47h's wording is unaffected by this — it already
describes the setting's purpose, not its propagation timing.

#### Destructive Actions

Both use the **inline confirmation pattern** — the button is replaced in place by confirmation copy. Do not build a custom modal. Do not use `window.confirm()`.

```
Before:   [ Clear saved progress ]
After:    Clear all saved resume data?
          This includes 3 pinned videos.        [ Clear ] [ Cancel ]
Confirmed: button restored; list view now shows the empty state
```

| Action | Deletes | Must NOT touch |
|---|---|---|
| `Clear saved progress` | `youtubeResume`, **including pinned entries** *(v3.0)* | Settings, schema version |
| `Reset to defaults` | Settings values | Saved videos, pinned or not |

This separation is a hard requirement, not a nicety. It is why settings live under their own storage key.

**Pinned videos are not exempt from this action** *(v3.0)*. Pinning protects an entry from the
automatic 200-entry eviction cap; it is not an exemption from an explicit, user-initiated "delete
everything." The existing confirmation copy (CP-49/CP-50) already says "all {n} saved videos," which
is technically accurate — pinned entries are saved videos — but a user could reasonably assume
pinning means "protected, full stop." The confirmation must say so plainly (Copy Rule 4, §2.3):
when at least one video is pinned, CP-50 is followed by a second line, CP-66 (plural) or CP-67
(singular), naming the pinned count explicitly. CP-49 and CP-50 themselves are unchanged — this is
an addition, not a rewrite.

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
| Thumbnail duration badge | `rgba(0,0,0,0.8)` background, `#ffffff` text |
| Thumbnail progress line track | `rgba(0,0,0,0.4)` |
| Thumbnail progress line fill | `#cc0000` (same as progress bar fill) |
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

**Pinning, added in v3.0:**

| ID | Element | Copy |
|---|---|---|
| CP-62 | Row — pin control `aria-label`, unpinned state | `Pin this video` |
| CP-63 | Row — pin control `aria-label`, pinned state | `Unpin this video` |
| CP-65 | Pin-limit-reached inline message | `You can pin up to 20 videos` |

> **CP-64 intentionally skipped.** Reserved during drafting for the pinned-state thumbnail badge's
> `aria-label`, but the shipped badge is a passive `aria-hidden="true"` glyph (Row Specification
> table, §6.3) — the row's pin control already announces pinned/unpinned state via its own
> `aria-pressed`/`aria-label` (CP-80/CP-81, v4.0), so a second announcement on the badge would be
> redundant. Not retired (§7.5) since it was never assigned copy; do not reuse.

**Remove completed and related states, added in v4.0:**

| ID | Element | Copy |
|---|---|---|
| CP-68 | Remove-completed button label | `Remove completed` |
| CP-69 | Remove-completed live count, plural | `{n} completed videos` |
| CP-70 | Remove-completed live count, singular | `1 completed video` |
| CP-71 | Remove-completed confirmation prompt | `Remove completed videos?` |
| CP-72 | Remove-completed confirmation body | `This will permanently remove {countLabel}. This cannot be undone.` (`{countLabel}` is CP-69 or CP-70 verbatim) |
| CP-73 | Remove-completed — include-pinned option label | `Include pinned videos` |
| CP-74 | Remove-completed — zero-match message | `No completed videos to remove` |
| CP-75 | Load-failure state title | `Couldn't load saved videos` |
| CP-76 | Load-failure state body | `Something went wrong reading your saved videos. Try reopening the popup.` |
| CP-77 | Row — completed-row label, replaces the percentage meta line | `Completed` |
| CP-79 | Remove-completed confirm button | `Remove` |

**Row action labels and list announcements, added in v4.0 (F17):**

| ID | Element | Copy |
|---|---|---|
| CP-80 | Row — pin control `aria-label`, unpinned state — supersedes CP-62 | `Pin {title}` |
| CP-81 | Row — pin control `aria-label`, pinned state — supersedes CP-63 | `Unpin {title}` |
| CP-82 | Row — remove control `aria-label` — supersedes CP-36 | `Remove {title} from saved videos` |
| CP-83 | List announcer — one row removed | `{title} removed. {count}.` (`{count}` is CP-38/CP-39's rendered text, e.g. "2 saved videos") |
| CP-84 | List announcer — multiple rows removed (batch action) | `{n} videos removed. {count}.` |

> A row action now identifies the specific video by title (falling back to CP-37, `Untitled video`,
> the same as the row's own visible text) instead of a generic "this video"/no-name label — F17
> required this; CP-36/CP-62/CP-63's static wording could not express it, so these are new IDs, not
> reworded existing ones. The list announcer (`role="status"`/`aria-live="polite"`, distinct from the
> per-row pin-cap/confirmation regions) also announces a plain count change with no removal — CP-38/
> CP-39's own rendered text plus a trailing period, not a separate ID.

### 7.4 Popup — Settings View *(new in v2.0)*

| ID | Element | Copy |
|---|---|---|
| CP-40 | Header title | `Settings` |
| CP-41 | Back control `aria-label` | `Back to saved videos` |
| CP-42 | Setting label | `Minimum watch time` |
| CP-42h | Setting helper | `Don't save or resume videos watched for less than this.` |
| CP-43 | Setting label | `Treat as finished at` |
| CP-43h | Setting helper *(updated in v4.0 — see below)* | `Videos watched past this point won't resume. "Only at the end" waits until the video actually finishes.` |
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
| CP-61 | Header — Ko-fi icon `aria-label` | `Support on Ko-fi` |

**Pinning, added in v3.0:**

| ID | Element | Copy |
|---|---|---|
| CP-66 | Confirmation body — pinned note, plural, appended after CP-50 when applicable | `This includes {p} pinned videos.` |
| CP-67 | Confirmation body — pinned note, singular, appended after CP-50 when applicable | `This includes 1 pinned video.` |

**Completion policy, added in v4.0:**

| ID | Element | Copy |
|---|---|---|
| CP-78 | `completionThreshold` segment label, fourth option | `Only at the end` |

> **CP-43h note:** the existing helper (§7.4 above) is updated in place, per this update's explicit
> instruction, to stay accurate now that the setting has a fourth, non-percentage option. Its ID is
> unchanged and every other existing CP ID in this document is untouched.

### 7.5 Retired Copy IDs

| ID | Copy | Reason |
|---|---|---|
| CP-10, CP-11 | Popup product name and subtitle | Superseded by CP-30; the subtitle is redundant against the list itself |
| CP-12, CP-13 | `Status` / `✓ Active on YouTube` | Status row removed (§6.6) |
| CP-14, CP-15 | `Saved videos` / `{n}` | Superseded by CP-38 and CP-39 |
| CP-16 to CP-20 | v1.0 clear action copy | Superseded by CP-48 to CP-52 |
| CP-21 to CP-25 | v1.0 support and cross-promo copy | Superseded by CP-56 to CP-60 |
| CP-36 | `Remove from saved videos` | Superseded by CP-82 — row actions now identify the specific video (F17) |
| CP-62, CP-63 | `Pin this video` / `Unpin this video` | Superseded by CP-80/CP-81 — same reason |

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
| Remove control | Keyboard-focusable even though revealed on hover; never hover-only. `aria-label` identifies the specific video (CP-82, v4.0, F17), not a generic name |
| Pin control *(v3.0)* | Keyboard-focusable even though revealed on hover; never hover-only. `aria-pressed` reflects state; `aria-label` announces the action that will result and identifies the specific video (CP-80/CP-81, v4.0, F17), not a generic name |
| Pinned badge *(v3.0)* | `aria-hidden="true"` — decorative once the pin control's own accessible name already conveys state; not a duplicate announcement |
| Pin limit message *(v3.0)* | Visually inserted inline (CP-65) where the pin control sat, auto-removed after ~2.5s. Announced via `role="status"`/`aria-live="polite"` — see D-097 |
| Thumbnails | `alt=""` — decorative; the adjacent title carries the meaning |
| Settings controls | Segmented groups are `role="group"` (each segment a toggle `<button>` with `aria-pressed`, not a radio); toggles use `role="switch"` |
| Setting helper text | Associated with its segmented group via `aria-describedby` |
| View change | Moving between list and settings sets focus to the new view's header |
| Confirmation copy | Inline pattern, announced via `aria-live="polite"` |
| Colour not sole signal | Progress conveyed by both bar and text percentage |
| Focus visible | Never suppressed anywhere in the popup |
| Focus on row removal *(v4.0, F18)* | Moves to the next row's equivalent control (or, if the removed row was last, the previous row's); if the list becomes empty, focus moves to the header's Remove-completed button or, failing that, the settings gear |
| Focus during pin re-sort *(v4.0, F18)* | The pin control retains focus across its DOM move when the row re-sorts to the pinned/unpinned boundary — detach-and-reinsert must not drop focus to `<body>` |
| Focus on confirmation open/cancel *(v4.0, F18)* | Opening any inline confirmation (Remove completed, Clear saved progress, Reset to defaults) moves focus to its Cancel control; cancelling restores focus to the control that opened it (the button now back in its normal state) |
| Setting-group label association *(v4.0, F18)* | Each segmented group's visible label is programmatically associated via `aria-labelledby` on its `role="group"` container — not a visual-only span |
| List count changes *(v4.0, F18)* | The header count (CP-38/CP-39) and the Remove-completed live count (CP-69/CP-70) live inside a `role="status"`/`aria-live="polite"` region so a count change is announced without moving focus |
| Reduced motion *(v4.0, F18)* | Every decorative transition in the popup (inline-confirmation swap, pin-limit-message auto-dismiss fade) respects `prefers-reduced-motion: reduce` by showing/hiding instantly instead of animating. The in-player toast's own fade is covered separately in §5.5 |

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

*This document is the authoritative UI/UX specification for YouTube Resume v3.0.0. All copy, layout, and interaction decisions trace back to requirements defined here. Deviations require product sign-off and must be reflected in this document and the companion PRD.*
