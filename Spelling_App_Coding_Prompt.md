# Build a child-friendly offline spelling app

Implement the complete app described below in this workspace. This is an implementation request, not a request for a plan or mock-up. Both typing practice and the cannon-based Spelling Arcade are required in the first release. You may implement them sequentially, but do not deliver a typing-only MVP or defer the arcade.

Read existing project instructions before editing. If this is an existing project, preserve unrelated work. Make reasonable implementation choices where unspecified and document them. Ask only if a genuine blocker prevents progress. Build, run meaningful checks, fix failures, and give clear instructions for testing on a Mac and an iPhone. Be honest about anything you could not test on a physical iPhone.

## 1. Product and technical constraints

The user is an eight-year-old learning English spelling for weekly school tests. A parent normally enters 12–15 words each week, directly on the phone. The app should make practice encouraging and fun, with meaningful rewards, an animated mascot and two fully working practice modes.

- Develop on a Mac using VS Code or Cursor; the main use device is an iPhone.
- Use semantic HTML, CSS and plain modern JavaScript, optionally with JSDoc annotations for editor assistance.
- No compilation, bundling, TypeScript compilation, framework, package installation or build step is required to run the application. Do not use React, Vue, Angular, Next.js or a game engine.
- A small multi-file static project is preferred over a giant single HTML file. Native ES modules are acceptable.
- No application backend, accounts, remote database, cloud AI, analytics, advertisements or external runtime API calls.
- Store vocabulary, sessions, settings, progress and rewards locally using IndexedDB.
- Deliver an installable PWA, with a manifest, actual app icons and a service worker that caches all required application assets.
- Initial loading/installation and updates use HTTPS static hosting. Once successfully cached, ordinary use must work offline without the development Mac being on. Localhost is for development only. Do not describe opening a file:// HTML attachment as equivalent to installing the PWA.
- Work at a root URL or a static-hosting subdirectory; use suitable relative asset, manifest and service-worker paths.
- Bundle all assets locally. No runtime CDN fonts, scripts, sounds, animations or images.
- Use British English interface text and a British English speech voice where available.
- One child profile is sufficient. No practice-test mode is required.

## 2. Visual design and navigation

Create a polished, cheerful mobile interface: white background, bright accents, blue buttons, rounded corners, generous spacing and a readable sans-serif system font. Do not make it look like an administrative form or a generic dashboard.

The child’s answer must be large and easy to read, with an underline rather than a four-sided input box. Use at least roughly 30–36 px text where space permits. Keep long words readable without clipping. Show feedback with text and icons as well as colour.

Primary screens:

1. Home: current weekly set, progress, mascot, equally available “Type the words” and “Spelling Arcade” choices, accessory collection and a discreet parent-area entry.
2. Typing practice.
3. Spelling Arcade.
4. End-of-session celebration and useful short summary.
5. Mascot wardrobe/collection.
6. PIN entry and the parent area.

Use portrait-first layouts with iPhone safe-area insets, stable viewport sizing and no essential controls behind browser chrome. The entire arcade playfield and controls must fit without scrolling during play on a small iPhone viewport. Adapt to larger screens and landscape without requiring an orientation lock. Prioritise usable touch targets, at least 44 CSS px and larger for the main game controls.

Use an original friendly, blocky ninja creature with energetic movement, taking broad inspiration from the child’s interest in Minecraft, Ninjago and Sonic. Give it an original name, appearance and animations. Do not depend on recognisable franchise characters or downloaded franchise assets.

## 3. Parent area

