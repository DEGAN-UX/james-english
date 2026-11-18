# Project Notes: Word Ninja

## Purpose
An offline-first spelling practice PWA for a child and parent, with typing and cannon arcade modes.

## How It Works
- Static HTML, CSS and native JavaScript modules; no build step or runtime network dependency.
- IndexedDB stores one versioned state document for word sets, history, sessions, rewards and settings.
- Shared spelling rules and encounter scheduler power both practice modes; rendering and input differ by mode.
- A service worker caches the app shell and local icon assets for installed offline use.

## Key Decisions
- Native browser APIs keep the app installable and runnable on a static HTTPS host without a backend.
- Historical attempts snapshot target text so later spelling edits do not rewrite history.
- One atomic IndexedDB state document keeps related result and reward changes together.
- Speech uses installed en-GB browser voices; offline speech must be verified on each target iPhone.
- Wardrobe prizes equip independently by body slot; old single-accessory saves are migrated without discarding unlocked items.
- Prize items unlock automatically at star thresholds; training props are decorative, child-safe equipment rather than combat mechanics.
- A correct answer celebrates in place (sparks from the typed word, synthesised fanfare in typing mode, auto-advance after ~1.6 s); the word never moves to a feedback panel. Only wrong answers use the feedback panel.
- Arcade letters come in waves: after a correct non-final hit the old letters fade out and new distinct letters (the needed one at a random position in the appearance order) fade in a few tenths of a second apart, so the next letter is never singled out. Fades run on an internal clock that only advances while the game runs.
- Arcade look (Oct 2025 restyle): dark phosphor-green field with no scanlines, white Space Invaders-style sprites with the letter in the body, green pixel cannon and ground line, no shields. Each invader sways on a sine inside a track (`layout()` in `arcade.js`), falls at `arcadeSpeed` x 1.5, and keeps one persistent DOM element (transform updates only). Stars are a canvas behind everything: not interactive, always slower than letters.
- Arcade difficulty is per word: `stats[wordId:arcade].arcadeLevel` 0/1/2 gives 6/7/8 letters (`arcadeLetterCount` in `scheduler.js`). It rises after a completed round with fewer than 4 wrong shots (`encounter.wrongShots`). The parent setting `arcadeMaxLetters` (6-8, default 8) and screen capacity can lower it. Old `arcadeDensity` is ignored.
- Vibration is a parent setting. Android/Chrome use `navigator.vibrate`; iOS Safari has no Vibration API, so `js/haptics.js` falls back to a hidden `<input switch>` tick that only fires inside a touch handler (best-effort, unverified on a physical iPhone).

## Consistency Rules
- Use semantic buttons and visible text feedback; never rely on colour alone.
- Keep child answer entry app-owned. Parent vocabulary fields may use the native keyboard.
- Exact case-sensitive equality determines correctness; edit distance only determines supportive wording.
- Preserve a resumable session and revealed-answer state across reloads.
- Giving up on a word ("Keep practising next time") always shows the correct spelling and waits for "Next word" before moving on or finishing; a skipped word reopens on that screen after a reload.
- Follow the global UX-first instructions in the user's VS Code prompt settings.

## Known Gotchas
- Safari may not offer an offline en-GB voice even when speech synthesis exists; expose a speech check and do not silently reveal answers.
- iOS PWA storage is origin-specific and can still be evicted; parents should export backups.
- Waiting service-worker updates must not interrupt an active encounter.
- A tab with a stale service worker can run old JS against new HTML; unregister the worker and clear caches (or bump `CACHE_NAME`) before judging a change. Since v32 the worker serves the cached shell for navigations so HTML and JS stay in step; updates apply via the in-app update banner. Removing an element that older cached JS queries needs a hidden placeholder for one release (see `.delete-target` in index.html).
- Speech engine rules (js/audio.js, found in the Nov 2026 audit): keep a strong reference to every utterance (Chrome can garbage-collect it before `onend`); never trust `onend` alone, so each utterance has a watchdog and typed-letter "pending" entries expire; pick voices with `pickVoice` (Android reports `en_GB`, some devices have no British voice) and still speak with the default voice; only `cancel()` when something is playing and pause briefly before the next `speak()`; unlock the AudioContext on the first touch/key press. Never leave game flow waiting on speech or on IndexedDB: saves are fire-and-forget with timeouts, and a failed load blocks saving rather than overwriting data.
- Native `confirm()` can be suppressed by browsers, which makes buttons look dead; use `askConfirm()` (in-page dialog).
- The test browser has no real audio and the dev server may cache; verify speech logic with a mocked `speechSynthesis` and run `npm start` (no-store headers).
- Editing: never issue several edits to the same file in parallel; overlapping edits silently garbled `audio.js` and `arcade.js` twice. Re-run `node --check` and the tests after every batch.

## Dependencies
- No package dependencies. Modern Safari/Chromium, IndexedDB, service workers on HTTPS, and optional Web Speech API.
- Node.js is used only for dependency-free logic tests.

## Roadmap
- Current scope: typing, Spelling Arcade, parent word sets, history, rewards, backup and offline shell.
- Not in scope: accounts, cross-device sync, cloud speech, ads, analytics or a native wrapper.

## Testing Strategy
- Run `node --test tests/*.test.mjs` for spelling, scheduling and reward logic.
- Use the README browser checklist for parent, persistence and both interaction flows.
- Verify installation, offline launch and offline speech on a physical iPhone before claiming device readiness.