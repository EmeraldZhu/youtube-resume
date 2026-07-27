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