- Protect the parent area with the fixed PIN **4441**. This is a simple parental gate, not strong security. Do not show the PIN on the child-facing unlock screen.
- Provide a numeric PIN keypad, masked entry, clear errors, delete and cancel.
- Lock the area when leaving it, reloading or backgrounding the app. Never persist an unlocked state.
- Allow the parent to create, rename, edit, archive and select weekly word sets. Each has a stable ID, title, optional test date and ordered word references. Exactly one set is current.
- Support quick entry of one word per line, as well as adding/editing an individual word.
- Keep old sets and their statistics when a new set becomes active.
- Support any reasonable list length; 12–15 is the normal size, not a hard requirement.
- MVP word entry supports English alphabetic words, with uppercase/lowercase preserved. No umlauts, digits, apostrophes, hyphens or spaces within a target word. Clearly reject unsupported entries with a helpful parent-facing explanation; never accept a word the child’s controls cannot enter. Do not silently strip punctuation.
- Trim surrounding whitespace; detect duplicate words in a list and explain rather than silently adding duplicates. Treat differently capitalised variants cautiously so an accidental duplicate is flagged for review.
- Each word may have an optional spoken example sentence and pronunciation preview. Warn that homophones such as “their” and “there” need a sentence to make dictation unambiguous. Do not invent unreliable disambiguation automatically.
- Before activating a set, allow the parent to preview speech. Missing audio capability must be visible.
- Show clear statistics by word and by mode: first-attempt recall, assisted corrections, later unassisted recall and last practised date. Avoid presenting a single misleading success percentage that combines copying with independent recall.
- Provide speech voice/rate settings, effects volume/mute, reduced motion and arcade difficulty settings. Start easy; do not silently increase speed as a reward.
- Provide export and import of a versioned JSON backup containing all vocabulary, progress, rewards and settings. Validate before import, show what replacement will do, and ask for confirmation before replacing local data. Do not partially apply invalid backups.
- Confirm destructive actions. Archiving a list should not remove historical results. Handle editing a word with existing history explicitly: snapshot historical target text and preserve history; reset mastery for the changed spelling or create a new word identity rather than transferring mastery silently.
- Ordinary parent word entry may use the native keyboard. The child’s answer entry must not.

## 4. Shared practice and correction flow

Both game modes use the same checking rules and learning flow, with separate statistics per mode.

1. A user gesture starts the session and enables audio.
2. Speak the target word. If an example sentence exists, speak the word, the sentence, then the word again. Keep the answer and sentence text hidden until submission so the spelling is not leaked.
3. Provide a clearly labelled replay button. Replays are unlimited and never penalised.
4. Let the child build an answer and press “Finished”. Empty answers cannot be submitted and must not count as attempts.
5. Compare with the intended spelling, including capitalisation. A capitalisation-only error gets a specific friendly hint. Use exact correctness; similarity must never cause an incorrect spelling to pass.
6. If correct, clearly say/show “Correct!” or a varied equivalent, display the correct answer prominently, play the appropriate celebration and show “Next”. Do not auto-advance before the child can read the feedback.
7. If incorrect, preserve the child’s answer, show the correct spelling prominently alongside it, and provide supportive feedback. Allow editing and resubmission. In arcade mode, pause movement during feedback and provide “Let’s fix it” to resume with the model spelling still visible.
8. Once an answer has been revealed, all remaining corrections for that encounter are assisted. A correct copied answer earns encouragement but cannot become a first-time success or an unassisted recall success.
9. Schedule one later encounter with the answer hidden after several other words, where possible. Track that as later unassisted retrieval. A later retry is never reclassified as the original first attempt.
10. If only a few words remain, put the recall attempt at the end. For very small lists, defer meaningful spaced recall to the next session instead of inventing extra words. Keep sessions finite: at most one scheduled hidden-answer revisit per failed word per session. Offer a friendly “Keep practising next time” route after support so a struggling child cannot be trapped in an endless loop.

Use Damerau–Levenshtein distance to handle substitutions, insertions, deletions and adjacent swaps. Define the exact variant and unit-test it. Suggested initial wording rule: distance 1 is “Nearly!”; distance 2 is also “Nearly!” for words of at least 6 letters; larger distances use “Good try—let’s look together.” A case-only mismatch gets “Nearly! Check the capital letter.” These thresholds are configurable product heuristics, not a claim of educational assessment validity.

Highlight differences using an alignment that understands insertions/deletions; do not colour all later letters wrong just because one letter was omitted. Only make precise hints such as “One letter is missing” when the computed edit actually supports that statement. Do not show live correctness feedback while composing the initial answer.

