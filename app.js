const STORAGE_KEY = "rep-routine-v1";
const schedule = [
  { key: "monday", short: "Mon", label: "Monday", workout: "Pull" },
  { key: "tuesday", short: "Tue", label: "Tuesday", workout: "Push" },
  { key: "wednesday", short: "Wed", label: "Wednesday", workout: "Legs" },
  { key: "thursday", short: "Thu", label: "Thursday", workout: "Pull" },
  { key: "friday", short: "Fri", label: "Friday", workout: "Push" },
];

const createInitialState = () => ({
  selectedDay: getDefaultDay(),
  workouts: Object.fromEntries(schedule.map(({ key }) => [key, []])),
});

let state = loadState();
let timer = { selectedSeconds: 60, remaining: 60, intervalId: null, endsAt: null };

const dayTabs = document.querySelector("#dayTabs");
const exerciseList = document.querySelector("#exerciseList");
const exerciseCount = document.querySelector("#exerciseCount");
const workoutTitle = document.querySelector("#workoutTitle");
const dateLabel = document.querySelector("#dateLabel");
const exerciseForm = document.querySelector("#exerciseForm");
const exerciseName = document.querySelector("#exerciseName");
const timerDisplay = document.querySelector("#timerDisplay");
const timerToggle = document.querySelector("#timerToggle");
const customTimerForm = document.querySelector("#customTimerForm");

