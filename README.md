# Rep Routine

Rep Routine is a lightweight, mobile-first workout tracker for a five-day Pull–Push–Legs–Pull–Push routine. It is an installable PWA that runs with no compilation, framework, account, or backend.

## Quick start

1. Visit the deployed GitHub Pages link, or start the local static server described below.
2. Select a weekday from Monday to Friday.
3. Open **Manage → Workout plan** to create an exercise or choose one from your Exercise Library.
4. Tap an exercise card to expand it.
5. Add sets and enter the weight and repetitions.
6. Use **1 min**, **2 min**, or **Custom** to start a rest timer.
7. Export a JSON backup after important updates.

Everything is saved automatically in the browser while you type.

## Install and use offline

Visit the deployed app once while online. In Chrome or Samsung Internet, choose **Install app** or **Add to Home screen** from the browser menu. When the browser offers an in-app install action, it also appears at the bottom of **Manage**.

After the first online setup completes, Rep Routine can reopen from its app icon without a connection. The full interface, workouts, notes, history, backups, and rest timer remain available offline. An export still downloads to the phone normally; importing still requires selecting a backup file.

The unobtrusive version number at the bottom of the workout screen shows the running release. **Manage → App status** reports whether offline access is ready.

### Safe application updates

While online, Rep Routine checks for a newer deployed release in the background. It downloads the complete application shell and shows **Update available** only after that release is ready.

- Choose **Later** to keep the current version running while that app window remains open. After every Rep Routine window closes, the browser may activate the ready update automatically.
- Choose **Update** to switch versions and reload.
- Updates wait while a rest timer, editor, drawer, or another Rep Routine window is open.
- Application updates replace cached code only. They do not clear workout data in browser storage.
- Every cached asset is checked against the release manifest before an update can activate. If a new release is incomplete or still propagating through GitHub Pages, the last complete offline version continues to work.

## Weekly routine

| Day | Workout |
| --- | --- |
| Monday | Pull |
| Tuesday | Push |
| Wednesday | Legs |
| Thursday | Pull |
| Friday | Push |

Each date is stored as a separate workout session, so changing a future workout never overwrites earlier history.

## Features

### Exercise tracking

- Add and remove exercises while preserving their order.
- Collapse exercise cards to keep long workouts easy to scan.
- Only one exercise stays expanded at a time, reducing accidental edits.
- Add or remove any number of sets.
- Choose weight and repetitions with a touch-friendly dual wheel: 0–100 kg in 0.5 kg steps and 1–30 reps.
- Saved sets appear as compact **weight × reps** rows. Tap anywhere on the value row to edit both values; the separate trash button removes the set.
- Save one shared note per exercise for machine settings, grip, form cues, or other reminders.
- Expand an exercise card and tap the note icon between its type tag and difficulty dropdown to add or edit its note without opening Manage. The icon turns lime when a note exists, and changes autosave as you type.
- During the current week, quick notes update the shared library note and that exercise's current-week cards. Notes edited in older history affect only that dated workout, preserving other snapshots.
- Keep the application header and weekday selector visible while exercises scroll.

### Exercise Library

- Reuse the same exercise on multiple weekdays.
- Search existing exercises when adding them to a workout.
- Matching names reuse an existing library entry, ignoring capitalization and extra spaces.
- Removing an exercise from one weekday does not remove it from another weekday or erase its history.
- Rename exercises and edit their type or shared setup note from the management panel.
- Archive exercises to hide them from future selection without affecting active plans or history.
- Permanently delete an exercise from the library and future plans while retaining readable workout history.
- Exercise type and notes are shared wherever the exercise is used.

### Progressive overload

When a new dated workout is opened, Rep Routine finds the latest earlier performance for each exercise and pre-fills its weights, reps, and sets.

Progress is shared across weekdays. If Lat Pulldown is performed on Monday and Thursday, Thursday starts with Monday's latest numbers, and the following Monday starts with Thursday's latest numbers.

Different exercises used in scheduled rotations maintain separate performance histories.

### Tags

- Classify exercises as **Compound** or **Isolation**.
- Rate each workout's difficulty as **Easy**, **Moderate**, **Hard**, or **Max Effort**.
- Create, rename, and delete custom tags.
- Exercise-type tags are shared through the Exercise Library.
- Difficulty is saved separately for each dated workout.

### Workout plan and scheduled rotations

The management panel keeps structural editing away from the workout logger. Use it to add, remove, or reorder weekday exercise slots.