Avoid harsh buzzers, shaming language, disappointed mascots, lost lives, lost earned rewards or speed pressure.

## 5. Session scheduling and past-word review

- A session covers the **entire current list**, with each current word presented at least once. Do not replace this with an 8–10-word sample.
- Shuffle initial current-list prompts sensibly and avoid immediate duplicates.
- Add occasional older words the child previously struggled with: approximately 10% of the initial prompt mix should be eligible older review words, leaving about 90% current words. These are extras; they must not displace any current word.
- Use a small carried fractional review budget across sessions, or an equivalently documented scheme, to approximate the ratio without random long runs of old words. For example, accumulate currentWordCount / 9 review slots per completed/committed session plan and carry the remainder. Do not award the budget repeatedly when resuming or restarting the same plan.
- Keep this review-ratio accounting separate from corrections and hidden-answer revisits; those should not trigger more old-review prompts.
- If there is no eligible historical vocabulary, use current words only and do not build an unlimited future review debt.
- Eligible older words are outside the current list and have evidence of previous difficulty. Prioritise weak first-attempt recall, repeated errors and overdue review. Deprioritise words that subsequently have reliable unassisted success across sessions.
- Maintain per-mode evidence. Arcade success is supported letter selection, so it must not by itself mark a word mastered in typing mode.
- Define a simple transparent practice-status rule rather than introducing opaque AI scoring. For example, typing mastery can require first-attempt independent success in three separate sessions, while arcade progress has its own label.
- Persist the generated queue, answer state and progress so closing the app does not lose the session or reshuffle already completed work. Resuming must not repeat reward transactions.
- Show progress honestly, e.g. “Weekly words: 6 of 15” and “Review word”, with a separate indication when doing later recall. Do not label a copied correction as independent mastery.
- Let the child choose either mode from the start. Do not lock arcade behind typing. If leaving an active session to switch modes, retain the resumable session and make the choice clear.

## 6. Typing mode: app-owned keyboard

Use a friendly, custom QWERTZ keyboard with these letter rows:

    q w e r t z u i o p
    a s d f g h j k l
    y x c v b n m

- Blue keys, white letters, rounded corners and satisfying pressed states.
- Lowercase by default. Include Shift for capitals, Delete and a prominent Finished action. No umlauts or special-character keyboard. No microphone, suggestions, predictive text, autocomplete or paste into the answer.
- One-shot Shift capitalises the next inserted letter and then returns to lowercase. Clearly show the active state.
- The answer display must not be an editable HTML input or contenteditable element, so focusing it cannot invoke the system keyboard or system text dictation. Use accessible labels and status text.
- Support a visible caret, cursor left/right controls and deletion before the caret so the child can edit an error without always retyping the whole word.
- Physical keyboard support on the Mac is useful for development and must use the same state transitions. Support letters, Shift/capital letters, Backspace, cursor keys and Enter. Accept only allowed characters. Avoid hijacking keys in parent forms.
- This prevents ordinary system-keyboard assistance; do not claim tamper-proof security against all OS accessibility tools or deliberate code modification.

## 7. Spelling Arcade: movable cannon and dedicated controls

This mode is a required first-release feature, not a future enhancement.

### Layout and controls

- Display the growing answer in large bold text at the top, along with replay, progress and pause controls.
- Letters fall slowly from the top of the playfield in readable, generously sized targets.
- A friendly cannon moves horizontally near the bottom and fires vertically upwards.
- Below the playfield, provide a dedicated control panel with three large primary buttons: **Left**, **Right** and **Shoot**. Use the same blue/white rounded design language as the typing keyboard.
- Holding Left or Right moves continuously; releasing stops. Simultaneous movement and shooting must work with multi-touch. Handle pointer capture, pointer cancellation, lost focus and backgrounding so movement never becomes stuck. Opposing movement inputs cancel.
- Tapping a falling letter is not the normal shooting interaction. Aim with the cannon and fire with Shoot. Do not replace the requested cannon gameplay with tap-to-select targets.
- For Mac testing, provide Left/Right arrow movement and Space to shoot. Ignore page-scrolling shortcuts only while the arcade is active and focused.
- Include a smaller, clearly labelled Shift toggle in the control panel. It changes displayed letter targets to uppercase while active and returns to lowercase after one successful letter capture. A missed shot or command-target hit must not consume Shift.
- Start with one projectile in flight at a time, with a short cooldown. This keeps hit order, Shift behaviour and accidental rapid-fire effects understandable. Each hit captures exactly one letter and consumes the projectile.

