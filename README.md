# Rep Routine

Rep Routine is a lightweight, mobile-first workout tracker for a five-day Pull–Push–Legs–Pull–Push routine. It runs in the browser with no compilation, framework, account, or backend.

## Quick start

1. Visit the deployed GitHub Pages link, or start the local static server described below.
2. Select a weekday from Monday to Friday.
3. Open **Manage → Workout plan** to create an exercise or choose one from your Exercise Library.
4. Tap an exercise card to expand it.
5. Add sets and enter the weight and repetitions.
6. Use **1 min**, **2 min**, or **Custom** to start a rest timer.
7. Export a JSON backup after important updates.

Everything is saved automatically in the browser while you type.

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
- Record weight in kilograms and repetitions for every set.
- Save one shared note per exercise for machine settings, grip, form cues, or other reminders.
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
- Six audible beeps and a vibration pattern when time expires.
- Timestamp-based counting keeps the displayed time accurate after returning from a background tab.

Mobile browsers may suspend background pages and block sound or vibration while the phone is locked. A normal website cannot guarantee a locked-screen alarm.

### Backup and restore

- **Export** downloads all application data as a JSON file.
- **Import** validates a Rep Routine backup before replacing browser data.
- Backups contain the Exercise Library, weekday plan slots, scheduled rotations, dated history, weights, reps, tags, notes, program start date, and selected date.
- Importing prepares the current weekday using the latest available performance and scheduled variation.
- Older Rep Routine browser data and v1–v4 backups are migrated automatically.

Browser data is device- and browser-specific. Export backups periodically, especially before clearing browser data or changing phones.

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

The application uses relative asset paths and requires no deployment configuration.

When CSS or JavaScript changes, update the shared version query in `index.html` and the imports inside `js/` so mobile browsers fetch a consistent set of assets after deployment.

## Project structure

```text
index.html       Application structure and templates
styles.css       Mobile-first layout and visual styling
js/core.js       Schedule, date, formatting, and shared browser helpers
js/storage.js    Data schema, validation, migrations, import preparation, and persistence
js/workouts.js   Sessions, rotations, Exercise Library, and progressive-overload rules
js/manager.js    Workout Plan, Exercise Library, scheduled rotation, and tag management UI
js/timer.js      Rest timer, six-beep alarm, and vibration behavior
js/app.js        Workout rendering, history, backups, and application startup
README.md        Feature reference and startup guide
```

## Data and privacy

Workout information remains in browser storage unless you export it. Rep Routine does not send data to a server. JSON backup files contain your workout history, so store them somewhere private.

Automatically reading a JSON file from the phone is not supported because browsers require user interaction and permission before accessing local files.
