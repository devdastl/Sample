const STORAGE_KEY = "rep-routine-v3";
const PREVIOUS_STORAGE_KEY = "rep-routine-v2";
const LEGACY_STORAGE_KEY = "rep-routine-v1";
const schedule = [
  { key: "monday", short: "Mon", label: "Monday", workout: "Pull" },
  { key: "tuesday", short: "Tue", label: "Tuesday", workout: "Push" },
  { key: "wednesday", short: "Wed", label: "Wednesday", workout: "Legs" },
  { key: "thursday", short: "Thu", label: "Thursday", workout: "Pull" },
  { key: "friday", short: "Fri", label: "Friday", workout: "Push" },
];
const defaultTags = {
  type: [
    { id: "type-compound", label: "Compound", builtin: true },
    { id: "type-isolation", label: "Isolation", builtin: true },
  ],
  difficulty: [
    { id: "effort-easy", label: "Easy", builtin: true },
    { id: "effort-moderate", label: "Moderate", builtin: true },
    { id: "effort-hard", label: "Hard", builtin: true },
    { id: "effort-max", label: "Max Effort", builtin: true },
  ],
};

const today = startOfDay(new Date());
const currentWeek = getWeekDates(today);
let state = loadState();
let timer = { selectedSeconds: 60, remaining: 60, intervalId: null, endsAt: null };
let toastTimeout;
let timerAudioContext;

const $ = selector => document.querySelector(selector);
const dayTabs = $("#dayTabs");
const exerciseList = $("#exerciseList");
const exerciseCount = $("#exerciseCount");
const workoutTitle = $("#workoutTitle");
const dayLabel = $("#dayLabel");
const dateLabel = $("#dateLabel");
const exerciseForm = $("#exerciseForm");
const exerciseName = $("#exerciseName");
const timerDisplay = $("#timerDisplay");
const timerToggle = $("#timerToggle");
const customTimerForm = $("#customTimerForm");
const historyDrawer = $("#historyDrawer");
const historyList = $("#historyList");
const drawerBackdrop = $("#drawerBackdrop");
const tagDialog = $("#tagDialog");