### Delete and Finished targets

- A permanent **Delete** target is always visible at the far left of the playfield.
- A permanent **Finished** target is always visible at the far right.
- Both must be shootable with the same vertical projectile: the cannon’s travel range reaches their centre lines. Use reserved edge lanes and put the targets at reachable heights above the cannon.
- Falling letters cannot enter those edge lanes or obstruct command-target shots. Do not place a decorative target where the cannon can never hit it.
- Hitting Delete removes the last captured letter. It is harmless when empty. Hitting Finished submits the answer using the shared flow; it is visibly unavailable when empty.
- On-screen Left/Right/Shoot remain the primary gameplay controls. Semantic accessible alternatives to game actions may be included for assistive technology, without changing the default cannon interaction.

### Letter supply and fairness

- Start easy, with about 5–6 falling targets visible and slow movement. Make speed and density parent-configurable within sensible limits.
- Keep the next required letter available, along with optionally the following one or two letters and distractors. All targets use the same visual treatment; correct letters must not be highlighted or preferentially placed in the cannon’s path.
- If a required letter exits the screen, replenish it from the top promptly. Do not penalise the child for letting any letter fall off-screen.
- Support repeated letters such as those in “letter”, “apple” and “book”. Supply further occurrences after collection and after deletion.
- Define next-required supply using the longest correct prefix of the composed answer, comparing letters without case for supply purposes only. Shift handles case and final checking remains case-sensitive. After an error, keep the letters needed from the divergence available; do not use answer length alone and make recovery impossible.
- Recompute supply after deleting letters, changing targets and resuming. Keep all alphabet letters eligible as distractors. Do not instantly rearrange everything in a way that visibly tells the child a shot was wrong.
- Wrong-letter hits append the letter normally, with neutral capture feedback. Do not reject, flag or auto-delete a wrong letter before Finished, as that would reveal the spelling by trial and error.
- Deleting and refilling must not deadlock at the end of the word. If the composed answer already matches the target, leave control with the child; do not announce correctness or auto-submit early.
- On submission, pause the simulation, clear in-flight projectiles and held inputs, and show the shared feedback. Disable shooting until the next explicit state transition.
- On an incorrect answer, show the correct spelling clearly. “Let’s fix it” resumes movement with the model visible so the child can use the permanent Delete and Finished targets to correct the answer. Later recall hides the model again.
- There is no countdown, health loss, collision damage or penalty for missing a shot. Do not reward shooting faster than the child can think.

### Implementation reliability

Use requestAnimationFrame with time-based movement and capped frame deltas. Pause on document visibility changes and explicit pause. Resume only through a clear child action after returning. Keep game state separate from rendering; canvas or positioned DOM/SVG elements are both acceptable. If using canvas, retain semantic DOM controls, answer text and feedback. Respect device pixel ratio without making collision coordinates inconsistent. Resize without losing the answer or making edge targets unreachable.

## 8. Mascot, animations and rewards

Gamification is central, not a decorative afterthought.

