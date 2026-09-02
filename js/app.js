import { $, currentWeek, dayForDate, defaultSelectedDate, escapeHtml, formatDate, fromDateKey, makeId, schedule, toDateKey, today } from "./core.js?v=20260903-2";
import { normalizeImportedState, replaceState, resetState, saveState, state } from "./storage.js?v=20260903-2";
import { fillTagSelect, getSession, isCurrentWeekDate, libraryExercise, tagById } from "./workouts.js?v=20260903-2";
import { initManager } from "./manager.js?v=20260903-2";
import { initTimer } from "./timer.js?v=20260903-2";

const dayTabs = $("#dayTabs"); const exerciseList = $("#exerciseList"); const exerciseCount = $("#exerciseCount");
const workoutTitle = $("#workoutTitle"); const dayLabel = $("#dayLabel"); const dateLabel = $("#dateLabel");
const historyDrawer = $("#historyDrawer"); const historyList = $("#historyList"); const historyBackdrop = $("#drawerBackdrop");
let expandedExerciseId = null; let toastTimeout; let manager;

function render() {
  const session = getSession();
  dayTabs.replaceChildren(...schedule.map((day, index) => {
    const dateKey = toDateKey(currentWeek[index]); const button = document.createElement("button"); button.type = "button";
    button.className = `day-tab${dateKey === state.selectedDate ? " active" : ""}`; button.innerHTML = `${day.short}<span>${day.workout}</span>`;
    button.setAttribute("aria-label", `${day.label}, ${formatDate(dateKey, "short")}, ${day.workout} workout`); button.setAttribute("aria-pressed", String(dateKey === state.selectedDate));
    button.addEventListener("click", () => { state.selectedDate = dateKey; expandedExerciseId = null; saveState(); render(); if (manager?.isOpen()) manager.renderManage(); }); return button;
  }));
  const selectedDate = fromDateKey(session.date); dayLabel.textContent = selectedDate.toLocaleDateString(undefined, { weekday: "long" });
  dateLabel.textContent = formatDate(session.date, "long"); dateLabel.dateTime = session.date; workoutTitle.textContent = `${session.workout} day`;
  exerciseCount.textContent = `${session.exercises.length} exercise${session.exercises.length === 1 ? "" : "s"}`; exerciseList.replaceChildren();
  if (!session.exercises.length) {
    const empty = document.createElement("div"); empty.className = "empty-state"; empty.innerHTML = "<strong>No exercises planned</strong>Use Manage workout plan to add exercises."; exerciseList.append(empty);
  } else session.exercises.forEach((exercise, index) => exerciseList.append(renderExercise(exercise, index)));
  renderHistory();
}
function updateCardMeta(card, exercise) {
  const pills = card.querySelector(".tag-pills"); pills.replaceChildren(); const type = tagById("type", exercise.typeTagId);
  if (type) { const pill = document.createElement("span"); pill.className = "tag-pill type"; pill.textContent = type.label; pills.append(pill); }
  const preview = card.querySelector(".note-preview"); preview.textContent = exercise.note ? `Note · ${exercise.note}` : ""; preview.classList.toggle("hidden", !exercise.note);
}
function renderExercise(exercise, exerciseIndex) {
  const card = $("#exerciseTemplate").content.firstElementChild.cloneNode(true); const definition = libraryExercise(exercise.libraryExerciseId);
  if (definition && isCurrentWeekDate(state.selectedDate)) { exercise.name = definition.name; exercise.typeTagId = definition.typeTagId; exercise.note = definition.note; }
  card.dataset.exerciseId = exercise.id; card.querySelector(".exercise-number").textContent = String(exerciseIndex + 1).padStart(2, "0"); card.querySelector(".exercise-name").textContent = exercise.name;
  const slot = state.plans[dayForDate(state.selectedDate).key].find(item => item.id === exercise.slotId); const replacements = Math.max(0, (slot?.schedule.length || 1) - 1); const variationCount = card.querySelector(".variation-count");
  variationCount.textContent = `${replacements} ${replacements === 1 ? "rotation" : "rotations"}`; variationCount.classList.toggle("hidden", replacements === 0); updateCardMeta(card, exercise);
  const collapseButton = card.querySelector(".exercise-collapse"); const body = card.querySelector(".exercise-body"); setCardExpanded(card, expandedExerciseId === exercise.id);
  collapseButton.addEventListener("click", () => { const open = body.classList.contains("hidden"); document.querySelectorAll(".exercise-card.open").forEach(item => setCardExpanded(item, false)); expandedExerciseId = open ? exercise.id : null; setCardExpanded(card, open); });
  const difficulty = card.querySelector(".difficulty-select"); fillTagSelect(difficulty, "difficulty", exercise.difficultyTagId); difficulty.addEventListener("change", () => { exercise.difficultyTagId = difficulty.value; saveState(); });
  const setsList = card.querySelector(".sets-list"); exercise.sets.forEach((set, index) => setsList.append(renderSet(exercise, set, index)));
  card.querySelector(".add-set-button").addEventListener("click", () => { exercise.sets.push({ id: makeId(), weight: "", reps: "" }); saveState(); render(); }); return card;
}
function setCardExpanded(card, expanded) { card.classList.toggle("open", expanded); card.querySelector(".exercise-body").classList.toggle("hidden", !expanded); card.querySelector(".exercise-collapse").setAttribute("aria-expanded", String(expanded)); }
function renderSet(exercise, set, index) {
  const row = $("#setTemplate").content.firstElementChild.cloneNode(true); row.querySelector(".set-number").textContent = index + 1;
  const weight = row.querySelector(".weight-input"); const reps = row.querySelector(".reps-input"); weight.value = set.weight; reps.value = set.reps;
  weight.addEventListener("input", () => { set.weight = weight.value; saveState(); }); reps.addEventListener("input", () => { set.reps = reps.value; saveState(); });
  row.querySelector(".remove-set").addEventListener("click", () => { exercise.sets.splice(index, 1); saveState(); render(); }); return row;
}