function startOfDay(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function fromDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function getWeekDates(date) {
  const monday = new Date(date);
  monday.setDate(date.getDate() + (date.getDay() === 0 ? -6 : 1 - date.getDay()));
  return schedule.map((_, index) => {
    const result = new Date(monday); result.setDate(monday.getDate() + index); return result;
  });
}
function defaultSelectedDate() {
  const day = today.getDay();
  return toDateKey(currentWeek[day >= 1 && day <= 5 ? day - 1 : 0]);
}
function makeId() { return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`; }
function copyDefaultTags() { return JSON.parse(JSON.stringify(defaultTags)); }
function emptyPlans() { return Object.fromEntries(schedule.map(day => [day.key, []])); }
function createInitialState() {
  return {
    version: 3,
    selectedDate: defaultSelectedDate(),
    programStartDate: toDateKey(currentWeek[0]),
    tags: copyDefaultTags(),
    plans: emptyPlans(),
    sessions: {},
  };
}
function dayForDate(dateKey) {
  return schedule[Math.min(Math.max(fromDateKey(dateKey).getDay() - 1, 0), 4)];
}
function makeSession(dateKey, exercises = []) {
  const day = dayForDate(dateKey);
  return { date: dateKey, dayKey: day.key, workout: day.workout, exercises };
}
function programWeek(dateKey) {
  const difference = startOfDay(fromDateKey(dateKey)) - startOfDay(fromDateKey(state.programStartDate));
  return Math.max(1, Math.floor(difference / 604800000) + 1);
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.version === 3 && saved.plans && saved.sessions) return normalizeV3(saved);
    const previous = JSON.parse(localStorage.getItem(PREVIOUS_STORAGE_KEY));
    if (previous?.sessions) { const migrated = migrateV2(previous); persistMigratedState(migrated); return migrated; }
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
    if (legacy?.workouts) { const migrated = migrateV1(legacy); persistMigratedState(migrated); return migrated; }
  } catch {}
  return createInitialState();
}

function normalizeV3(candidate) {
  const normalized = createInitialState();
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate.selectedDate || "")) normalized.selectedDate = candidate.selectedDate;
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate.programStartDate || "")) normalized.programStartDate = candidate.programStartDate;
  for (const group of ["type", "difficulty"]) {
    const custom = Array.isArray(candidate.tags?.[group]) ? candidate.tags[group] : [];
    normalized.tags[group] = uniqueTags([...defaultTags[group], ...custom.filter(tag => !tag.builtin)]);
  }
  for (const day of schedule) {
    normalized.plans[day.key] = (candidate.plans?.[day.key] || []).map(normalizePlanExercise);
  }
  for (const [key, session] of Object.entries(candidate.sessions || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Array.isArray(session?.exercises)) continue;
    normalized.sessions[key] = makeSession(key, session.exercises.map(normalizeSessionExercise));
  }
  return normalized;
}
function uniqueTags(tags) {
  const seen = new Set();
  return tags.filter(tag => tag?.id && tag?.label && !seen.has(tag.id) && seen.add(tag.id)).map(tag => ({
    id: String(tag.id), label: String(tag.label).slice(0, 20), builtin: Boolean(tag.builtin),
  }));
}
function normalizePlanExercise(exercise) {
  return {
    id: String(exercise?.id || makeId()),
    name: String(exercise?.name || "Untitled exercise").slice(0, 50),
    typeTagId: String(exercise?.typeTagId || ""),
    note: String(exercise?.note || "").slice(0, 500),
    variations: Array.isArray(exercise?.variations) ? exercise.variations.map(item => ({
      id: String(item.id || makeId()), name: String(item.name || "Variation").slice(0, 50), startWeek: Math.max(1, Number(item.startWeek) || 1),
    })) : [],
  };
}
function normalizeSessionExercise(exercise) {
  return {
    id: String(exercise?.id || makeId()),
    planExerciseId: String(exercise?.planExerciseId || ""),
    variationId: String(exercise?.variationId || "base"),
    name: String(exercise?.name || "Untitled exercise").slice(0, 50),
    typeTagId: String(exercise?.typeTagId || ""),
    difficultyTagId: String(exercise?.difficultyTagId || ""),
    note: String(exercise?.note || "").slice(0, 500),
    sets: Array.isArray(exercise?.sets) ? exercise.sets.map(set => ({
      id: String(set.id || makeId()), weight: String(set.weight ?? ""), reps: String(set.reps ?? ""),
    })) : [],
  };
}

function migrateV2(previous) {
  const migrated = createInitialState();
  if (/^\d{4}-\d{2}-\d{2}$/.test(previous.selectedDate || "")) migrated.selectedDate = previous.selectedDate;
  for (const [key, oldSession] of Object.entries(previous.sessions || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Array.isArray(oldSession?.exercises)) continue;
    migrated.sessions[key] = makeSession(key, oldSession.exercises.map(normalizeSessionExercise));
  }
  buildPlansFromSessions(migrated);
  return migrated;
}
function migrateV1(legacy) {
  const migrated = createInitialState();
  currentWeek.forEach((date, index) => {
    const exercises = legacy.workouts?.[schedule[index].key];
    if (Array.isArray(exercises) && exercises.length) {
      const key = toDateKey(date);
      migrated.sessions[key] = makeSession(key, exercises.map(normalizeSessionExercise));
    }
  });
  const selectedIndex = schedule.findIndex(day => day.key === legacy.selectedDay);
  if (selectedIndex >= 0) migrated.selectedDate = toDateKey(currentWeek[selectedIndex]);
  buildPlansFromSessions(migrated);
  return migrated;
}
function buildPlansFromSessions(target) {
  for (const day of schedule) {
    const matching = Object.values(target.sessions).filter(session => session.dayKey === day.key).sort((a, b) => b.date.localeCompare(a.date));
    const latest = matching[0];
    if (!latest) continue;
    target.plans[day.key] = latest.exercises.map(exercise => ({
      id: makeId(), name: exercise.name, typeTagId: exercise.typeTagId || "", note: exercise.note || "", variations: [],
    }));
    matching.forEach(session => session.exercises.forEach((exercise, index) => {
      const plan = target.plans[day.key][index] || target.plans[day.key].find(item => item.name.toLowerCase() === exercise.name.toLowerCase());
      if (plan) { exercise.planExerciseId = plan.id; exercise.variationId = "base"; }
    }));
  }
}
function persistMigratedState(value) { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); }
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function activeVariation(planExercise, dateKey) {
  const week = programWeek(dateKey);
  const eligible = planExercise.variations.filter(item => item.startWeek <= week).sort((a, b) => b.startWeek - a.startWeek);
  return eligible[0] || { id: "base", name: planExercise.name, startWeek: 1 };
}
function latestPerformance(dayKey, planExerciseId, variationId, beforeDate) {
  const matching = Object.values(state.sessions)
    .filter(session => session.dayKey === dayKey && session.date < beforeDate)
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const session of matching) {
    const exercise = session.exercises.find(item => item.planExerciseId === planExerciseId && item.variationId === variationId);
    if (exercise) return exercise;
  }
  return null;
}
function exerciseFromPlan(planExercise, dateKey) {
  const day = dayForDate(dateKey); const variation = activeVariation(planExercise, dateKey);
  const previous = latestPerformance(day.key, planExercise.id, variation.id, dateKey);
  return {
    id: makeId(), planExerciseId: planExercise.id, variationId: variation.id, name: variation.name,
    typeTagId: planExercise.typeTagId, difficultyTagId: "", note: planExercise.note,
    sets: previous ? previous.sets.map(set => ({ id: makeId(), weight: set.weight, reps: set.reps })) : [],
  };
}
function getSession(dateKey = state.selectedDate) {
  if (!state.sessions[dateKey]) {
    const day = dayForDate(dateKey);
    state.sessions[dateKey] = makeSession(dateKey, state.plans[day.key].map(plan => exerciseFromPlan(plan, dateKey)));
    saveState();
  }
  return state.sessions[dateKey];
}
function getPlanExercise(sessionExercise) {
  const day = dayForDate(state.selectedDate);
  return state.plans[day.key].find(item => item.id === sessionExercise.planExerciseId);
}

function render() {
  const session = getSession();
  dayTabs.replaceChildren(...schedule.map((day, index) => {
    const dateKey = toDateKey(currentWeek[index]);
    const button = document.createElement("button");
    button.type = "button"; button.className = `day-tab${dateKey === state.selectedDate ? " active" : ""}`;
    button.innerHTML = `${day.short}<span>${day.workout}</span>`;
    button.setAttribute("aria-label", `${day.label}, ${formatDate(dateKey, "short")}, ${day.workout} workout`);
    button.setAttribute("aria-pressed", String(dateKey === state.selectedDate));
    button.addEventListener("click", () => { state.selectedDate = dateKey; saveState(); render(); });
    return button;
  }));
  const selectedDate = fromDateKey(session.date);
  dayLabel.textContent = selectedDate.toLocaleDateString(undefined, { weekday: "long" });
  dateLabel.textContent = formatDate(session.date, "long"); dateLabel.dateTime = session.date;
  workoutTitle.textContent = `${session.workout} day`;
  exerciseCount.textContent = `${session.exercises.length} exercise${session.exercises.length === 1 ? "" : "s"}`;
  exerciseList.replaceChildren();
  if (!session.exercises.length) {
    const empty = document.createElement("div"); empty.className = "empty-state";
    empty.innerHTML = "<strong>No exercises yet</strong>Add your first exercise for this workout."; exerciseList.append(empty);
  } else session.exercises.forEach((exercise, index) => exerciseList.append(renderExercise(exercise, index)));
  renderHistory();
}
function formatDate(dateKey, style) {
  return fromDateKey(dateKey).toLocaleDateString(undefined, style === "long"
    ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" });
}
function tagById(group, id) { return state.tags[group].find(tag => tag.id === id); }
function fillTagSelect(select, group, selectedId) {
  select.replaceChildren(new Option(group === "type" ? "Not classified" : "Not rated", ""));
  state.tags[group].forEach(tag => select.add(new Option(tag.label, tag.id)));
  select.value = state.tags[group].some(tag => tag.id === selectedId) ? selectedId : "";
}
function updateCardMeta(card, exercise) {
  const pills = card.querySelector(".tag-pills"); pills.replaceChildren();
  const type = tagById("type", exercise.typeTagId); const difficulty = tagById("difficulty", exercise.difficultyTagId);
  for (const [tag, group] of [[type, "type"], [difficulty, "difficulty"]]) {
    if (!tag) continue;
    const pill = document.createElement("span"); pill.className = `tag-pill ${group}${tag.id.includes("hard") || tag.id.includes("max") ? " hard" : ""}`;
    pill.textContent = tag.label; pills.append(pill);
  }
  const preview = card.querySelector(".note-preview");
  preview.textContent = exercise.note ? `Note · ${exercise.note}` : ""; preview.classList.toggle("hidden", !exercise.note);
}

function renderExercise(exercise, exerciseIndex) {
  const card = $("#exerciseTemplate").content.firstElementChild.cloneNode(true);
  const planExercise = getPlanExercise(exercise);
  card.querySelector(".exercise-number").textContent = String(exerciseIndex + 1).padStart(2, "0");
  card.querySelector(".exercise-name").textContent = exercise.name; updateCardMeta(card, exercise);
  card.querySelector(".remove-exercise").addEventListener("click", () => {
    if (!confirm(`Remove ${exercise.name} from this workout plan? Past history will remain available.`)) return;
    getSession().exercises.splice(exerciseIndex, 1);
    if (planExercise) {
      const day = dayForDate(state.selectedDate); state.plans[day.key] = state.plans[day.key].filter(item => item.id !== planExercise.id);
    }
    saveState(); render();
  });
  const setsList = card.querySelector(".sets-list");
  exercise.sets.forEach((set, setIndex) => setsList.append(renderSet(exercise, set, setIndex)));
  card.querySelector(".add-set-button").addEventListener("click", () => {
    exercise.sets.push({ id: makeId(), weight: "", reps: "" }); saveState(); render();
  });

  const details = card.querySelector(".exercise-details"); const detailsToggle = card.querySelector(".details-toggle");
  detailsToggle.textContent = `Details${planExercise?.variations.length ? ` · ${planExercise.variations.length} var` : ""}`;
  detailsToggle.addEventListener("click", () => {
    const willOpen = details.classList.contains("hidden"); details.classList.toggle("hidden");
    detailsToggle.setAttribute("aria-expanded", String(willOpen)); detailsToggle.textContent = willOpen ? "Close" : `Details${planExercise?.variations.length ? ` · ${planExercise.variations.length} var` : ""}`;
  });
  const typeSelect = card.querySelector(".type-select"); const difficultySelect = card.querySelector(".difficulty-select");
  fillTagSelect(typeSelect, "type", exercise.typeTagId); fillTagSelect(difficultySelect, "difficulty", exercise.difficultyTagId);
  typeSelect.addEventListener("change", () => {
    exercise.typeTagId = typeSelect.value; if (planExercise) planExercise.typeTagId = typeSelect.value; saveState(); updateCardMeta(card, exercise);
  });
  difficultySelect.addEventListener("change", () => { exercise.difficultyTagId = difficultySelect.value; saveState(); updateCardMeta(card, exercise); });
  card.querySelector(".manage-tags-button").addEventListener("click", openTagDialog);
  const noteInput = card.querySelector(".note-input"); noteInput.value = exercise.note;
  noteInput.addEventListener("input", () => {
    exercise.note = noteInput.value; if (planExercise) planExercise.note = noteInput.value; saveState(); updateCardMeta(card, exercise);
  });
  renderVariations(card, exercise, planExercise);
  return card;
}

function renderSet(exercise, set, setIndex) {
  const row = $("#setTemplate").content.firstElementChild.cloneNode(true);
  row.querySelector(".set-number").textContent = setIndex + 1;
  const weight = row.querySelector(".weight-input"); const reps = row.querySelector(".reps-input");
  weight.value = set.weight; reps.value = set.reps;
  weight.addEventListener("input", () => { set.weight = weight.value; saveState(); });
  reps.addEventListener("input", () => { set.reps = reps.value; saveState(); });
  row.querySelector(".remove-set").addEventListener("click", () => { exercise.sets.splice(setIndex, 1); saveState(); render(); });
  return row;
}

function renderVariations(card, sessionExercise, planExercise) {
  const list = card.querySelector(".variation-list"); const form = card.querySelector(".variation-form");
  card.querySelector(".program-week").textContent = `Program week ${programWeek(state.selectedDate)} · active changes persist`;
  card.querySelector(".variation-toggle").addEventListener("click", () => {
    form.classList.toggle("hidden");
    if (!form.classList.contains("hidden")) {
      form.querySelector(".variation-week").value = programWeek(state.selectedDate) + 1; form.querySelector(".variation-name").focus();
    }
  });
  if (!planExercise) { list.textContent = "This historical exercise is no longer in the plan."; form.classList.add("hidden"); return; }
  const base = { id: "base", name: planExercise.name, startWeek: 1 };
  [base, ...planExercise.variations.sort((a, b) => a.startWeek - b.startWeek)].forEach(variation => {
    const item = document.createElement("div"); item.className = `variation-item${variation.id === sessionExercise.variationId ? " active" : ""}`;
    const name = document.createElement("span"); name.className = "variation-name-label"; name.textContent = variation.name;
    const week = document.createElement("span"); week.className = "variation-week-label"; week.textContent = `Week ${variation.startWeek}+`;
    item.append(name, week);
    if (variation.id !== "base") {
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "remove-variation"; remove.textContent = "×";
      remove.setAttribute("aria-label", `Remove ${variation.name}`);
      remove.addEventListener("click", () => {
        if (!confirm(`Remove the scheduled variation ${variation.name}?`)) return;
        planExercise.variations = planExercise.variations.filter(item => item.id !== variation.id);
        syncSelectedExerciseVariation(sessionExercise, planExercise); saveState(); render();
      }); item.append(remove);
    }
    list.append(item);
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const name = form.querySelector(".variation-name").value.trim(); const startWeek = Number(form.querySelector(".variation-week").value);
    if (!name || !Number.isInteger(startWeek) || startWeek < 1) return;
    const existing = planExercise.variations.find(item => item.startWeek === startWeek);
    if (existing && !confirm(`Week ${startWeek} already has ${existing.name}. Replace it?`)) return;
    planExercise.variations = planExercise.variations.filter(item => item.startWeek !== startWeek);
    planExercise.variations.push({ id: makeId(), name, startWeek });
    syncSelectedExerciseVariation(sessionExercise, planExercise); saveState(); render(); showToast(`${name} scheduled for week ${startWeek}`);
  });
}
function syncSelectedExerciseVariation(sessionExercise, planExercise) {
  const active = activeVariation(planExercise, state.selectedDate);
  if (active.id === sessionExercise.variationId) { sessionExercise.name = active.name; return; }
  const previous = latestPerformance(dayForDate(state.selectedDate).key, planExercise.id, active.id, state.selectedDate);
  sessionExercise.variationId = active.id; sessionExercise.name = active.name;
  sessionExercise.sets = previous ? previous.sets.map(set => ({ id: makeId(), weight: set.weight, reps: set.reps })) : [];
}

function renderHistory() {
  const sessions = Object.values(state.sessions).filter(session => session.exercises.length).sort((a, b) => b.date.localeCompare(a.date));
  historyList.replaceChildren();
  if (!sessions.length) {
    const empty = document.createElement("p"); empty.className = "history-empty"; empty.textContent = "Completed workouts will appear here."; historyList.append(empty); return;
  }
  sessions.forEach(session => {
    const button = document.createElement("button"); const weekday = fromDateKey(session.date).toLocaleDateString(undefined, { weekday: "short" });
    button.type = "button"; button.className = `history-item${session.date === state.selectedDate ? " selected" : ""}`;
    button.innerHTML = `<span class="history-item-top"><span class="history-item-title">${escapeHtml(session.workout)} · ${weekday}</span><span class="history-item-date">${formatDate(session.date, "short")}</span></span><span class="history-exercises">${escapeHtml(session.exercises.map(item => item.name).join(" · "))}</span>`;
    button.addEventListener("click", () => { state.selectedDate = session.date; saveState(); closeHistory(); render(); }); historyList.append(button);
  });
}
function escapeHtml(value) { const element = document.createElement("span"); element.textContent = value; return element.innerHTML; }
function openHistory() { historyDrawer.classList.add("open"); drawerBackdrop.classList.remove("hidden"); historyDrawer.setAttribute("aria-hidden", "false"); document.body.style.overflow = "hidden"; }
function closeHistory() { historyDrawer.classList.remove("open"); drawerBackdrop.classList.add("hidden"); historyDrawer.setAttribute("aria-hidden", "true"); document.body.style.overflow = ""; }
function showToast(message) {
  const toast = $("#toast"); toast.textContent = message; toast.classList.add("show"); clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 2400);
}

function openTagDialog() { renderTagManager(); tagDialog.showModal(); }
function renderTagManager() {
  for (const group of ["type", "difficulty"]) {
    const container = $(`#${group}TagList`); container.replaceChildren();
    state.tags[group].forEach(tag => {
      const item = document.createElement("span"); item.className = "managed-tag";
      const label = document.createElement("span"); label.textContent = tag.label; item.append(label);
      if (!tag.builtin) {
        const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "✎"; edit.setAttribute("aria-label", `Rename ${tag.label}`);
        edit.addEventListener("click", () => {
          const next = prompt("Rename tag", tag.label)?.trim();
          if (next) { tag.label = next.slice(0, 20); saveState(); renderTagManager(); }
        });
        const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×"; remove.setAttribute("aria-label", `Delete ${tag.label}`);
        remove.addEventListener("click", () => deleteTag(group, tag.id)); item.append(edit, remove);
      }
      container.append(item);
    });
  }
}
function deleteTag(group, id) {
  if (!confirm("Delete this tag and remove it from all exercises?")) return;
  state.tags[group] = state.tags[group].filter(tag => tag.id !== id);
  Object.values(state.plans).flat().forEach(exercise => { if (group === "type" && exercise.typeTagId === id) exercise.typeTagId = ""; });
  Object.values(state.sessions).flatMap(session => session.exercises).forEach(exercise => {
    if (group === "type" && exercise.typeTagId === id) exercise.typeTagId = "";
    if (group === "difficulty" && exercise.difficultyTagId === id) exercise.difficultyTagId = "";
  });
  saveState(); renderTagManager();
}