- Provide an original mascot with idle, listening, thinking, encouraging, successful-correction and big-celebration states.
- Small first-time success: a cheerful jump, short sound and a star.
- Two consecutive unassisted first-attempt successes: a distinct, slightly larger celebration. Three and five can add richer variations. Track supported arcade streaks separately from typing streaks.
- Assisted correction: a warm animation and wording such as “You spotted it!”; never falsely label it first-time success.
- Completing all weekly words: a more elaborate session celebration and a useful summary, distinguishing independent answers from assisted ones.
- A mistake may end a temporary consecutive-success chain, but never removes earned stars or accessories, and does not trigger punitive messaging.
- Use a simple documented reward economy. Suggested default: two stars for independent first-submission success, one for finishing a word with support, plus a modest first session-completion bonus. Apply per-word/per-mode/day caps so replaying the same completed word cannot farm endless stars. Later recall does not duplicate the encounter’s base reward. Use stable reward-event IDs and atomic/idempotent persistence.
- Include at least six small unlockable accessories such as a ninja headband, trainers, sunglasses, scarf, space helmet and colourful trail. Provide a wardrobe with clear locked/unlocked/equipped states, attainable thresholds and no real-money purchases. Ensure accessories visibly appear on the mascot.
- Keep animations brief and responsive; do not block the Next button behind a long sequence. Avoid distracting motion while the child is reading a correction.
- Use lightweight local SVG/CSS/Web Animations or canvas effects. Where internet-sourced animation assets are used, verify the licence, include required attribution and bundle them locally. Do not add a remote dependency merely for confetti. Original vector animations are a suitable fallback if compatible assets cannot be obtained.
- Support mute, reduced motion and system prefers-reduced-motion. Reduced motion should retain positive feedback through static poses and gentle changes. Avoid flashing and intense screen shake.
- Vibration is optional progressive enhancement only. Feature-detect navigator.vibrate, fail gracefully, and do not promise iPhone Safari vibration or add a native wrapper to obtain it.

## 9. Speech and audio

- Use browser speech synthesis for the MVP. No parent recording feature or paid/cloud speech service is required.
- Prefer an available local en-GB voice. Offer an explicit parent choice among suitable installed English voices. Handle asynchronous voice loading and voiceschanged; do not assume getVoices() is populated immediately.
- Treat localService as a useful indicator, not proof that offline speech works on every iPhone. Include an actual parent-facing speech check and instructions to test in aeroplane mode on the target device.
- Remember the selected voice by stable descriptive attributes with a fallback if unavailable. Never substitute another language silently.
- Start speech from explicit user interaction where required, cancel prior utterances before replay, and handle speech errors visibly. Provide replay if automatic playback of a later word is blocked.
- Pause arcade movement while the word is being dictated, then resume without forcing the child to aim and listen simultaneously. Replay must cancel overlapping speech and temporarily pause gameplay.
- Generate small effects locally with Web Audio or bundle short audio files. Do not play effects over spoken words. Muting effects must not accidentally disable dictation; provide separate controls.
- If speech fails offline, show a clear explanation and a retry/settings route. Do not silently reveal the answer as an audio fallback or mark a silent question wrong. Do not claim full offline readiness until the parent has verified speech on the device.

## 10. Data integrity and offline behaviour

Use a versioned IndexedDB schema with clear modules for storage, scheduling, checking, audio, rewards and UI. Suggested entities are word definitions, weekly sets, per-mode word statistics, attempt events, sessions, reward events, accessory ownership/equipment and settings.

Historical attempts should preserve word ID, target spelling at the time, mode, timestamp, session and encounter IDs, typed answer, submission number, correctness, whether the answer had been revealed, and whether this was a later recall encounter. Keep recognition-based arcade outcomes distinguishable from typing recall.

- Save at meaningful transitions and debounce composition saves. Resuming after app closure must preserve revealed-answer status; never turn an assisted encounter into an unassisted one by reloading.
- Save updates to results and rewards atomically where possible. Disable duplicate submission while saving.
- Handle database unavailability, quota errors and failed saves with an honest message. Do not display “Saved” unless the write succeeded. Offer backup where useful.
- Request persistent storage where supported but do not imply it guarantees against deletion. Provide clear export/import instructions and a gentle backup reminder in the parent area.
- Cache HTML, CSS, JavaScript, icons and all local visual/audio assets. A failed initial cache operation must not produce a false “Ready offline” status.
- Offer updates between sessions. Do not force a service-worker replacement and reload in the middle of an answer or cannon shot. Version caches and safely migrate data; never wipe IndexedDB during asset-cache cleanup.
- Document that changing the site origin creates a separate browser-storage location and that device-to-device automatic syncing is outside scope.
- Pause safely when backgrounded. Persist learning state, but it is acceptable to reconstruct falling target positions when resuming rather than storing every animation frame.
- Seed an optional clearly labelled demo list only on an empty installation; never overwrite real vocabulary on reload or update.

