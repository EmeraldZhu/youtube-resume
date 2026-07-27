# YouTube DOM Audit — Phase 5

Measured live via DevTools/computed styles on `https://www.youtube.com/watch?v=dQw4w9WgXcQ`,
desktop Chrome, default and theater modes. Closes D-026. All values below are **measured**, not
assumed — this is the source of truth for `uiInjector.js` and replaces the "intent" columns in
UX Spec §4.3 and §5.4.

## Method

Computed styles read via `getComputedStyle()` and `getBoundingClientRect()` in the live page
console (not devtools inspector screenshots), including a real mouse hover (not a simulated
`:hover` class) to capture actual hover-state values.

## Control bar

| Element | Property | Measured value |
|---|---|---|
| `.ytp-chrome-bottom` | `height` | `59px` — identical in default and theater mode |
| `.ytp-progress-bar-container` | distance from player bottom edge to its top | `62px` (default, this viewport) |

**Implication:** control-bar height is stable across layout modes, so it's safe to read at
injection time rather than hard-code. `uiInjector.js` now measures `.ytp-chrome-bottom` height at
runtime and derives the toast's `bottom` offset from it, instead of a fixed px value.

## `.ytp-time-display` (font/text baseline)

| Property | Measured value |
|---|---|
| `font-family` | `"YouTube Noto", Roboto, Arial, Helvetica, sans-serif` |
| `font-size` | `14px` |
| `font-weight` | `500` |
| `color` | `rgb(238, 238, 238)` (`#eeeeee`) |
| `letter-spacing` | `normal` |
| `line-height` | `40px` (vertically centers in the 40px-tall control row) |
| `padding` | `8px` |

v1.0 used `12px` — confirmed undersized (Defect V5).

## Native control buttons

| Element | `background` | `border-radius` | Notes |
|---|---|---|---|
| `.ytp-play-button` | `rgba(0, 0, 0, 0.3)` | `50%` | Circular fill exists but reads as flat against the bar's own dark gradient |
| `.ytp-settings-button` / `.ytp-fullscreen-button` / `.ytp-subtitles-button` / `.ytp-size-button` | `rgba(0, 0, 0, 0)` | `0px` | Flat icon buttons at rest **and** on hover — hover is opacity-only (`transition: opacity 0.1s`), no background fill |

**Finding:** the roadmap's premise that "YouTube moved to rounded-pill controls with hover fills"
does not hold for the icon buttons in the desktop control bar — they're flat. There is no native
inline **text** button in the control bar to copy directly (the Restart button has no native
equivalent). D-027 (reverse the no-background anti-pattern) is still implemented as approved — see
"Design decision" below — using the nearest real measured analog instead of the icon buttons.

## Nearest real "chip" analogs (used for the pill treatment)

| Element | `background` | `border-radius` | Notes |
|---|---|---|---|
| `.ytp-settings-menu` (popup panel) | `rgba(0, 0, 0, 0.6)` | `12px` | YouTube's own current overlay-chip treatment |
| `.ytp-menuitem` hover row | `rgba(255, 255, 255, 0.1)` | `0px` (full-width row, radius n/a) | Real measured hover-fill intensity |
| `.ytp-cards-button` (top-right watermark/info icon) | — | — | Corner inset from player edge: `8px` top, `12px` right |

## Design decision (Tier 2)

No native text-pill button exists in the control bar, so the Restart button borrows its pill fill
from the measured `.ytp-menuitem` hover intensity (`rgba(255,255,255,0.1)` at rest,
`rgba(255,255,255,0.2)` on hover) and a pill radius derived from the 40px control-row height
(`20px`). The toast borrows its background and radius directly from the measured
`.ytp-settings-menu` panel (`rgba(0,0,0,0.6)`, `12px`), since that panel *is* YouTube's current
overlay-chip component. Toast left inset bumped from `12px` to `16px`, staying in the same range as
the measured `.ytp-cards-button` inset (`8–12px`) while satisfying the "increase" called for by V3.

Logged as D-046 in `docs/DECISIONS.md`.