$("#showExerciseFormButton").addEventListener("click", () => { exerciseForm.classList.remove("hidden"); exerciseName.focus(); });
$("#cancelExerciseButton").addEventListener("click", () => { exerciseForm.reset(); exerciseForm.classList.add("hidden"); });
exerciseForm.addEventListener("submit", event => {
  event.preventDefault(); const name = exerciseName.value.trim(); if (!name) return;
  const day = dayForDate(state.selectedDate);
  const planExercise = { id: makeId(), name, typeTagId: "", note: "", variations: [] };
  state.plans[day.key].push(planExercise); getSession().exercises.push(exerciseFromPlan(planExercise, state.selectedDate));
  saveState(); exerciseForm.reset(); exerciseForm.classList.add("hidden"); render();
});
$("#historyButton").addEventListener("click", openHistory);
$("#closeHistoryButton").addEventListener("click", closeHistory);
drawerBackdrop.addEventListener("click", closeHistory);
$("#closeTagDialogButton").addEventListener("click", () => tagDialog.close());
tagDialog.addEventListener("close", render);
tagDialog.addEventListener("click", event => { if (event.target === tagDialog) tagDialog.close(); });
document.querySelectorAll(".tag-form").forEach(form => form.addEventListener("submit", event => {
  event.preventDefault(); const group = form.dataset.group; const input = form.querySelector("input"); const label = input.value.trim();
  if (!label) return;
  if (state.tags[group].some(tag => tag.label.toLowerCase() === label.toLowerCase())) { showToast("That tag already exists"); return; }
  state.tags[group].push({ id: `${group}-${makeId()}`, label, builtin: false }); saveState(); input.value = ""; renderTagManager();
}));
document.addEventListener("keydown", event => { if (event.key === "Escape") closeHistory(); });