Every scheduled replacement is a complete Exercise Library entry with its own type, note, and performance history. Replacements can be searched from the library or created while configuring a slot. A rotation can automatically replace an exercise from a chosen program week onward.

Example:

| Starting week | Exercise |
| --- | --- |
| Week 1 | Dumbbell chest press |
| Week 2 | Barbell chest press |
| Week 3 onward | Machine chest press |

The latest eligible exercise remains active until another replacement is scheduled. The rotation belongs only to that weekday workout slot, so changing Tuesday does not unexpectedly change Friday. Each exercise remembers its own latest weights and reps.

### Workout history

- Open the menu in the top-right corner to view dated sessions.
- Each entry shows the weekday, workout type, date, and exercise names.
- Select an entry to review or update that exact session.

### Rest timer

- Quick presets for 60 and 120 seconds.
- Custom durations from 1 to 3,600 seconds.
- Pause and restart support.
- One ordinary system notification when time expires: **Rest finished — Ready for your next set.**
- A highlighted **Rest finished** state remains visible inside the app.
- Timestamp-based counting keeps the displayed time accurate after returning from a background tab.

Enable alerts from **Manage → Completion notification**. The Enable action requests permission and immediately sends a test notification when permission is granted. Once enabled, **Test alert** can be used again whenever you want to check the phone's current sound and vibration settings.

Rep Routine leaves sound and vibration to the notification settings exposed by Android, Chrome, or the installed WebAPK. It does not play its own beeps or separately trigger vibration. If permission is blocked, allow notifications in the corresponding browser or app settings and return to Rep Routine.

This is a local notification and requires no account, server, or remote push subscription. The notification can appear only after the running timer detects completion. Android may suspend a background page, so a deeply sleeping or locked phone can still delay the alert; this is not an exact native alarm. Alerts delayed by more than five minutes are treated as stale and are not shown later.

### Backup and restore

- **Export** downloads a compact JSON backup containing the Exercise Library, weekday plans, rotations, tags, notes, and only the latest recorded sets for each exercise.
- **Import** validates a Rep Routine backup, keeps the latest performance for every exercise, and removes older dated entries before replacing browser data.
- Compact backups remain bounded by the number of exercises instead of growing with every workout day.
- Importing prepares the current weekday using the latest available performance and scheduled variation.
- On Friday, opening the app automatically downloads one timestamped compact backup for that date.
- Older Rep Routine browser data and v1–v4 backups are migrated automatically.

The compact backup is intended for recovery and progressive overload, not as a permanent day-by-day archive. Full dated history remains in the current browser until its data is cleared or replaced by an import. Browser data is device- and browser-specific, and Android may ask you to allow automatic downloads for the site.

## Running locally

No build step is required. Because the JavaScript uses native ES modules, serve the folder with any static HTTP server instead of double-clicking `index.html`.

For example, with Python installed:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploying with GitHub Pages

1. Push the repository to GitHub.
2. Open the repository's **Settings → Pages**.
3. Choose the `main` branch and repository root as the publishing source.
4. Save and wait for the Pages deployment to finish.

The application uses project-relative paths, so it works from a GitHub Pages repository subpath and requires no deployment configuration.

For each release, update the application version and shell cache in `sw.js`, the version in `js/pwa.js`, and the shared asset query in `index.html` and `js/`. Keeping these values together lets installed phones download and switch to one consistent release.

## Project structure

```text
index.html       Application structure and templates
styles.css       Mobile-first layout and visual styling
manifest.webmanifest  Install identity, display mode, theme, and icon metadata
sw.js            Offline application shell and safe update lifecycle
release.json      Generated file hashes used to verify a complete release
icons/           Standard and maskable installation icons
js/core.js       Schedule, date, formatting, and shared browser helpers
js/storage.js    Data schema, validation, migrations, import preparation, and persistence
js/workouts.js   Sessions, rotations, Exercise Library, and progressive-overload rules
js/manager.js    Workout Plan, Exercise Library, scheduled rotation, and tag management UI
js/timer.js      Rest timer, visible completion state, and notification trigger
js/pwa.js        Installation, updates, notification permission, and local alerts
js/app.js        Workout rendering, history, backups, and application startup
tools/            Developer-only release manifest generator
README.md        Feature reference and startup guide
```

## Data and privacy

Workout information remains in browser storage unless you export it. Rep Routine does not send data to a server. JSON backup files contain exercise details and latest performance values, so store them somewhere private.

Automatically reading a JSON file from the phone is not supported because browsers require user interaction and permission before accessing local files.
