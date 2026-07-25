# YouTube Resume — Chrome Extension (MV3)

Target: **v2.0.0**. v1.0.0 is live on the Chrome Web Store with real users.
Build plan: `docs/ROADMAP_v2.md`, 9 sequential phases.

<!-- Maintainer note: HTML comments are stripped before injection and cost no tokens.
     Keep this file under 200 lines. Run /doctor occasionally to check for trimmable content. -->

## Operating mode

**Decide and keep going. Do not ask.**

The owner is non-technical and running Auto Mode. A question they cannot judge costs more than a
wrong decision you logged — wrong decisions surface at review; a stalled session doesn't. Your
default is to pick the best option, record it, and continue. Silence is not caution here.

Decisions are recorded in `docs/DECISIONS.md` rather than escalated. That ledger is what makes
high autonomy safe, so use it instead of asking.

### Decision tiers

| Tier | What it covers | What you do |
|---|---|---|
| **1** | Naming, file structure, local implementation detail, anything reversible in one edit | Decide. Don't log. Don't mention it. |
| **2** | Changes behaviour, shapes a later phase, picks an unspecified value, or resolves a doc conflict | Decide, proceed, add a `DECISIONS.md` row as `APPROVED (Claude)` |
| **3** | Touches user-visible behaviour, new copy, or stored data shape | Decide, proceed, log, and flag it in the phase report for review |
| **STOP** | The five items below only | Stop and name the decision ID you need |

### Never stop for these — decide instead

- **New copy is needed and has no CP ID.** Write it following UX Spec §2 voice rules, assign the
  next free CP ID, add it to the §7 table, log Tier 3.
- **A hard constraint blocks your approach.** Pick a compliant approach. Log Tier 2. The
  constraint is not negotiable; your approach is.
- **A doc is wrong or contradicts the code.** Code wins. Fix the doc in the same commit. Log Tier 2.
- **A value isn't specified** (timeout, retry count, threshold, easing). Pick a defensible one. Log Tier 2.
- **The phase is under-specified or its task list has a gap.** Fill it. Log Tier 2.
- **A test fails.** Diagnose and fix it. Only report it unfixed if it's blocked on a STOP item.
- **You disagree with a decision already in the ledger.** Implement it, then log a Tier 3 row
  arguing the reversal. Don't silently deviate and don't stall.

### Stop only for these

- **S1** — Changing `permissions` or `host_permissions` in a build intended for the Web Store.
  Adding them to a local unpacked manifest for testing is pre-approved; shipping them is not.
- **S2** — Deleting or rewriting existing users' saved data beyond the additive migration in PRD §7.6.
- **S3** — Anything published under the owner's name: store listing, privacy policy, support links.
- **S4** — Work needing access you don't have (a logged-in account, a device, a paid tool). Say what
  you need; don't skip the task silently.
- **S5** — Abandoning a roadmap phase, or reordering the roadmap.

## Phase tracking

Two files govern where work stands. Read both at the start of every phase, before anything else.

- `docs/project-state-summary.md` — the Phase Status table. What's done, in progress, or blocked.
- `docs/DECISIONS.md` — the ledger. **Any row whose `Implement In` matches the current phase is in
  scope for that phase, whether or not the phase prompt mentions it.** Say so up front when you find one.
  A row is in scope if `Implement In` matches the current phase number, or says "All" / "All phases".

At the end of every phase:

1. Set the phase to `AWAITING VERIFICATION` in the Phase Status table. **Never write `DONE` yourself** —
   only the owner's confirmation moves a phase to `DONE`. Code that looks right is not done.
2. Hand over a numbered verification checklist: what to click, what to expect, in order.
3. Add a `DECISIONS.md` row for every Tier 2 and Tier 3 decision from the phase, with the phase that
   implements it. A decision that exists only in your report is lost when the session ends.
4. Move rows you acted on from `APPROVED` to `DONE`.
5. Update the TDD sections the phase lists. A phase isn't finished until this is done.

If an `OPEN` row owned by Human blocks the current phase, stop and name the ID. Don't guess past it.

Stopping at a phase boundary for verification is a review gate, not a request for a decision. It is
the one place slowing down is correct.

## Hard constraints — never violate; route around, don't ask

- `permissions` is `["storage"]`; `host_permissions` is `https://www.youtube.com/*` (see S1).
- Zero network requests from the content script. The only permitted request anywhere is a thumbnail
  image GET to `i.ytimg.com` from the popup, and only when `loadThumbnails` is on.