$("#exportButton").addEventListener("click", () => {
  saveState(); const backup = { app: "Rep Routine", version: 3, exportedAt: new Date().toISOString(), data: state };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }); const link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = `rep-routine-backup-${toDateKey(today)}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000); showToast("Workout data exported");
});
$("#importButton").addEventListener("click", () => $("#importFile").click());
$("#importFile").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    const parsed = JSON.parse(await file.text()); const candidate = parsed.data || parsed;
    let imported;
    if (candidate?.version === 3 && candidate.plans && candidate.sessions) imported = normalizeV3(candidate);
    else if (candidate?.sessions) imported = migrateV2(candidate);
    else throw new Error("Invalid backup");
    if (!confirm("Replace the workout data in this browser with the imported backup?")) return;
    imported.selectedDate = defaultSelectedDate();
    state = imported; getSession(); saveState(); render(); showToast("Backup imported and this week is ready");
  } catch { alert("This file is not a valid Rep Routine JSON backup."); }
  finally { event.target.value = ""; }
});
$("#resetWeekButton").addEventListener("click", () => {
  if (!confirm("Clear every workout, plan, tag, and set? Export a backup first if you may need this data.")) return;
  state = createInitialState(); saveState(); closeHistory(); render(); showToast("Workout data cleared");
});

function selectTimer(seconds) {
  stopTimer(); timer.selectedSeconds = seconds; timer.remaining = seconds;
  document.querySelectorAll(".timer-preset").forEach(button => button.classList.toggle("active", Number(button.dataset.seconds) === seconds)); updateTimerDisplay();
}
function updateTimerDisplay() {
  const minutes = Math.floor(timer.remaining / 60); const seconds = timer.remaining % 60;
  timerDisplay.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  document.title = timer.intervalId ? `${timerDisplay.textContent} · Rep Routine` : "Rep Routine";
}
function startTimer() {
  prepareTimerAudio();
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
  if (timer.remaining === 0) { stopTimer(); timerToggle.textContent = "Again"; playTimerAlert(); }
}
function playTimerAlert() {
  if (navigator.vibrate) navigator.vibrate([180, 90, 180, 90, 180]);
  try {
    const audio = prepareTimerAudio();
    [0, .3, .6, .9, 1.2, 1.5].forEach(delay => {
      const oscillator = audio.createOscillator(); const gain = audio.createGain(); const start = audio.currentTime + delay;
      oscillator.frequency.value = 920; oscillator.connect(gain); gain.connect(audio.destination);
      gain.gain.setValueAtTime(.001, start); gain.gain.exponentialRampToValueAtTime(.24, start + .02); gain.gain.exponentialRampToValueAtTime(.001, start + .2);
      oscillator.start(start); oscillator.stop(start + .22);
    });
  } catch {}
}
function prepareTimerAudio() {
  if (!timerAudioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    timerAudioContext = new AudioContextClass();
  }
  if (timerAudioContext.state === "suspended") timerAudioContext.resume();
  return timerAudioContext;
}
document.querySelectorAll(".timer-preset[data-seconds]").forEach(button => button.addEventListener("click", () => selectTimer(Number(button.dataset.seconds))));
timerToggle.addEventListener("click", () => timer.intervalId ? stopTimer() : startTimer());
$("#customTimerButton").addEventListener("click", () => {
  customTimerForm.classList.toggle("hidden"); if (!customTimerForm.classList.contains("hidden")) $("#customSeconds").focus();
});
customTimerForm.addEventListener("submit", event => {
  event.preventDefault(); const seconds = Number($("#customSeconds").value);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) return;
  selectTimer(seconds); customTimerForm.reset(); customTimerForm.classList.add("hidden");
});
document.addEventListener("visibilitychange", () => { if (!document.hidden && timer.intervalId) tickTimer(); });

render(); updateTimerDisplay();