## 11. Project deliverables

Provide runnable source files, working local assets, manifest, service worker and app icons. Suggested organisation:

    index.html
    styles.css
    js/app.js
    js/storage.js
    js/practice.js
    js/scheduler.js
    js/spelling.js
    js/audio.js
    js/keyboard.js
    js/arcade.js
    js/rewards.js
    js/mascot.js
    sw.js
    manifest.webmanifest
    assets/
    tests/
    README.md

Adjust structure sensibly without overengineering. Include a README explaining how to serve the static files locally on a Mac without a build step, publish them to an HTTPS static host, install on an iPhone, test offline speech, back up data and apply updates. Do not actually deploy publicly without the owner’s instruction.

Provide meaningful dependency-free logic tests where practical, with exact instructions for running them. Browser-based tests are acceptable. Development/test tooling must not become a runtime or build requirement. Include a manual iPhone acceptance checklist for behaviours that cannot be verified in the current environment.

## 12. Acceptance checks

Do not declare the app complete until both modes are implemented and relevant checks have run. Report what passed, what failed and what requires physical-device verification. Specifically cover:

1. Fresh install has usable empty/demo states; parent PIN 4441 unlocks and a wrong PIN does not; leaving/reloading relocks.
2. Parent can enter a 15-word list on the phone, preview speech, activate it, edit/archive lists and retain history.
3. Every current word appears at least once in a full session. Old review prompts are additional and approximately 10% across sessions, with no historical pool handled gracefully.
4. Typing keyboard is QWERTZ, lowercase with one-shot Shift, has no umlauts/special characters, and never brings up the native keyboard for the answer.
5. Correct first answers display the target, reward appropriately and present Next. Incorrect answers show the target, retain the attempt, allow correction and later hidden recall.
6. Missing letters, extra letters, adjacent swaps, case-only errors and substantially wrong answers receive accurate classification. Compare “lettre”/“letter”, “leter”/“letter”, “Letter”/“letter” and correct “Monday”.
7. Copying a shown answer, restarting or reloading cannot count as independent first-time success or award duplicate rewards.
8. Cannon moves with Left/Right, can move and shoot simultaneously, stops on release/cancel/blur, and has a separate Shoot button. Direct tapping letters is not the default mechanic.
9. Delete and Finished are permanent far-left/far-right targets, both physically reachable by the cannon and unobstructed by falling letters.
10. Wrong letters can be captured; deletion and subsequent correction work. Repeated letters, a missed required letter, a wrong early letter and an answer longer than the target never make a word impossible to complete.
11. Arcade Shift creates capitals correctly, resets only after a letter capture and works with words such as “Monday”. Missing a shot and hitting Delete/Finished do not consume it.
12. Arcade feedback, speech, pause and backgrounding safely stop movement and shooting. Resizing keeps controls visible and command targets reachable.
13. First-time successes, two-in-a-row events, corrections and completion have distinct encouraging feedback. Earned accessories can be equipped and persist after restarting.
14. Progress and active sessions survive reload; JSON export/import round-trips all relevant state; invalid imports cannot damage existing data.
15. After successful installation/cache completion, the installed app launches in aeroplane mode with all visual assets and saved data. Verify actual speech separately on the target iPhone and report any limitation explicitly.
16. No application requests are made to analytics, AI endpoints, CDNs or remote asset services during ordinary practice. Offline operation does not need the Mac or a backend.
17. Both modes work on a narrow phone viewport without hidden controls. Reduced motion and mute work; spoken prompts remain available when effects are muted.
18. An app update preserves data and does not interrupt an active session. Storage failures and unavailable speech have understandable recovery states.

Implement now. Maintain a brief requirements checklist during the work, exercise both complete learning flows, and deliver the whole first release rather than stopping after architecture, static screens or the typing mode.