function getDefaultDay() {
  const weekdayIndex = new Date().getDay();
  return schedule[Math.min(Math.max(weekdayIndex - 1, 0), 4)].key;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved?.workouts) return createInitialState();
    const workouts = Object.fromEntries(schedule.map(({ key }) => [key, Array.isArray(saved.workouts[key]) ? saved.workouts[key] : []]));
    return { selectedDay: schedule.some(day => day.key === saved.selectedDay) ? saved.selectedDay : getDefaultDay(), workouts };
  } catch {
    return createInitialState();
  }
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function makeId() { return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`; }

function render() {
  const selected = schedule.find(day => day.key === state.selectedDay);
  dayTabs.replaceChildren(...schedule.map(day => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `day-tab${day.key === state.selectedDay ? " active" : ""}`;
    button.innerHTML = `${day.short}<span>${day.workout}</span>`;
    button.setAttribute("aria-pressed", String(day.key === state.selectedDay));
    button.addEventListener("click", () => { state.selectedDay = day.key; saveState(); render(); });
    return button;
  }));

  workoutTitle.textContent = `${selected.workout} day`;
  dateLabel.textContent = selected.label;
  const exercises = state.workouts[state.selectedDay];
  exerciseCount.textContent = `${exercises.length} exercise${exercises.length === 1 ? "" : "s"}`;
  exerciseList.replaceChildren();

  if (!exercises.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<strong>No exercises yet</strong>Add your first exercise for this workout.";
    exerciseList.append(empty);
    return;
  }
  exercises.forEach((exercise, index) => exerciseList.append(renderExercise(exercise, index)));
}

function renderExercise(exercise, exerciseIndex) {
  const card = document.querySelector("#exerciseTemplate").content.firstElementChild.cloneNode(true);
  card.querySelector(".exercise-number").textContent = String(exerciseIndex + 1).padStart(2, "0");
  card.querySelector(".exercise-name").textContent = exercise.name;
  card.querySelector(".remove-exercise").addEventListener("click", () => {
    if (!confirm(`Remove ${exercise.name} and all of its sets?`)) return;
    state.workouts[state.selectedDay].splice(exerciseIndex, 1);
    saveState(); render();
  });

  const setsList = card.querySelector(".sets-list");
  exercise.sets.forEach((set, setIndex) => setsList.append(renderSet(exercise, set, setIndex)));
  card.querySelector(".add-set-button").addEventListener("click", () => {
    exercise.sets.push({ id: makeId(), weight: "", reps: "" });
    saveState(); render();
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  return card;
}

function renderSet(exercise, set, setIndex) {
  const row = document.querySelector("#setTemplate").content.firstElementChild.cloneNode(true);
  row.querySelector(".set-number").textContent = setIndex + 1;
  const weight = row.querySelector(".weight-input");
  const reps = row.querySelector(".reps-input");
  weight.value = set.weight;
  reps.value = set.reps;
  weight.addEventListener("change", () => { set.weight = weight.value; saveState(); });
  reps.addEventListener("change", () => { set.reps = reps.value; saveState(); });
  row.querySelector(".remove-set").addEventListener("click", () => {
    exercise.sets.splice(setIndex, 1); saveState(); render();
  });
  return row;
}

document.querySelector("#showExerciseFormButton").addEventListener("click", () => {
  exerciseForm.classList.remove("hidden");
  exerciseName.focus();
});
document.querySelector("#cancelExerciseButton").addEventListener("click", () => {
  exerciseForm.reset(); exerciseForm.classList.add("hidden");
});
exerciseForm.addEventListener("submit", event => {
  event.preventDefault();
  const name = exerciseName.value.trim();
  if (!name) return;
  state.workouts[state.selectedDay].push({ id: makeId(), name, sets: [] });
  saveState(); exerciseForm.reset(); exerciseForm.classList.add("hidden"); render();
});

document.querySelector("#resetWeekButton").addEventListener("click", () => {
  if (!confirm("Reset every exercise and set for the week? This cannot be undone.")) return;
  state = createInitialState(); saveState(); render();
});

function selectTimer(seconds) {
  stopTimer();
  timer.selectedSeconds = seconds;
  timer.remaining = seconds;
  document.querySelectorAll(".timer-preset").forEach(button => button.classList.toggle("active", Number(button.dataset.seconds) === seconds));
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const minutes = Math.floor(timer.remaining / 60);
  const seconds = timer.remaining % 60;
  timerDisplay.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  document.title = timer.intervalId ? `${timerDisplay.textContent} · Rep Routine` : "Rep Routine";
}

function startTimer() {
  if (timer.remaining <= 0) timer.remaining = timer.selectedSeconds;
  timer.endsAt = Date.now() + timer.remaining * 1000;
  timer.intervalId = window.setInterval(tickTimer, 250);
  timerToggle.textContent = "Pause";
  timerToggle.classList.add("running");
  tickTimer();
}

function stopTimer() {
  window.clearInterval(timer.intervalId);
  timer.intervalId = null;
  timer.endsAt = null;
  timerToggle.textContent = "Start";
  timerToggle.classList.remove("running");
}

function tickTimer() {
  timer.remaining = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
  updateTimerDisplay();
  if (timer.remaining === 0) {
    stopTimer();
    timerToggle.textContent = "Again";
    if (navigator.vibrate) navigator.vibrate([180, 100, 180]);
    playTimerTone();
  }
}

function playTimerTone() {
  try {
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = 740;
    gain.gain.setValueAtTime(0.15, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.45);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.45);
  } catch {}
}

document.querySelectorAll(".timer-preset[data-seconds]").forEach(button => button.addEventListener("click", () => selectTimer(Number(button.dataset.seconds))));
timerToggle.addEventListener("click", () => timer.intervalId ? stopTimer() : startTimer());
document.querySelector("#customTimerButton").addEventListener("click", () => {
  customTimerForm.classList.toggle("hidden");
  if (!customTimerForm.classList.contains("hidden")) document.querySelector("#customSeconds").focus();
});
customTimerForm.addEventListener("submit", event => {
  event.preventDefault();
  const seconds = Number(document.querySelector("#customSeconds").value);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) return;
  selectTimer(seconds);
  customTimerForm.reset(); customTimerForm.classList.add("hidden");
});

document.addEventListener("visibilitychange", () => { if (!document.hidden && timer.intervalId) tickTimer(); });
render();
updateTimerDisplay();
