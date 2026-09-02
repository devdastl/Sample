const STORAGE_KEY = "rep-routine-v2";
const LEGACY_STORAGE_KEY = "rep-routine-v1";
const schedule = [
  { key: "monday", short: "Mon", label: "Monday", workout: "Pull" },
  { key: "tuesday", short: "Tue", label: "Tuesday", workout: "Push" },
  { key: "wednesday", short: "Wed", label: "Wednesday", workout: "Legs" },
  { key: "thursday", short: "Thu", label: "Thursday", workout: "Pull" },
  { key: "friday", short: "Fri", label: "Friday", workout: "Push" },
];

const today = startOfDay(new Date());
const currentWeek = getWeekDates(today);
let state = loadState();
let timer = { selectedSeconds: 60, remaining: 60, intervalId: null, endsAt: null };
let toastTimeout;

const dayTabs = document.querySelector("#dayTabs");
const exerciseList = document.querySelector("#exerciseList");
const exerciseCount = document.querySelector("#exerciseCount");
const workoutTitle = document.querySelector("#workoutTitle");
const dayLabel = document.querySelector("#dayLabel");
const dateLabel = document.querySelector("#dateLabel");
const exerciseForm = document.querySelector("#exerciseForm");
const exerciseName = document.querySelector("#exerciseName");
const timerDisplay = document.querySelector("#timerDisplay");
const timerToggle = document.querySelector("#timerToggle");
const customTimerForm = document.querySelector("#customTimerForm");
const historyDrawer = document.querySelector("#historyDrawer");
const historyList = document.querySelector("#historyList");
const drawerBackdrop = document.querySelector("#drawerBackdrop");

function startOfDay(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function fromDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function getWeekDates(date) {
  const monday = new Date(date);
  const offset = date.getDay() === 0 ? -6 : 1 - date.getDay();
  monday.setDate(date.getDate() + offset);
  return schedule.map((_, index) => {
    const result = new Date(monday);
    result.setDate(monday.getDate() + index);
    return result;
  });
}
function defaultSelectedDate() {
  const day = today.getDay();
  return toDateKey(currentWeek[day >= 1 && day <= 5 ? day - 1 : 0]);
}
function makeSession(dateKey, exercises = []) {
  const date = fromDateKey(dateKey);
  const scheduleItem = schedule[Math.min(Math.max(date.getDay() - 1, 0), 4)];
  return { date: dateKey, dayKey: scheduleItem.key, workout: scheduleItem.workout, exercises };
}
function createInitialState() { return { selectedDate: defaultSelectedDate(), sessions: {} }; }

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.sessions && typeof saved.sessions === "object") return normalizeState(saved);

    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
    if (legacy?.workouts) {
      const migrated = createInitialState();
      currentWeek.forEach((date, index) => {
        const exercises = legacy.workouts[schedule[index].key];
        if (Array.isArray(exercises) && exercises.length) {
          const key = toDateKey(date);
          migrated.sessions[key] = makeSession(key, exercises);
        }
      });
      const legacyIndex = schedule.findIndex(day => day.key === legacy.selectedDay);
      if (legacyIndex >= 0) migrated.selectedDate = toDateKey(currentWeek[legacyIndex]);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch {}
  return createInitialState();
}

