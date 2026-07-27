# Privacy Policy — YouTube Resume

**STATUS: DRAFT — NOT PUBLISHED.** Written by Claude Code per D-032 for owner review. Publishing,
editing, and hosting this text is owned by the human (S3 — anything published under the owner's
name). This file is a starting point, not a final document.

*Last updated: [owner fills in publish date]*

---

YouTube Resume is a Chrome extension that automatically resumes YouTube videos from where you left
off. This policy explains what data the extension handles and how.

## Data collection

YouTube Resume does not collect, transmit, or sell any personal data. It has no account system, no
analytics, and no telemetry of any kind.

## What is stored, and where

The extension saves your playback position for videos you watch on YouTube — the timestamp, the
video's duration, the video's title and channel name (when available), and when the entry was last
updated. This data is stored **only** in your browser's local storage
(`chrome.storage.local`), on your own device. It is never sent to any server operated by this
extension or its developer. It is not synced, backed up, or shared.

You can view and delete this data at any time from the extension's popup, either per video or all
at once ("Clear saved progress").

## Network requests

YouTube Resume makes **at most one kind** of network request: when you open the extension's popup
and the "Load thumbnails" setting is on (the default), it requests a thumbnail image for each saved
video from `i.ytimg.com`, YouTube's own public image CDN. This request includes the video's ID,
which is already public information — nothing else about you or your viewing history is sent.

- No request is made unless you open the popup.
- No request is made for anything other than the thumbnail image itself.
- Turning "Load thumbnails" off in Settings stops these requests entirely; the extension then makes
  zero network requests of any kind.

Outside of this one thumbnail request, YouTube Resume makes no network requests. It does not
communicate with any server, including one operated by the developer.

## Permissions

YouTube Resume requests two permissions:

- **Storage** — to save your playback positions and settings locally on your device.
- **Access to youtube.com** — to detect when you're watching a video and to resume it.

It does not request access to your browsing history, other tabs, cookies, or any other site.

## Changes to this policy

If this policy changes, the "Last updated" date above will change accordingly.

## Contact

[owner fills in a contact method, e.g. support email or Ko-fi/GitHub link]