function renderHistory() {
  const sessions = Object.values(state.sessions).filter(session => session.exercises.length).sort((a, b) => b.date.localeCompare(a.date)); historyList.replaceChildren();
  if (!sessions.length) { const empty = document.createElement("p"); empty.className = "history-empty"; empty.textContent = "Completed workouts will appear here."; historyList.append(empty); return; }
  sessions.forEach(session => {
    const button = document.createElement("button"); const weekday = fromDateKey(session.date).toLocaleDateString(undefined, { weekday: "short" }); button.type = "button"; button.className = `history-item${session.date === state.selectedDate ? " selected" : ""}`;
    button.innerHTML = `<span class="history-item-top"><span class="history-item-title">${escapeHtml(session.workout)} · ${weekday}</span><span class="history-item-date">${formatDate(session.date, "short")}</span></span><span class="history-exercises">${escapeHtml(session.exercises.map(item => item.name).join(" · "))}</span>`;
    button.addEventListener("click", () => { state.selectedDate = session.date; expandedExerciseId = null; saveState(); closeHistory(); render(); }); historyList.append(button);
  });
}
function openHistory() {
  if (manager?.isOpen()) manager.closeManage(); historyDrawer.classList.add("open"); historyBackdrop.classList.remove("hidden");
  historyDrawer.setAttribute("aria-hidden", "false"); document.body.style.overflow = "hidden";
}
function closeHistory() { historyDrawer.classList.remove("open"); historyBackdrop.classList.add("hidden"); historyDrawer.setAttribute("aria-hidden", "true"); document.body.style.overflow = ""; }
function showToast(message) { const toast = $("#toast"); toast.textContent = message; toast.classList.add("show"); clearTimeout(toastTimeout); toastTimeout = setTimeout(() => toast.classList.remove("show"), 2400); }

$("#historyButton").addEventListener("click", openHistory); $("#closeHistoryButton").addEventListener("click", closeHistory); historyBackdrop.addEventListener("click", closeHistory);
$("#exportButton").addEventListener("click", () => {
  saveState(); const backup = { app: "Rep Routine", version: 5, exportedAt: new Date().toISOString(), data: state };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob);
  link.download = `rep-routine-backup-${toDateKey(today)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); showToast("Workout data exported");
});
$("#importButton").addEventListener("click", () => $("#importFile").click());
$("#importFile").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    const parsed = JSON.parse(await file.text()); const imported = normalizeImportedState(parsed.data || parsed);
    if (!confirm("Replace the workout data in this browser with the imported backup?")) return;
    imported.selectedDate = defaultSelectedDate(); replaceState(imported); getSession(); saveState(); render(); showToast("Backup imported and this week is ready");
  } catch { alert("This file is not a valid Rep Routine JSON backup."); } finally { event.target.value = ""; }
});
$("#resetWeekButton").addEventListener("click", () => {
  if (!confirm("Clear every workout, plan, exercise, tag, and set? Export a backup first if needed.")) return;
  resetState(); closeHistory(); render(); showToast("Workout data cleared");
});

manager = initManager({ closeHistory, renderApp: render, showToast });
initTimer();
document.addEventListener("keydown", event => { if (event.key === "Escape") { closeHistory(); if (manager.isOpen()) manager.closeManage(); } });
render();
