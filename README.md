# Word Ninja

Word Ninja is an offline-first spelling practice PWA for one child and a parent. It has two complete practice modes: an app-owned QWERTZ typing keyboard and a movable-cannon spelling arcade. It uses plain HTML, CSS and JavaScript modules; there is no framework, build step, package installation, backend, account, analytics or runtime CDN.

## Run On A Mac

From this folder, start the bundled static server. It switches browser caching off, so a laptop or phone never runs stale files:

```sh
npm start
```

It prints a `localhost` address and a same-Wi-Fi address for a phone. (`python3 -m http.server 8000` also works but lets browsers cache files.) Stop the server with Control+C. `file://` cannot run the app because browsers block ES modules there, and it is not a PWA or offline test; service workers require localhost during development or HTTPS when hosted. A phone opening the Wi-Fi address gets a plain page without offline caching, because that address is not HTTPS.

The app has no back end: every word list, score and setting lives on the device, so the server only hands out files. To rule the local server out completely, publish the folder to any static HTTPS host (GitHub Pages, Netlify, Cloudflare Pages) and use that address on both laptop and phone.

Run the dependency-free logic tests with:

```sh
npm test
```

This test script uses the Node.js standard library only. There is no `npm install` step.

## Publish And Install On iPhone

Copy the project files, including the `js` and `assets` folders, to a static host that serves HTTPS. No server-side code is needed. A subdirectory deployment is supported because the manifest, module, icon and service-worker URLs are relative to the app. Do not change the app's origin after families begin entering words; browser storage is separated by origin.

On iPhone, open the HTTPS address in Safari, wait for the page to finish loading, then use Share > Add to Home Screen. Launch Word Ninja from its new home-screen icon once while online so the service worker can cache the app shell. The footer changes to “Offline copy ready” only after the worker is active. The browser may still evict local storage, so keep a parent-area JSON backup.

To apply a published update, open the app while online. When an update is ready, use its update button between games. The app does not force a reload during a spelling encounter. Updates replace only cached app files; they do not delete IndexedDB data.

## Parent Setup And Backups

Choose Parent area and enter the fixed parent PIN `4441`. This is a simple parental gate, not strong security. Add a list using one English-alphabetic word per line. Uppercase and lowercase are preserved; punctuation, spaces within words and case-insensitive duplicates are rejected. Optional example sentences are available for ambiguous homophones such as “their” and “there”. Activate the list after reviewing it. Editing a spelling with existing history creates a new word identity; saved attempts retain their original target spelling.

Export a JSON backup regularly from the parent area and keep it outside the browser on a separate device or storage location. Import validates the file before asking to replace all local data. Automatic syncing between devices is not provided. A browser clear, device cleanup or a changed site origin can require restoring a backup.

## Speech And Offline Verification

Speech uses the browser's installed English voices. The parent area lists available voices and includes a speech check. “On device” is only a browser hint, not proof that the voice can speak offline. Before relying on dictation, install the PWA, select and test a voice, enable aeroplane mode, close and relaunch the installed app, then run the speech check and complete a prompt. iOS voice downloads and speech availability vary by device and language settings. If speech fails, the app asks for a retry and does not reveal the spelling or grade a silent answer.

Celebration effects and the cannon report are generated with local Web Audio and can be muted independently from speech. Reduced motion can be enabled in the parent settings and system reduced-motion is respected.

Vibration can be turned off in the parent settings. Android Chrome vibrates on correct answers and cannon shots. iPhone Safari does not allow web pages to vibrate, so the app attempts a light tap that only works right after a touch and has not been verified on a physical iPhone.

## Practice Rules

- Every current weekly word is scheduled once; eligible historical review words are additional. Review accounting carries a fractional budget between planned sessions and clears when no old review words are eligible.
- Correctness is exact and case-sensitive. A Damerau-Levenshtein distance of one, or two for targets of at least six letters, selects a “Nearly” hint only; it never accepts an answer.
- First-try typing recall, assisted corrections, later hidden recall and arcade supported letter selection are tracked separately by mode.
- Base stars are two for independent first-submission success and one for supported correction, with one base reward per word/mode/day. Later recall cannot award that base reward again. A modest completion bonus is limited to one per set/mode/day.
- Correct answers and session completion use original, watermark-free CSS fireworks. Rockets rise from visible bases along the bottom edge and burst into star particles; reduced-motion mode uses static bursts.
- Nix’s wardrobe has independently equipped headwear, eyewear, scarves, shirts, arms/gloves, trousers, footwear, training props, and trails. Colour outfits and props unlock automatically at star thresholds; older single-accessory saves are migrated into the matching slot.
- The arcade keeps three or four falling letter targets visible on spaced invisible tracks. Aim using Left and Right, then shoot. Capturing the expected next letter (with the right capital or lower case, using Shift where needed) adds it to the answer with a small starburst; any other letter briefly greys out at the hit point and is not added, so there is no Delete or Finished control. Once the last letter is captured the answer auto-submits, celebrates briefly and moves to the next word. There is no timer, health loss or penalty for a missed shot.
- In typing mode, after 0.9 seconds without a key press, only an exact correct answer is auto-confirmed. A wrong or incomplete answer is left untouched and unjudged until the child presses Finished. The Finished button remains available to submit immediately.
- Choosing either practice mode from Home starts a fresh game from the beginning. An unfinished game is saved for later; use Continue your saved game to resume it.
- Newly typed letters are spoken immediately by their English alphabet names, including both names for double letters. In Arcade, only a hit on the next required letter is spoken. Arcade distractors remain silent.

## iPhone Acceptance Checklist

Use a physical iPhone for these checks; they cannot be established by the Mac browser tests alone.

- [ ] Install from HTTPS, launch from the home-screen icon, enable aeroplane mode, relaunch and confirm all app visuals and saved words remain available.
- [ ] In aeroplane mode, complete the parent speech check and a dictated word. Record the chosen voice and whether it works offline; do not assume it does.
- [ ] Enter a 15-word set, include an optional sentence for a homophone, preview speech and activate the set.
- [ ] Verify a wrong PIN is rejected, `4441` unlocks, and navigating away or backgrounding locks the parent area.
- [ ] Complete both modes on a narrow portrait viewport. Confirm the answer typing screen never opens the iOS keyboard.
- [ ] In Arcade, hold Left and Right, shoot while moving, cancel a touch, shoot a wrong letter (it must not join the answer), shoot a right letter in the wrong case (hint appears) and complete the spelling.
- [ ] Rotate to landscape and return to portrait; ensure all controls remain reachable.
- [ ] Enable mute and reduced motion. Confirm spoken prompts remain available with effects muted.
- [ ] Close and relaunch during a partially completed word; resume without losing the answer or turning a revealed correction into an independent result.
- [ ] Export a backup, try an invalid JSON file, then restore a valid backup and confirm history and equipment persist.

## Current Verification Limits

The included tests cover spelling distance/alignment, validation, queue completeness and review budgeting, arcade prefix recovery, and reward idempotency. They do not simulate iOS Safari, device storage eviction, VoiceOver, physical multi-touch or installed offline speech. Those checks require the physical-device list above. No public deployment has been performed.