- No `innerHTML`, no `eval`, no inline `<script>`, no external scripts, no analytics, no dependencies.
  DOM via `document.createElement` only.
- Only `storage/storageManager.js` touches `chrome.storage.local`.
- Exactly one `setInterval` and one `MutationObserver` alive at any time. Re-target, never duplicate.
- Storage root keys: `youtubeResume` (200-entry cap, oldest-first eviction by `updated`),
  `youtubeResumeSettings`, `youtubeResumeSchema`. Settings and schema version must **never** nest
  inside `youtubeResume` — its keys are counted for eviction.
- The 400ms resume delay is fixed and never user-configurable.
- Every promise chain ends in `.catch()`. The extension must never break YouTube.
- No UI during normal, uninterrupted playback.
- Never commit with `DEBUG = true`.

## Doc routing — read the section, never the whole file

Docs total ~30k tokens. Reading them all costs more than most tasks. Grep, then read the named section.

| Need | Read |
|---|---|
| Where the build stands | `docs/project-state-summary.md` + `docs/DECISIONS.md` — always first |
| What to build now | `docs/ROADMAP_v2.md` — current phase only |
| Product intent, scope, non-goals | `docs/PRD_YouTube_Resume.md` §3 |
| Storage schema, migration, eviction | PRD §7 |
| Resume logic, ad gating, tracking triggers | PRD §5.4, §5.5, §5.7 |
| Settings list and defaults | PRD §5.8, UX Spec §6.4 |
| Any user-facing string | UX Spec §7 — the only source of copy |
| In-player styling | UX Spec §4.3, §5.4 + `docs/YT_DOM_AUDIT.md` once it exists |
| Popup layout | UX Spec §6 |
| Module APIs and contracts | `docs/TDD_YouTube_Resume.md` §4, §5 |

**Precedence:** TDD > UX Spec > Roadmap > PRD for implementation detail; PRD wins on intent and scope.
**Shipped code beats every doc.** Follow the code, fix the doc, log Tier 2.

**Known drifts — don't rediscover:** TDD is still v1.0.0 and describes pre-v2 behaviour; treat it as
stale for anything Phase 2+ changed. Icons are `icon-16.png`, hyphenated.

## Token discipline

- **`/clear` between phases.** One phase, one context. Prefer `/clear` over `/compact` — compaction
  is slow and lossy; a fresh context plus a good state summary is cheaper and more accurate.
- Read the doc *section*, not the doc. `rg` to locate, then a ranged read. Never `cat` a full doc.
- Never re-read a file already in context.
- **Never echo file contents back after writing them.** One line on what changed. No diffs, no
  "here's the updated file", no code blocks repeating work already on disk.
- Prefer targeted edits over full-file rewrites.
- Use a subagent for open-ended exploration. Its search tokens stay out of the main context.
- Pipe noisy commands: `| tail -20`, `-q`, `--silent`. Never dump full command output.
- No `ls -R`, no `find /`, no unbounded repo-wide greps.
- No preamble, no restating the task, no long summaries of what you just did.
- Keep `project-state-summary.md` under ~50 lines and `DECISIONS.md` Notes to one sentence — both
  load every session.

## Project layout

```
manifest.json
content/    bootstrap · navigationManager · playerObserver · resumeManager · progressTracker · uiInjector
storage/    storageManager.js          # sole owner of chrome.storage.local
utils/      youtubeUtils · timeUtils   # pure functions only — no DOM, no storage, no side effects
popup/      popup.html · popup.js · popup.css   # two views: saved videos, settings
docs/       ROADMAP_v2 · DECISIONS · PRD · TDD · UX_Spec · Dev_Checklist · project-state-summary
```

`bootstrap.js` orchestrates and owns no logic. Modules communicate by explicit calls and callbacks,
never sideways. Load order in `manifest.json` is significant: storage → utils → content.

## Conventions

- Vanilla JS. No build step, no bundler, no dependencies. Don't introduce any.
- Console output prefixed `[YTResume]`; warnings and errors only. No `console.log` in shipped code.
- Failures are silent to the user, logged to console. No alerts, no error UI.
- Graceful degradation: if resume fails, tracking still runs; if tracking fails, YouTube still works.
- Comment *why*, not *what*.
- No test runner. Verification is manual in Chrome via Load Unpacked against the phase's test table.
- One phase, one commit: `phase N: <what changed>`. Doc updates ship with the code they describe.