function normalizeState(candidate) {
  const normalized = createInitialState();
  for (const [key, session] of Object.entries(candidate.sessions || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Array.isArray(session?.exercises)) continue;
    normalized.sessions[key] = makeSession(key, session.exercises.map(exercise => ({
      id: String(exercise.id || makeId()),
      name: String(exercise.name || "Untitled exercise").slice(0, 50),
      sets: Array.isArray(exercise.sets) ? exercise.sets.map(set => ({
        id: String(set.id || makeId()), weight: String(set.weight ?? ""), reps: String(set.reps ?? ""),
      })) : [],
    })));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate.selectedDate || "")) normalized.selectedDate = candidate.selectedDate;
  return normalized;
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function makeId() { return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`; }
function getSession(dateKey = state.selectedDate) {
  if (!state.sessions[dateKey]) state.sessions[dateKey] = makeSession(dateKey);
  return state.sessions[dateKey];
}

function render() {
  const session = getSession();
  dayTabs.replaceChildren(...schedule.map((day, index) => {
    const dateKey = toDateKey(currentWeek[index]);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `day-tab${dateKey === state.selectedDate ? " active" : ""}`;
    button.innerHTML = `${day.short}<span>${day.workout}</span>`;
    button.setAttribute("aria-label", `${day.label}, ${formatDate(dateKey, "short")}, ${day.workout} workout`);
    button.setAttribute("aria-pressed", String(dateKey === state.selectedDate));
    button.addEventListener("click", () => { state.selectedDate = dateKey; saveState(); render(); });
    return button;
  }));

  const selectedDate = fromDateKey(session.date);
  dayLabel.textContent = selectedDate.toLocaleDateString(undefined, { weekday: "long" });
  dateLabel.textContent = formatDate(session.date, "long");
  dateLabel.dateTime = session.date;
  workoutTitle.textContent = `${session.workout} day`;
  exerciseCount.textContent = `${session.exercises.length} exercise${session.exercises.length === 1 ? "" : "s"}`;
  exerciseList.replaceChildren();

  if (!session.exercises.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<strong>No exercises yet</strong>Add your first exercise for this workout.";
    exerciseList.append(empty);
  } else {
    session.exercises.forEach((exercise, index) => exerciseList.append(renderExercise(exercise, index)));
  }
  renderHistory();
}

function formatDate(dateKey, style) {
  return fromDateKey(dateKey).toLocaleDateString(undefined, style === "long"
    ? { day: "numeric", month: "short", year: "numeric" }
    : { day: "numeric", month: "short" });
}

function renderExercise(exercise, exerciseIndex) {
  const card = document.querySelector("#exerciseTemplate").content.firstElementChild.cloneNode(true);
  card.querySelector(".exercise-number").textContent = String(exerciseIndex + 1).padStart(2, "0");
  card.querySelector(".exercise-name").textContent = exercise.name;
  card.querySelector(".remove-exercise").addEventListener("click", () => {
    if (!confirm(`Remove ${exercise.name} and all of its sets?`)) return;
    getSession().exercises.splice(exerciseIndex, 1); saveState(); render();
  });
  const setsList = card.querySelector(".sets-list");
  exercise.sets.forEach((set, setIndex) => setsList.append(renderSet(exercise, set, setIndex)));
  card.querySelector(".add-set-button").addEventListener("click", () => {
    exercise.sets.push({ id: makeId(), weight: "", reps: "" }); saveState(); render();
  });
  return card;
}

function renderSet(exercise, set, setIndex) {
  const row = document.querySelector("#setTemplate").content.firstElementChild.cloneNode(true);
  row.querySelector(".set-number").textContent = setIndex + 1;
  const weight = row.querySelector(".weight-input");
  const reps = row.querySelector(".reps-input");
  weight.value = set.weight; reps.value = set.reps;
  weight.addEventListener("input", () => { set.weight = weight.value; saveState(); });
  reps.addEventListener("input", () => { set.reps = reps.value; saveState(); });
  row.querySelector(".remove-set").addEventListener("click", () => {
    exercise.sets.splice(setIndex, 1); saveState(); render();
  });
  return row;
}

function renderHistory() {
  const sessions = Object.values(state.sessions)
    .filter(session => session.exercises.length)
    .sort((a, b) => b.date.localeCompare(a.date));
  historyList.replaceChildren();
  if (!sessions.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty"; empty.textContent = "Completed workouts will appear here.";
    historyList.append(empty); return;
  }
  sessions.forEach(session => {
    const button = document.createElement("button");
    const weekday = fromDateKey(session.date).toLocaleDateString(undefined, { weekday: "short" });
    button.type = "button";
    button.className = `history-item${session.date === state.selectedDate ? " selected" : ""}`;
    button.innerHTML = `<span class="history-item-top"><span class="history-item-title">${escapeHtml(session.workout)} · ${weekday}</span><span class="history-item-date">${formatDate(session.date, "short")}</span></span><span class="history-exercises">${escapeHtml(session.exercises.map(item => item.name).join(" · "))}</span>`;
    button.addEventListener("click", () => { state.selectedDate = session.date; saveState(); closeHistory(); render(); });
    historyList.append(button);
  });
}

function escapeHtml(value) {
  const element = document.createElement("span"); element.textContent = value; return element.innerHTML;
}
function openHistory() {
  historyDrawer.classList.add("open"); drawerBackdrop.classList.remove("hidden");
  historyDrawer.setAttribute("aria-hidden", "false"); document.body.style.overflow = "hidden";
}
function closeHistory() {
  historyDrawer.classList.remove("open"); drawerBackdrop.classList.add("hidden");
  historyDrawer.setAttribute("aria-hidden", "true"); document.body.style.overflow = "";
}
function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message; toast.classList.add("show"); clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 2400);
}

document.querySelector("#showExerciseFormButton").addEventListener("click", () => { exerciseForm.classList.remove("hidden"); exerciseName.focus(); });
document.querySelector("#cancelExerciseButton").addEventListener("click", () => { exerciseForm.reset(); exerciseForm.classList.add("hidden"); });
exerciseForm.addEventListener("submit", event => {
  event.preventDefault(); const name = exerciseName.value.trim(); if (!name) return;
  getSession().exercises.push({ id: makeId(), name, sets: [] });
  saveState(); exerciseForm.reset(); exerciseForm.classList.add("hidden"); render();
});

document.querySelector("#historyButton").addEventListener("click", openHistory);
document.querySelector("#closeHistoryButton").addEventListener("click", closeHistory);
drawerBackdrop.addEventListener("click", closeHistory);
document.addEventListener("keydown", event => { if (event.key === "Escape") closeHistory(); });

document.querySelector("#exportButton").addEventListener("click", () => {
  saveState();
  const backup = { app: "Rep Routine", version: 2, exportedAt: new Date().toISOString(), data: state };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = `rep-routine-backup-${toDateKey(today)}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000); showToast("Workout data exported");
});
document.querySelector("#importButton").addEventListener("click", () => document.querySelector("#importFile").click());
document.querySelector("#importFile").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const candidate = parsed.data || parsed;
    if (!candidate?.sessions || typeof candidate.sessions !== "object") throw new Error("Invalid backup");
    const imported = normalizeState(candidate);
    if (!confirm("Replace the workout data in this browser with the imported backup?")) return;
    state = imported; saveState(); render(); showToast("Backup imported successfully");
  } catch { alert("This file is not a valid Rep Routine JSON backup."); }
  finally { event.target.value = ""; }
});

