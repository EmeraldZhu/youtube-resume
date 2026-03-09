# UI/UX Specification
## YouTube Resume — Chrome Extension

---

| Field | Detail |
|---|---|
| **Product** | YouTube Resume |
| **Document Type** | UI/UX Specification |
| **Version** | 1.0.0 |
| **Status** | Draft — Ready for Implementation |
| **Last Updated** | 2026-03-09 |
| **Companion Documents** | PRD_YouTube_Resume.md v1.0.0, TDD_YouTube_Resume.md v1.0.0 |

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

YouTube Resume has exactly one job. The UI must reflect that with the same discipline.

### 1.1 Core Principles

| Principle | Meaning in Practice |
|---|---|
| **Invisible** | The extension produces zero UI during normal, uninterrupted use. No badges, no banners, no tooltips unless they are earned by a meaningful event. |
| **Native** | Every pixel injected into YouTube's player must look like YouTube designed it. Font, weight, color, opacity, and spacing must match the surrounding controls. A user should not be able to distinguish the extension's UI from YouTube's own. |
| **Reliable** | UI only appears when it is certain something happened. The Restart button does not appear unless a resume seek was successfully applied. The toast does not appear unless a resume timestamp is known. No speculative UI. |

### 1.2 The Trust Test

Before any UI element is added, ask: *does this element increase the user's trust in the product, or does it increase the product's visibility at the user's expense?*

If the answer is the latter, remove it.

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
| **Direct** | Say exactly what happens. No embellishment. | "Resumed from 17:23" not "Picking up right where you left off! 🎉" |
| **Minimal** | Use the fewest words that are still clear. | "Restart" not "Restart Video From Beginning" |
| **Technical-neutral** | Functional language accessible to any user | "Clear saved progress" not "Flush storage cache" |
| **No marketing voice** | Copy inside the product is not an ad | No exclamation marks, no superlatives, no emoji in functional copy |

### 2.3 Copy Rules

1. **Sentence case everywhere.** "Clear saved progress" — not "Clear Saved Progress".
2. **No trailing punctuation on labels or button text.** "Restart" — not "Restart."
3. **Active voice for actions.** "Clear saved progress" — not "Saved progress will be cleared".
4. **Confirmation dialogs state the action plainly.** "Clear all saved resume data?" — not "Are you sure you want to do this?"
5. **No first-person from the extension.** Never "I saved your progress" or "We couldn't resume your video".

---

## 3. UI Surface Inventory

YouTube Resume exposes exactly three UI surfaces in v1.0. Each is conditional — none appear unless triggered by a specific event.

| Surface | Trigger | Location | Duration |
|---|---|---|---|
| **Restart Button** | A resume seek was successfully applied | YouTube player controls bar | 5–10 seconds, then auto-removed |
| **Resume Toast** | A resume seek was successfully applied | Above the YouTube player progress bar | ~2 seconds, fade out |
| **Extension Popup** | User clicks the extension icon in Chrome toolbar | Chrome toolbar popup | Persistent while open |

