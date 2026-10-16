# Echo Lecture Finder → SetATime

Add this to the end of **`setatime.js`** in the extension, rebuild the
`.xpi`, and reload it. No manifest change is needed: `host_permissions`
already covers `https://d1bycim0bytkm9.cloudfront.net/*`, which is why the
content script runs there at all.

Data only ever moves **extension → SetATime**. Nothing is sent back, and the
secret key is never read, passed or stored. SetATime shows what arrived and
waits for you to press Import.

```js
// ---------- push lecture data into SetATime ----------
// The page asks once when it loads, and we answer. We also push whenever the
// extension's own data changes, so a tab left open stays current.
(() => {
  const KEYS = ["lectures", "marks", "lists", "playRate"];

  async function payload() {
    const d = await browser.storage.local.get(KEYS);
    return {
      lectures: d.lectures || {},
      marks: d.marks || {},
      lists: d.lists || {},
      playRate: d.playRate,
    };
  }

  async function push() {
    try {
      window.postMessage(
        { type: "k3h-echo-data", payload: await payload() },
        window.location.origin
      );
    } catch (e) {
      console.warn("[EchoFinder] could not push to SetATime:", e);
    }
  }

  // The page announces itself once it has mounted its listener.
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== window.location.origin) return;
    if (e.data?.type === "k3h-echo-ready") push();
  });

  // Mark a lecture watched from SetATime's side is NOT handled here — this is
  // deliberately one way.
  browser.storage.onChanged.addListener((ch, area) => {
    if (area === "local" && KEYS.some((k) => k in ch)) push();
  });

  // If the page mounted before this script ran, it already sent its ready
  // message and is waiting.
  setTimeout(push, 1200);
})();
```

## What SetATime does with it

| Extension | SetATime |
|---|---|
| `lectures[].name` | lecture title |
| `lectures[].start` | date |
| `lectures[].sectionName` | course |
| `lectures[].dur` (seconds) | duration, used to size a study block |
| `lectures[].durSched` | marks the duration as a rough stand-in |
| `lectures[].url` | link back to Echo360 |
| `marks[].pass` / `.watched` | pass count — **only on first import** |
| `marks[].opened` | when the most recent pass happened |
| `lists[]` | exam lists, used to order the day |
| `playRate` | watch speed, so a first pass is estimated in real minutes |

**Re-importing is safe.** Lectures match on their Echo360 id. The feed owns
titles, dates and durations; your SetATime pass ticks always win and are never
reset by an import. A lecture that disappears from the feed is kept, so a
cancelled row can't take your progress with it.
