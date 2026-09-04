import { $, currentWeek, dayForDate, defaultSelectedDate, escapeHtml, formatDate, fromDateKey, makeId, schedule, toDateKey } from "./core.js?v=20260904-6";
import { compactLatestState, normalizeImportedState, replaceState, resetState, saveState, state } from "./storage.js?v=20260904-6";
import { fillTagSelect, getSession, isCurrentWeekDate, libraryExercise, syncSelectedSessionToPlan, tagById, updateExerciseNote } from "./workouts.js?v=20260904-6";
import { initManager } from "./manager.js?v=20260904-6";
import { initTimer } from "./timer.js?v=20260904-6";
import { initPwa } from "./pwa.js?v=20260904-6";

const dayTabs = $("#dayTabs"); const exerciseList = $("#exerciseList"); const exerciseCount = $("#exerciseCount");
const workoutTitle = $("#workoutTitle"); const dayLabel = $("#dayLabel"); const dateLabel = $("#dateLabel");
const historyDrawer = $("#historyDrawer"); const historyList = $("#historyList"); const historyBackdrop = $("#drawerBackdrop");
let expandedExerciseId = null; let toastTimeout; let manager;
const AUTO_BACKUP_KEY = "rep-routine-last-friday-backup";
const weightValues = ["", ...Array.from({ length: 201 }, (_, index) => String(index / 2))];
const repValues = ["", ...Array.from({ length: 30 }, (_, index) => String(index + 1))];
let editingSet = null; let pickerReturnFocus = null;
let editingNoteExercise = null; let noteReturnFocus = null;

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
  const hasNote = Boolean(exercise.note?.trim()); const preview = card.querySelector(".note-preview"); preview.textContent = hasNote ? `Note · ${exercise.note}` : ""; preview.classList.toggle("hidden", !hasNote);
  const noteButton = card.querySelector(".exercise-note-button"); noteButton.classList.toggle("has-note", hasNote);
  noteButton.setAttribute("aria-label", `${hasNote ? "Edit" : "Add"} note for ${exercise.name}`); noteButton.title = hasNote ? "Edit note" : "Add note";
}
function renderExercise(exercise, exerciseIndex) {
  const card = $("#exerciseTemplate").content.firstElementChild.cloneNode(true); const definition = libraryExercise(exercise.libraryExerciseId);
  if (definition && isCurrentWeekDate(state.selectedDate)) { exercise.name = definition.name; exercise.typeTagId = definition.typeTagId; exercise.note = definition.note; }
  card.dataset.exerciseId = exercise.id; card.querySelector(".exercise-number").textContent = String(exerciseIndex + 1).padStart(2, "0"); card.querySelector(".exercise-name").textContent = exercise.name;
  const slot = state.plans[dayForDate(state.selectedDate).key].find(item => item.id === exercise.slotId); const replacements = Math.max(0, (slot?.schedule.length || 1) - 1); const variationCount = card.querySelector(".variation-count");
  variationCount.textContent = `${replacements} ${replacements === 1 ? "rotation" : "rotations"}`; variationCount.classList.toggle("hidden", replacements === 0); updateCardMeta(card, exercise);
  const noteButton = card.querySelector(".exercise-note-button"); noteButton.addEventListener("click", () => openNoteEditor(exercise, noteButton));
  const collapseButton = card.querySelector(".exercise-collapse"); const body = card.querySelector(".exercise-body"); setCardExpanded(card, expandedExerciseId === exercise.id);
  collapseButton.addEventListener("click", () => { const open = body.classList.contains("hidden"); document.querySelectorAll(".exercise-card.open").forEach(item => setCardExpanded(item, false)); expandedExerciseId = open ? exercise.id : null; setCardExpanded(card, open); });
  const difficulty = card.querySelector(".difficulty-select"); fillTagSelect(difficulty, "difficulty", exercise.difficultyTagId); difficulty.addEventListener("change", () => { exercise.difficultyTagId = difficulty.value; saveState(); });
  const setsList = card.querySelector(".sets-list"); exercise.sets.forEach((set, index) => setsList.append(renderSet(exercise, set, index)));
  card.querySelector(".add-set-button").addEventListener("click", () => { exercise.sets.push({ id: makeId(), weight: "", reps: "" }); saveState(); render(); }); return card;
}
function setCardExpanded(card, expanded) { card.classList.toggle("open", expanded); card.querySelector(".exercise-body").classList.toggle("hidden", !expanded); card.querySelector(".exercise-collapse").setAttribute("aria-expanded", String(expanded)); }
function renderSet(exercise, set, index) {
  const row = $("#setTemplate").content.firstElementChild.cloneNode(true); row.querySelector(".set-number").textContent = String(index + 1).padStart(2, "0");
  const weight = String(set.weight ?? ""); const reps = String(set.reps ?? ""); const summary = row.querySelector(".set-summary-button");
  row.querySelector(".weight-value").textContent = weight || "—"; row.querySelector(".reps-value").textContent = reps || "—";
  row.querySelector(".weight-metric").classList.toggle("is-empty", weight === ""); row.querySelector(".reps-metric").classList.toggle("is-empty", reps === "");
  row.classList.toggle("is-empty", weight === "" && reps === "");
  summary.setAttribute("aria-label", `Edit ${exercise.name}, set ${index + 1}: ${weight === "" ? "weight not set" : `${weight} kilograms`}, ${reps === "" ? "repetitions not set" : `${reps} repetitions`}`);
  summary.addEventListener("click", () => openSetPicker(set, summary));
  const remove = row.querySelector(".remove-set"); remove.setAttribute("aria-label", `Remove set ${index + 1} of ${exercise.name}`);
  remove.addEventListener("click", () => { exercise.sets.splice(index, 1); saveState(); render(); }); return row;
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

function openNoteEditor(exercise, returnFocus) {
  editingNoteExercise = exercise; noteReturnFocus = returnFocus;
  $("#noteDialogTitle").textContent = exercise.name;
  $("#noteDialogScope").textContent = libraryExercise(exercise.libraryExerciseId) && isCurrentWeekDate(state.selectedDate) ? "Shared exercise note" : "Note for this workout";
  const input = $("#exerciseNoteInput"); input.value = exercise.note || "";
  $("#noteSaveStatus").textContent = "Autosaves as you type";
  $("#noteDialog").showModal(); input.focus(); input.setSelectionRange(input.value.length, input.value.length);
}
function saveNoteInput() {
  if (!editingNoteExercise) return;
  try {
    updateExerciseNote(editingNoteExercise, $("#exerciseNoteInput").value);
    const exercises = getSession().exercises;
    exerciseList.querySelectorAll(".exercise-card").forEach(card => {
      const exercise = exercises.find(item => item.id === card.dataset.exerciseId); if (exercise) updateCardMeta(card, exercise);
    });
    $("#noteSaveStatus").textContent = "Saved";
  } catch {
    $("#noteSaveStatus").textContent = "Not saved. Copy your note before closing.";
  }
}

function buildWheel(wheel, values) {
  wheel._values = values; wheel._scrollTimeout = null;
  wheel.replaceChildren(...values.map((value, index) => {
    const option = document.createElement("button"); option.type = "button"; option.className = "wheel-option"; option.dataset.index = index;
    option.textContent = value || "—"; option.tabIndex = -1; option.setAttribute("role", "option"); option.setAttribute("aria-selected", "false"); return option;
  }));
  wheel.addEventListener("scroll", () => {
    clearTimeout(wheel._scrollTimeout); wheel._scrollTimeout = setTimeout(() => selectWheelIndex(wheel, Math.round(wheel.scrollTop / 44)), 60);
  });
  wheel.addEventListener("click", event => { const option = event.target.closest(".wheel-option"); if (option) selectWheelIndex(wheel, Number(option.dataset.index), "smooth"); });
  wheel.addEventListener("keydown", event => {
    if (!["ArrowUp", "ArrowDown"].includes(event.key)) return; event.preventDefault();
    selectWheelIndex(wheel, Number(wheel.dataset.index || 0) + (event.key === "ArrowDown" ? 1 : -1), "smooth");
  });
}
function selectWheelIndex(wheel, requestedIndex, behavior = "auto") {
  const index = Math.min(Math.max(requestedIndex, 0), wheel._values.length - 1); wheel.dataset.index = index; wheel.dataset.value = wheel._values[index];
  wheel.querySelectorAll(".wheel-option").forEach((option, optionIndex) => { const selected = optionIndex === index; option.classList.toggle("selected", selected); option.setAttribute("aria-selected", String(selected)); });
  wheel.scrollTo({ top: index * 44, behavior });
}
function setWheelValue(wheel, value) {
  let index = wheel._values.indexOf(String(value ?? ""));
  if (index < 0) { const number = Number(value); index = Number.isFinite(number) ? wheel._values.reduce((best, item, itemIndex) => Math.abs(Number(item) - number) < Math.abs(Number(wheel._values[best]) - number) ? itemIndex : best, 1) : 0; }
  selectWheelIndex(wheel, index);
}
function openSetPicker(set, returnFocus) {
  editingSet = set; pickerReturnFocus = returnFocus; const dialog = $("#setPickerDialog"); dialog.showModal();
  requestAnimationFrame(() => { setWheelValue($("#weightWheel"), set.weight); setWheelValue($("#repsWheel"), set.reps); });
}
function backupTimestamp(date) {
  return `${toDateKey(date)}-${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;
}
function downloadBackup(automatic = false) {
  saveState(); const now = new Date(); const data = compactLatestState(state);
  const backup = { app: "Rep Routine", version: 5, exportedAt: now.toISOString(), historyMode: "latest-per-exercise", data };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob);
  link.download = `rep-routine-${automatic ? "friday-" : ""}backup-${backupTimestamp(now)}.json`; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000); showToast(automatic ? "Friday backup downloaded" : "Latest workout data exported");
}
function checkFridayAutoBackup() {
  const now = new Date(); const dateKey = toDateKey(now); if (now.getDay() !== 5 || localStorage.getItem(AUTO_BACKUP_KEY) === dateKey) return;
  downloadBackup(true); localStorage.setItem(AUTO_BACKUP_KEY, dateKey);
}

$("#historyButton").addEventListener("click", openHistory); $("#closeHistoryButton").addEventListener("click", closeHistory); historyBackdrop.addEventListener("click", closeHistory);
$("#exportButton").addEventListener("click", () => downloadBackup());
$("#importButton").addEventListener("click", () => $("#importFile").click());
$("#importFile").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    const parsed = JSON.parse(await file.text()); const imported = normalizeImportedState(parsed.data || parsed);
    if (!confirm("Replace the workout data in this browser? Only the latest performance for each exercise will be retained; dated history will not be fully restored.")) return;
    imported.selectedDate = defaultSelectedDate(); replaceState(imported); getSession(); syncSelectedSessionToPlan(); saveState(); render(); showToast("Latest exercise data imported");
  } catch { alert("This file is not a valid Rep Routine JSON backup."); } finally { event.target.value = ""; }
});
$("#resetWeekButton").addEventListener("click", () => {
  if (!confirm("Clear every workout, plan, exercise, tag, and set? Export a backup first if needed.")) return;
  resetState(); closeHistory(); render(); showToast("Workout data cleared");
});

manager = initManager({ closeHistory, renderApp: render, showToast });
const timer = initTimer();
initPwa({
  canApplyUpdate: () => {
    try { saveState(); } catch { return "Workout changes could not be saved. Export a backup before updating."; }
    if (timer.isActive()) return "Pause or finish the rest timer before updating.";
    if (manager.isOpen() || historyDrawer.classList.contains("open") || document.querySelector("dialog[open]") || !$("#customTimerForm").classList.contains("hidden")) {
      return "Close open editors and panels before updating.";
    }
    return "";
  },
});
buildWheel($("#weightWheel"), weightValues); buildWheel($("#repsWheel"), repValues);
$("#closeSetPickerButton").addEventListener("click", () => $("#setPickerDialog").close());
$("#setPickerDoneButton").addEventListener("click", () => {
  if (!editingSet) return; editingSet.weight = $("#weightWheel").dataset.value; editingSet.reps = $("#repsWheel").dataset.value; saveState(); $("#setPickerDialog").close(); render();
});
$("#setPickerDialog").addEventListener("close", () => { editingSet = null; pickerReturnFocus?.focus(); pickerReturnFocus = null; });
$("#exerciseNoteInput").addEventListener("input", saveNoteInput);
$("#closeNoteDialogButton").addEventListener("click", () => $("#noteDialog").close());
$("#doneNoteButton").addEventListener("click", () => $("#noteDialog").close());
$("#noteDialog").addEventListener("close", () => { editingNoteExercise = null; if (noteReturnFocus?.isConnected) noteReturnFocus.focus(); noteReturnFocus = null; });
document.addEventListener("keydown", event => { if (event.key === "Escape") { closeHistory(); if (manager.isOpen()) manager.closeManage(); } });
render();
setTimeout(checkFridayAutoBackup, 700);
