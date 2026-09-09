# Chrome Web Store Listing — YouTube Resume v2.0.0

**STATUS: DRAFT — NOT SUBMITTED.** Written by Claude Code per D-033 for owner review. Submission,
screenshot selection, and final wording are owned by the human (S3). This is a starting point.

---

## Short description (≤132 chars)

Automatically resumes YouTube videos where you left off — plus a saved videos panel and settings,
fully local.

## Full description

**Never lose your place in a YouTube video again.**

YouTube Resume automatically remembers where you stopped watching and picks up right there next
time — no more scrubbing through a video hunting for your spot.

**What's new in 2.0**

- **Saved videos panel** — see every video you've been watching, with thumbnails, titles, channel
  names, and progress, right from the toolbar icon. Jump back in or remove entries with one click.
- **Settings you control** — choose your minimum watch time before a position is saved, when a
  video counts as "finished," how far to rewind on resume, and whether to show the Restart button,
  the resume message, and thumbnails.
- **More reliable resume** — rebuilt to handle ads, slow page loads, and YouTube's own navigation
  correctly, so resume fires when it should.
- **Refreshed in-player look** — the Restart button and "Resumed from" message now match YouTube's
  own player controls.

**How it works**

While you watch, YouTube Resume quietly saves your position to your browser's local storage. When
you come back to that video, it resumes playback a few seconds before where you left off. A small
Restart button lets you start over instead, and a brief message confirms where you resumed from —
both of which you can turn off in Settings.

**Privacy**

YouTube Resume stores your watch positions only on your own device — nothing is sent to any server
we operate, there's no account, and there's no tracking or analytics. The one exception: when the
saved videos panel is open and thumbnails are enabled (on by default, and you can turn this off),
it loads thumbnail images directly from YouTube's own image servers (`i.ytimg.com`) so you can see
what you were watching at a glance. See our privacy policy for full detail: [link].

**Permissions**

YouTube Resume only asks for what it needs: local storage, and access to youtube.com. Nothing else.

---

## Screenshots (owner to capture/select)

1. In-player Restart button + "Resumed from" toast, live on a YouTube video
2. Saved videos panel with several entries, thumbnails on
3. Settings panel showing the six controls
4. Empty state ("No saved videos yet")
5. (optional) Before/after or a close-up of the native-matching player controls

## Notes for the owner

- The v1.0 listing claimed zero network requests. That claim **must not carry over** — v2.0 makes a
  thumbnail request to `i.ytimg.com` when thumbnails are on (default). The wording above discloses
  this plainly rather than omitting it; adjust as you see fit, but don't drop the disclosure.
- Link the privacy policy from `docs/PRIVACY_POLICY_DRAFT.md` (or its published URL) wherever the
  Store's privacy field asks for one.

---

## v4.0.0 changelog draft (Phase 9)

**STATUS: DRAFT — NOT SUBMITTED, NOT PUBLISHED.** Added by Phase 9 (Roadmap v4 9's changelog task)
without editing anything above. Written from what Phases 0–8 actually shipped, not from the roadmap's
plan. Owner reviews and edits before use, same as the v2.0.0 draft above.

**What's new in 4.0**

- **Far more reliable resume** — resume now waits for a verified, confirmed seek before ever
  declaring success; a restored, backgrounded, or slow-loading tab recovers automatically without
  reopening the extension; concurrent tabs and rapid actions (pin, remove, settings, clear) no longer
  overwrite or resurrect each other's data.
- **"Remove completed" videos in one action** — clear out everything you've actually finished from
  the saved videos panel, with a live count and the option to include or exclude pinned videos.
  Finished is now based on whether a video genuinely played to the end, not a rounded percentage.
- **A fourth "finished" option: "Only at the end"** — for viewers who don't want a video to stop
  offering resume until it's truly over, however long it is.
- **Smoother, more accessible saved videos panel** — the list now updates live as your other tabs
  save progress, keyboard and screen-reader support was substantially improved (per-video labels,
  clearer announcements when videos are removed), and thumbnails can be turned off instantly without
  a pending request finishing anyway.
- **Explicit timestamp links now take precedence** — opening a video with a specific starting time
  (`?t=`) is respected over your saved position.
- **Under-the-hood storage rework** — all saves now go through a single serialized writer, closing a
  class of rare data-loss bugs possible under v3.0 when multiple tabs or rapid actions overlapped. No
  visible change for most users; more dependable saves for everyone.

**Permissions and privacy — unchanged from v3.0**

No new permissions were added. Storage stays local-only; the only network request anywhere is still
the optional `i.ytimg.com` thumbnail image load, unchanged from v3.0 and still governed by the same
"Load thumbnails" setting.

**Notes for the owner**

- Every claim above is backed by a specific Phase 0–8 fix — see `docs/DECISIONS.md` D-100 onward and
  `docs/ROADMAP_v4.md` if you want the technical detail behind any line before publishing.
- No screenshots redone for this pass; the v2.0.0 set above is still broadly representative. Consider
  a fresh "Remove completed" screenshot if you want one showing the new feature specifically.