> **Note on the Resume Toast:** This surface is **recommended but optional** for v1.0. See [Section 5](#5-surface-2--resume-toast) for full specification. The Restart Button is required.

---

## 4. Surface 1 — In-Player Restart Button

### 4.1 Purpose

Provides a single, time-limited escape hatch after a resume occurs. Allows the user to restart from the beginning if the resume was unwanted (e.g., rewatching a music video, sharing a link).

### 4.2 Trigger Condition

The button is injected **only** when `resumeManager` successfully sets `video.currentTime`. It must not appear on any other condition.

### 4.3 Visual Specification

#### Copy

| State | Copy |
|---|---|
| Default label | `↺ Restart` |
| Hover tooltip | `Restart video from the beginning` |

#### Placement

```
[ ▶ ]  0:08 / 35:13  [ ↺ Restart ]               [ ⚙ ] [ ⛶ ]
         ↑                   ↑
   .ytp-time-display    Injected here,
                        as next sibling
```

The button is injected as the **next sibling** of `.ytp-time-display` inside `.ytp-left-controls`.

#### Styling

The button must be indistinguishable from YouTube's native text controls. All values below are calibrated to match YouTube's player control bar as of 2025.

| Property | Value | Rationale |
|---|---|---|
| `font-family` | `Roboto, Arial, sans-serif` | Matches YouTube control bar font stack |
| `font-size` | `12px` | Matches `.ytp-time-display` font size |
| `font-weight` | `500` | Matches YouTube time display weight |
| `color` | `#ffffff` | Matches all player control text |
| `background` | `none` | Transparent — blends with dark player bar |
| `border` | `none` | No border — consistent with YouTube controls |
| `padding` | `0 8px` | Horizontal breathing room without layout shift |
| `opacity` (default) | `0.9` | Slightly subdued — secondary to core controls |
| `opacity` (hover) | `1.0` | Full opacity on hover to signal interactivity |
| `cursor` | `pointer` | Standard interactive affordance |
| `vertical-align` | `middle` | Aligns with surrounding control bar elements |
| `letter-spacing` | `0.01em` | Matches YouTube's label spacing |
| `line-height` | `1` | Prevents unintended height expansion |

#### Separator

The `↺` character acts as an implicit visual separator from the time display. No additional divider character (e.g., `|`) should be added. The spacing created by `padding: 0 8px` is sufficient.

### 4.4 Behavior Specification

| Event | Behavior |
|---|---|
| **Injected** | Button appears in player controls bar immediately after resume seek |
| **Hover** | Opacity increases to `1.0`; browser tooltip displays "Restart video from the beginning" |
| **Click** | `video.currentTime = 0`; storage entry for `videoId` deleted; button removed from DOM immediately |
| **Auto-dismiss** | Button is removed from DOM after **7 seconds** (within the 5–10s spec range) |
| **Navigation** | Button is removed from DOM if user navigates to a new video before auto-dismiss |
| **Player rebuild** | If YouTube rebuilds the controls DOM (fullscreen, quality change), button may disappear — this is acceptable |

### 4.5 Implementation Notes

- Create via `document.createElement('button')` — never via `innerHTML`
- Assign `id="yt-resume-restart-btn"` for safe idempotent removal
- Do not use `!important` in styles — rely on specificity of inline styles
- The `title` attribute provides the browser-native hover tooltip: `title="Restart video from the beginning"`
- Do not inject if `.ytp-time-display` is not found in the DOM; log warning silently

### 4.6 What to Avoid

| Anti-Pattern | Reason |
|---|---|
| `"Start Over"` | Vague — doesn't communicate the action's result |
| `"Restart From Beginning"` | Redundant — "Restart" already implies from the beginning |
| `"↩ Restart"` | `↩` implies undo; `↺` implies replay — semantically correct |
| A persistent button | The button is not a permanent control; it must disappear |
| A button with a background or border | Visually clashes with YouTube's flat dark control bar |

---

## 5. Surface 2 — Resume Toast

### 5.1 Status

**Recommended for v1.0. Optional if timeline is constrained.** The Restart Button (Surface 1) alone is sufficient for v1.0 compliance. The toast enhances trust but is not required.

### 5.2 Purpose

Provides silent, momentary confirmation that the extension acted. Users who experience a resume but don't notice the Restart button — or who have already moved past it — receive passive confirmation that something intentional happened.

### 5.3 Trigger Condition

Displayed **only** when a resume seek is successfully applied and a valid `resumeTime` is known.

### 5.4 Visual Specification

#### Copy

```
Resumed from 17:23
```

The timestamp must reflect the actual `resumeTime` applied, formatted as `m:ss` for videos under one hour and `h:mm:ss` for videos one hour or longer.

**Timestamp formatting examples:**

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
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│ ▶  0:08 / 35:13  ↺ Restart          ⚙  ⛶  │
└─────────────────────────────────────────────┘
```

- Positioned in the **lower-left** of the video frame, above the progress bar
- Should not overlap the Restart button or the time display

#### Styling

| Property | Value |
|---|---|
| `background` | `rgba(0, 0, 0, 0.75)` |
| `color` | `#ffffff` |
| `font-family` | `Roboto, Arial, sans-serif` |
| `font-size` | `13px` |
| `font-weight` | `400` |
| `padding` | `6px 12px` |
| `border-radius` | `2px` |
| `position` | `absolute` |
| `bottom` | `48px` (above progress bar) |
| `left` | `12px` |
| `z-index` | Match YouTube's overlay layer |
| `pointer-events` | `none` (non-interactive) |

#### Animation

| Phase | Duration | Easing |
|---|---|---|
| Fade in | `200ms` | `ease-out` |
| Hold | `1600ms` | — |
| Fade out | `400ms` | `ease-in` |
| **Total visible** | **~2200ms** | — |

The toast is **non-interactive** (`pointer-events: none`). It must never block clicks on the player controls or progress bar.

### 5.5 Implementation Notes

- Inject into the player container (`#movie_player`), not into the controls bar
- Use CSS `opacity` transition for fade — do not use `visibility` toggle
- Remove from DOM entirely after fade-out completes (do not leave a hidden element)
- Must not interfere with YouTube's own overlay messages (chapter titles, etc.)

---

## 6. Surface 3 — Extension Popup

### 6.1 Purpose

A minimal status and utility surface. Not a dashboard. The popup confirms the extension is active, shows one piece of useful data (saved video count), and offers one destructive action (clear data). It also surfaces a support link and a cross-promotion for other tools.

### 6.2 Design Constraints

- The popup must open and render in **under 200ms** — no loading state, no spinners
- All data displayed must be read synchronously from `chrome.storage.local` on open
- No animations, transitions, or dynamic updates while the popup is open
- Width: fixed at **280px**
- The popup must not feel like an app — it should feel like a system tooltip

### 6.3 Layout Specification

```
┌──────────────────────────────────────────┐
│  ▶  YouTube Resume                       │  ← Header
│     Automatically resume videos          │
│     where you left off.                  │
├──────────────────────────────────────────┤
│                                          │
│  Status          ✓ Active on YouTube     │  ← Status row
│                                          │
│  Saved videos    34                      │  ← Stats row
│                                          │
├──────────────────────────────────────────┤
│                                          │
│  [ Clear saved progress ]                │  ← Action button
│                                          │
├──────────────────────────────────────────┤
│  Support development  ❤️                 │  ← Support row
├──────────────────────────────────────────┤
│  Other tools                             │  ← Cross-promo header
│  Session Switcher                        │
│  Switch between multiple account         │
│  sessions.                               │
└──────────────────────────────────────────┘
```

### 6.4 Section-by-Section Specification

---

#### Section A — Header

| Element | Copy | Notes |
|---|---|---|
| Product name | `YouTube Resume` | `font-weight: 600`, not a link |
| Subtitle | `Automatically resume videos where you left off.` | Muted color; `font-size: 12px` |

The header communicates the product's identity to a user who just installed it or opened the popup for the first time. It is not decorative — it replaces the need for an onboarding screen.

---

#### Section B — Status

| Element | Copy | Condition |
|---|---|---|
| Label | `Status` | Always shown |
| Value — active | `✓ Active on YouTube` | Always true in v1.0 (extension has no disabled state) |

> **v1.0 Note:** The extension has no on/off toggle in v1.0. The status is always "Active on YouTube." This row exists to provide visible confirmation to users who wonder if the extension is running. Do not add a toggle in v1.0.

The `✓` character must use a color that signals "positive/safe" — system green (`#1a8a1a` on white background or `#4ade80` on dark) or YouTube red if matching the YouTube palette is preferred. Confirm against the popup's background color for sufficient contrast.

---

#### Section C — Stats

| Element | Copy | Source |
|---|---|---|
| Label | `Saved videos` | Static copy |
| Value | `{n}` (integer) | Count of keys in `youtubeResume` storage object |

The count is read once on popup open. It does not update live. If storage read fails, display `—` rather than `0` to avoid implying data was lost.

---

#### Section D — Clear Action

| Property | Value |
|---|---|
| Button label | `Clear saved progress` |
| Button style | Secondary/ghost — not a primary CTA; this is a destructive action |
| Confirmation dialog title | `Clear all saved resume data?` |
| Confirmation dialog body | `This will remove resume positions for all {n} saved videos. This cannot be undone.` |
| Confirm action label | `Clear` |
| Cancel action label | `Cancel` |
| Post-action feedback | Saved videos count updates to `0` inline |

**Confirmation dialog rules:**
- Must be a native `window.confirm()` dialog OR an inline confirmation pattern (button becomes "Are you sure? Confirm / Cancel")
- Do not build a custom modal — it is disproportionate to the action
- The inline pattern (replacing the button with confirmation copy) is preferred: it keeps the user in context and avoids a jarring browser dialog

**Inline confirmation pattern (preferred):**

```
Before click:
[ Clear saved progress ]

After click (replace button with):
Clear all saved data?  [ Confirm ]  [ Cancel ]

After confirm:
Saved videos  0
[ Clear saved progress ]   ← button restored
```

---

#### Section E — Support

| Element | Copy | Behavior |
|---|---|---|
| Label | `Support development ❤️` | — |
| Link | `Buy me a coffee` | Opens external link in new tab |

The `❤️` emoji is the single intentional exception to the no-emoji-in-functional-copy rule. Its use here is affective, not functional — it softens what would otherwise feel like a transactional ask. Use it exactly once, only here.

The support link should be:
- Visually de-emphasized (muted color, `font-size: 12px`, no button treatment)
- Not a prominent CTA — it should feel like a quiet note, not a donation drive
- Placed below the utility content, never above it

**Acceptable link copy** (choose one, use consistently):

| Copy | Tone |
|---|---|
| `Buy me a coffee` | Warm, casual — recommended |
| `Donate` | Neutral, direct |

Do not use: "Support this project", "Help keep this free", "Tip the developer" — these read as pressure copy.

---

#### Section F — Cross-Promotion

| Element | Copy |
|---|---|
| Section header | `Other tools` |
| Product name | `Session Switcher` |
| Product description | `Switch between multiple account sessions.` |

**Rules:**
- This section must appear **last** — below all utility content
- One product maximum in v1.0
- Description is one sentence, plain copy, no superlatives
- No install button or badge — a text link to the Chrome Web Store listing is sufficient
- The section header `Other tools` is intentionally generic; it frames this as a directory, not an advertisement

---

### 6.5 Popup Visual Style

The popup is not themed after YouTube. It is a standard Chrome extension popup. It should look like a well-designed native system utility.

| Property | Recommendation |
|---|---|
| Background | `#ffffff` (light mode) |
| Body text | `#1a1a1a` |
| Muted text | `#666666` |
| Border / divider | `#e5e5e5` |
| Accent (status ✓) | `#1a8a1a` |
| Width | `280px` (fixed) |
| Padding (sections) | `16px` |
| Font family | System UI stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |
| Font size (body) | `13px` |
| Font size (labels/meta) | `12px` |

Dark mode support is **not required for v1.0** but the color choices above should not actively break in dark mode environments.

---

## 7. Copy Reference

A complete, consolidated copy index for all UI surfaces. This is the single source of truth for all user-facing text.

### 7.1 Extension Metadata (Chrome Web Store)

| Field | Copy |
|---|---|
| Name | `YouTube Resume` |
| Short description | `Automatically resume YouTube videos where you left off.` |

### 7.2 In-Player UI

| ID | Surface | Element | Copy |
|---|---|---|---|
| CP-01 | Restart Button | Label | `↺ Restart` |
| CP-02 | Restart Button | Hover tooltip | `Restart video from the beginning` |
| CP-03 | Resume Toast | Message | `Resumed from {m:ss}` |

### 7.3 Popup

| ID | Section | Element | Copy |
|---|---|---|---|
| CP-10 | Header | Product name | `YouTube Resume` |
| CP-11 | Header | Subtitle | `Automatically resume videos where you left off.` |
| CP-12 | Status | Label | `Status` |
| CP-13 | Status | Value | `✓ Active on YouTube` |
| CP-14 | Stats | Label | `Saved videos` |
| CP-15 | Stats | Value | `{n}` |
| CP-16 | Action | Button label | `Clear saved progress` |
| CP-17 | Action | Confirmation prompt | `Clear all saved resume data?` |
| CP-18 | Action | Confirmation body | `This will remove resume positions for all {n} saved videos. This cannot be undone.` |
| CP-19 | Action | Confirm button | `Clear` |
| CP-20 | Action | Cancel button | `Cancel` |
| CP-21 | Support | Section label | `Support development ❤️` |
| CP-22 | Support | Link | `Buy me a coffee` |
| CP-23 | Cross-promo | Section header | `Other tools` |
| CP-24 | Cross-promo | Product name | `Session Switcher` |
| CP-25 | Cross-promo | Product description | `Switch between multiple account sessions.` |

---

## 8. Accessibility Requirements

### 8.1 Restart Button

| Requirement | Implementation |
|---|---|
| Screen reader label | `aria-label="Restart video from the beginning"` |
| Keyboard focusable | Native `<button>` element; inherently focusable |
| Focus visible | Do not suppress `:focus-visible` outline |
| Contrast ratio | White `#ffffff` on dark player background — WCAG AA compliant |

### 8.2 Resume Toast

| Requirement | Implementation |
|---|---|
| Screen reader announcement | `role="status"` and `aria-live="polite"` on the toast container |
| Non-interactive | `pointer-events: none`; no focusable children |
| Not relied upon solely | The Restart Button independently communicates the resume event |

### 8.3 Popup

| Requirement | Implementation |
|---|---|
| Section labels | Use `<label>` elements associated with their values |
| Clear button | `aria-label="Clear all saved resume data"` if button label alone is ambiguous |
| Confirmation copy | Inline confirmation pattern preferred over `window.confirm()` for screen reader compatibility |
| Color not as sole signal | The `✓` status indicator uses both an icon and text — color is supplementary |

---

## 9. Constraints & Anti-Patterns

### 9.1 Hard Constraints

| Constraint | Rationale |
|---|---|
| No UI during normal, uninterrupted playback | The extension's core promise is invisibility |
| No persistent DOM modifications | All injected elements must have defined lifetimes and cleanup paths |
| No settings page in v1.0 | There is nothing for the user to configure; a settings page implies complexity that doesn't exist |
| No notifications or browser alerts | Never interrupt the user outside of the YouTube tab context |
| No onboarding flow | The subtitle in the popup and the extension store description are the full onboarding |

### 9.2 Copy Anti-Patterns

| Anti-Pattern | Correct Alternative | Reason |
|---|---|---|
| `"Restart From Beginning"` | `"↺ Restart"` | Redundant words; "restart" implies from start |
| `"Start Over"` | `"↺ Restart"` | Vague; doesn't communicate the action |
| `"Your progress has been saved!"` | *(no copy — silent save)* | Announcing every save is noise |
| `"We couldn't find your saved position"` | *(no copy — silent skip)* | Failure states during tracking should be silent |
| `"🎉 Resumed from 17:23!"` | `"Resumed from 17:23"` | Emoji and punctuation inflate a functional message |
| `"Clear Data"` | `"Clear saved progress"` | "Data" is technical; "saved progress" is user-facing |

### 9.3 Visual Anti-Patterns

| Anti-Pattern | Correct Approach |
|---|---|
| Restart button with background fill or border | `background: none`, `border: none` — matches YouTube's flat control style |
| Toast that requires dismissal | `pointer-events: none`; auto-fade; never blocking |
| Popup wider than 280px | Fixed width; this is a utility, not an app |
| Primary-styled Clear button | Ghost/secondary styling — it is a destructive utility action, not a primary CTA |
| Extension badge count on the toolbar icon | No badge; the extension is silent when idle |

---

*This document is the authoritative UI/UX specification for YouTube Resume v1.0. All copy, layout, and interaction decisions should trace back to requirements defined here. Deviations require product sign-off and must be reflected in both this document and the companion PRD.*