document.querySelector("#resetWeekButton").addEventListener("click", () => {
  if (!confirm("Clear every dated workout and set? Export a backup first if you may need this data.")) return;
  state = createInitialState(); saveState(); closeHistory(); render(); showToast("Workout data cleared");
});

function selectTimer(seconds) {
  stopTimer(); timer.selectedSeconds = seconds; timer.remaining = seconds;
  document.querySelectorAll(".timer-preset").forEach(button => button.classList.toggle("active", Number(button.dataset.seconds) === seconds));
  updateTimerDisplay();
}
function updateTimerDisplay() {
  const minutes = Math.floor(timer.remaining / 60); const seconds = timer.remaining % 60;
  timerDisplay.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  document.title = timer.intervalId ? `${timerDisplay.textContent} · Rep Routine` : "Rep Routine";
}
function startTimer() {
  if (timer.remaining <= 0) timer.remaining = timer.selectedSeconds;
  timer.endsAt = Date.now() + timer.remaining * 1000; timer.intervalId = window.setInterval(tickTimer, 250);
  timerToggle.textContent = "Pause"; timerToggle.classList.add("running"); tickTimer();
}
function stopTimer() {
  window.clearInterval(timer.intervalId); timer.intervalId = null; timer.endsAt = null;
  timerToggle.textContent = "Start"; timerToggle.classList.remove("running");
}
function tickTimer() {
  timer.remaining = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000)); updateTimerDisplay();
  if (timer.remaining === 0) {
    stopTimer(); timerToggle.textContent = "Again";
    if (navigator.vibrate) navigator.vibrate([180, 100, 180]);
    try {
      const audio = new AudioContext();
      [0, .32, .64].forEach(delay => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const start = audio.currentTime + delay;
        oscillator.frequency.value = 880;
        oscillator.connect(gain); gain.connect(audio.destination);
        gain.gain.setValueAtTime(.001, start);
        gain.gain.exponentialRampToValueAtTime(.16, start + .02);
        gain.gain.exponentialRampToValueAtTime(.001, start + .18);
        oscillator.start(start); oscillator.stop(start + .2);
      });
    } catch {}
  }
}

document.querySelectorAll(".timer-preset[data-seconds]").forEach(button => button.addEventListener("click", () => selectTimer(Number(button.dataset.seconds))));
timerToggle.addEventListener("click", () => timer.intervalId ? stopTimer() : startTimer());
document.querySelector("#customTimerButton").addEventListener("click", () => {
  customTimerForm.classList.toggle("hidden");
  if (!customTimerForm.classList.contains("hidden")) document.querySelector("#customSeconds").focus();
});
customTimerForm.addEventListener("submit", event => {
  event.preventDefault(); const seconds = Number(document.querySelector("#customSeconds").value);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) return;
  selectTimer(seconds); customTimerForm.reset(); customTimerForm.classList.add("hidden");
});
document.addEventListener("visibilitychange", () => { if (!document.hidden && timer.intervalId) tickTimer(); });

render(); updateTimerDisplay();
