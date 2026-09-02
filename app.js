const STORAGE_KEY = "rep-routine-v5";
const V4_STORAGE_KEY = "rep-routine-v4";
const V3_STORAGE_KEY = "rep-routine-v3";
const V2_STORAGE_KEY = "rep-routine-v2";
const V1_STORAGE_KEY = "rep-routine-v1";
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
let expandedExerciseId = null;
let activeManageView = "plan";

const $ = selector => document.querySelector(selector);
const dayTabs = $("#dayTabs");
const exerciseList = $("#exerciseList");
const exerciseCount = $("#exerciseCount");
const workoutTitle = $("#workoutTitle");
const dayLabel = $("#dayLabel");
const dateLabel = $("#dateLabel");
const timerDisplay = $("#timerDisplay");
const timerToggle = $("#timerToggle");
const customTimerForm = $("#customTimerForm");
const historyDrawer = $("#historyDrawer");
const historyList = $("#historyList");
const drawerBackdrop = $("#drawerBackdrop");
const manageDrawer = $("#manageDrawer");
const manageBackdrop = $("#manageBackdrop");
const tagDialog = $("#tagDialog");

function startOfDay(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function toDateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function fromDateKey(key) { const [year, month, day] = key.split("-").map(Number); return new Date(year, month - 1, day); }
function getWeekDates(date) {
  const monday = new Date(date); monday.setDate(date.getDate() + (date.getDay() === 0 ? -6 : 1 - date.getDay()));
  return schedule.map((_, index) => { const result = new Date(monday); result.setDate(monday.getDate() + index); return result; });
}
function defaultSelectedDate() {
  const day = today.getDay(); return toDateKey(currentWeek[day >= 1 && day <= 5 ? day - 1 : 0]);
}
function makeId() { return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`; }
function normalizeName(name) { return String(name || "").trim().toLocaleLowerCase().replace(/\s+/g, " "); }
function copyDefaultTags() { return JSON.parse(JSON.stringify(defaultTags)); }
function emptyPlans() { return Object.fromEntries(schedule.map(day => [day.key, []])); }
function createInitialState() {
  return { version: 5, selectedDate: defaultSelectedDate(), programStartDate: toDateKey(currentWeek[0]), tags: copyDefaultTags(), library: [], plans: emptyPlans(), sessions: {} };
}
function dayForDate(dateKey) { return schedule[Math.min(Math.max(fromDateKey(dateKey).getDay() - 1, 0), 4)]; }
function makeSession(dateKey, exercises = []) { const day = dayForDate(dateKey); return { date: dateKey, dayKey: day.key, workout: day.workout, exercises }; }
function programWeek(dateKey) {
  const difference = startOfDay(fromDateKey(dateKey)) - startOfDay(fromDateKey(state.programStartDate));
  return Math.max(1, Math.floor(difference / 604800000) + 1);
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.version === 5) return normalizeV5(saved);
    const v4 = JSON.parse(localStorage.getItem(V4_STORAGE_KEY));
    if (v4?.version === 4) return persistAndReturn(migrateV4(v4));
    const v3 = JSON.parse(localStorage.getItem(V3_STORAGE_KEY));
    if (v3?.version === 3) return persistAndReturn(migrateV4(migrateV3ToV4(v3)));
    const v2 = JSON.parse(localStorage.getItem(V2_STORAGE_KEY));
    if (v2?.sessions) return persistAndReturn(migrateV4(migrateV3ToV4(v2ToV3(v2))));
    const v1 = JSON.parse(localStorage.getItem(V1_STORAGE_KEY));
    if (v1?.workouts) return persistAndReturn(migrateV4(migrateV3ToV4(v2ToV3(v1ToV2(v1)))));
  } catch {}
  return createInitialState();
}
function persistAndReturn(value) { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); return value; }
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function uniqueTags(tags) {
  const seen = new Set();
  return tags.filter(tag => tag?.id && tag?.label && !seen.has(tag.id) && seen.add(tag.id)).map(tag => ({ id: String(tag.id), label: String(tag.label).slice(0, 20), builtin: Boolean(tag.builtin) }));
}
function copyMetadata(candidate, normalized) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate.selectedDate || "")) normalized.selectedDate = candidate.selectedDate;
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate.programStartDate || "")) normalized.programStartDate = candidate.programStartDate;
  for (const group of ["type", "difficulty"]) {
    const custom = Array.isArray(candidate.tags?.[group]) ? candidate.tags[group] : [];
    normalized.tags[group] = uniqueTags([...defaultTags[group], ...custom.filter(tag => !tag.builtin)]);
  }
}
function normalizeLibraryExercise(exercise) {
  return { id: String(exercise?.id || makeId()), name: String(exercise?.name || "Untitled exercise").slice(0, 50), typeTagId: String(exercise?.typeTagId || ""), note: String(exercise?.note || "").slice(0, 500), archived: Boolean(exercise?.archived) };
}
function normalizeSlot(slot) {
  return {
    id: String(slot?.id || makeId()),
    schedule: Array.isArray(slot?.schedule) ? slot.schedule.map(item => ({ id: String(item?.id || makeId()), exerciseId: String(item?.exerciseId || ""), startWeek: Math.max(1, Number(item?.startWeek) || 1) })).sort((a, b) => a.startWeek - b.startWeek) : [],
  };
}
function normalizeSessionExercise(exercise) {
  return {
    id: String(exercise?.id || makeId()), slotId: String(exercise?.slotId || ""), libraryExerciseId: String(exercise?.libraryExerciseId || ""),
    name: String(exercise?.name || "Untitled exercise").slice(0, 50), typeTagId: String(exercise?.typeTagId || ""), difficultyTagId: String(exercise?.difficultyTagId || ""), note: String(exercise?.note || "").slice(0, 500),
    sets: Array.isArray(exercise?.sets) ? exercise.sets.map(set => ({ id: String(set.id || makeId()), weight: String(set.weight ?? ""), reps: String(set.reps ?? "") })) : [],
  };
}
function normalizeV5(candidate) {
  const normalized = createInitialState(); copyMetadata(candidate, normalized);
  normalized.library = (candidate.library || []).map(normalizeLibraryExercise);
  const ids = new Set(normalized.library.map(item => item.id));
  for (const day of schedule) normalized.plans[day.key] = (candidate.plans?.[day.key] || []).map(normalizeSlot).map(slot => ({ ...slot, schedule: slot.schedule.filter(item => ids.has(item.exerciseId)) })).filter(slot => slot.schedule.length);
  for (const [key, session] of Object.entries(candidate.sessions || {})) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(key) && Array.isArray(session?.exercises)) normalized.sessions[key] = makeSession(key, session.exercises.map(normalizeSessionExercise));
  }
  return normalized;
}

function migrateV4(previous) {
  const migrated = createInitialState(); copyMetadata(previous, migrated);
  const byName = new Map(); const baseMap = new Map(); const variationMap = new Map();
  const findOrCreate = (raw, fallback = {}) => {
    const normalized = normalizeLibraryExercise({ ...fallback, ...raw }); const key = normalizeName(normalized.name);
    let shared = byName.get(key);
    if (!shared) { shared = { ...normalized, id: makeId(), archived: false }; migrated.library.push(shared); byName.set(key, shared); }
    else { if (!shared.typeTagId && normalized.typeTagId) shared.typeTagId = normalized.typeTagId; if (!shared.note && normalized.note) shared.note = normalized.note; }
    return shared;
  };
  for (const rawBase of previous.library || []) {
    const base = findOrCreate(rawBase); baseMap.set(String(rawBase.id), base.id); variationMap.set(`${rawBase.id}|base`, base.id);
    for (const variation of rawBase.variations || []) {
      const fullExercise = findOrCreate({ name: variation.name }, { typeTagId: rawBase.typeTagId, note: rawBase.note });
      variationMap.set(`${rawBase.id}|${variation.id}`, fullExercise.id);
    }
  }
  for (const day of schedule) {
    migrated.plans[day.key] = (previous.plans?.[day.key] || []).map(assignment => {
      const rawBase = (previous.library || []).find(item => String(item.id) === String(assignment.exerciseId));
      const baseId = baseMap.get(String(assignment.exerciseId)); if (!baseId) return null;
      const slot = { id: makeId(), schedule: [{ id: makeId(), exerciseId: baseId, startWeek: 1 }] };
      for (const variation of rawBase?.variations || []) {
        const exerciseId = variationMap.get(`${rawBase.id}|${variation.id}`);
        if (exerciseId) slot.schedule.push({ id: makeId(), exerciseId, startWeek: Math.max(1, Number(variation.startWeek) || 1) });
      }
      return slot;
    }).filter(Boolean);
  }
  for (const [key, session] of Object.entries(previous.sessions || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Array.isArray(session?.exercises)) continue;
    const slots = migrated.plans[dayForDate(key).key];
    const exercises = session.exercises.map((raw, index) => {
      const oldBaseId = String(raw.libraryExerciseId || "");
      let exerciseId = variationMap.get(`${oldBaseId}|${raw.variationId || "base"}`) || baseMap.get(oldBaseId);
      if (!exerciseId) exerciseId = findOrCreate({ name: raw.name, typeTagId: raw.typeTagId, note: raw.note }).id;
      return normalizeSessionExercise({ ...raw, libraryExerciseId: exerciseId, slotId: slots[index]?.id || "" });
    });
    migrated.sessions[key] = makeSession(key, exercises);
  }
  return migrated;
}
function migrateV3ToV4(previous) {
  const converted = { version: 4, selectedDate: previous.selectedDate, programStartDate: previous.programStartDate, tags: previous.tags, library: [], plans: emptyPlans(), sessions: {} };
  const byName = new Map(); const planMap = new Map();
  for (const day of schedule) {
    for (const raw of previous.plans?.[day.key] || []) {
      const key = normalizeName(raw.name); let exercise = byName.get(key);
      if (!exercise) { exercise = { id: makeId(), name: raw.name, typeTagId: raw.typeTagId || "", note: raw.note || "", variations: [] }; byName.set(key, exercise); converted.library.push(exercise); }
      const variationIds = new Map([["base", "base"]]);
      for (const rawVariation of raw.variations || []) {
        let sharedVariation = exercise.variations.find(item => item.startWeek === rawVariation.startWeek && normalizeName(item.name) === normalizeName(rawVariation.name));
        if (!sharedVariation) { sharedVariation = { id: makeId(), name: rawVariation.name, startWeek: rawVariation.startWeek }; exercise.variations.push(sharedVariation); }
        variationIds.set(String(rawVariation.id), sharedVariation.id);
      }
      planMap.set(String(raw.id), { exerciseId: exercise.id, variationIds }); converted.plans[day.key].push({ id: makeId(), exerciseId: exercise.id });
    }
  }
  for (const [key, session] of Object.entries(previous.sessions || {})) {
    converted.sessions[key] = makeSession(key, (session.exercises || []).map(raw => {
      const mapping = planMap.get(String(raw.planExerciseId));
      return { ...raw, libraryExerciseId: mapping?.exerciseId || "", variationId: mapping?.variationIds.get(String(raw.variationId || "base")) || "base" };
    }));
  }
  return converted;
}
function v1ToV2(legacy) {
  const converted = { selectedDate: defaultSelectedDate(), sessions: {} };
  currentWeek.forEach((date, index) => { const exercises = legacy.workouts?.[schedule[index].key]; if (Array.isArray(exercises) && exercises.length) { const key = toDateKey(date); converted.sessions[key] = makeSession(key, exercises); } });
  const selectedIndex = schedule.findIndex(day => day.key === legacy.selectedDay); if (selectedIndex >= 0) converted.selectedDate = toDateKey(currentWeek[selectedIndex]); return converted;
}
function v2ToV3(previous) {
  const converted = { version: 3, selectedDate: previous.selectedDate, programStartDate: toDateKey(currentWeek[0]), tags: copyDefaultTags(), plans: emptyPlans(), sessions: {} };
  for (const [key, session] of Object.entries(previous.sessions || {})) if (/^\d{4}-\d{2}-\d{2}$/.test(key)) converted.sessions[key] = makeSession(key, (session.exercises || []).map(raw => ({ ...raw, planExerciseId: "", variationId: "base" })));
  for (const day of schedule) {
    const matching = Object.values(converted.sessions).filter(session => session.dayKey === day.key).sort((a, b) => b.date.localeCompare(a.date)); const latest = matching[0]; if (!latest) continue;
    converted.plans[day.key] = latest.exercises.map(exercise => ({ id: makeId(), name: exercise.name, typeTagId: exercise.typeTagId || "", note: exercise.note || "", variations: [] }));
    matching.forEach(session => session.exercises.forEach((exercise, index) => { const plan = converted.plans[day.key][index] || converted.plans[day.key].find(item => normalizeName(item.name) === normalizeName(exercise.name)); if (plan) exercise.planExerciseId = plan.id; }));
  }
  return converted;
}

function libraryExercise(id) { return state.library.find(item => item.id === id); }
function activeScheduleItem(slot, dateKey) {
  const week = programWeek(dateKey); return [...slot.schedule].filter(item => item.startWeek <= week).sort((a, b) => b.startWeek - a.startWeek)[0] || [...slot.schedule].sort((a, b) => a.startWeek - b.startWeek)[0];
}
function latestPerformance(exerciseId, beforeDate) {
  const sessions = Object.values(state.sessions).filter(session => session.date < beforeDate).sort((a, b) => b.date.localeCompare(a.date));
  for (const session of sessions) { const exercise = session.exercises.find(item => item.libraryExerciseId === exerciseId); if (exercise) return exercise; }
  return null;
}
function exerciseFromSlot(slot, dateKey) {
  const scheduled = activeScheduleItem(slot, dateKey); const definition = libraryExercise(scheduled?.exerciseId); if (!definition) return null;
  const previous = latestPerformance(definition.id, dateKey);
  return { id: makeId(), slotId: slot.id, libraryExerciseId: definition.id, name: definition.name, typeTagId: definition.typeTagId, difficultyTagId: "", note: definition.note, sets: previous ? previous.sets.map(set => ({ id: makeId(), weight: set.weight, reps: set.reps })) : [] };
}
function getSession(dateKey = state.selectedDate) {
  if (!state.sessions[dateKey]) { const day = dayForDate(dateKey); state.sessions[dateKey] = makeSession(dateKey, state.plans[day.key].map(slot => exerciseFromSlot(slot, dateKey)).filter(Boolean)); saveState(); }
  return state.sessions[dateKey];
}
function isCurrentWeekDate(dateKey) { return currentWeek.some(date => toDateKey(date) === dateKey); }
function syncSelectedSessionToPlan() {
  if (!isCurrentWeekDate(state.selectedDate)) return;
  const session = getSession(); const day = dayForDate(state.selectedDate);
  session.exercises = state.plans[day.key].map(slot => {
    const active = activeScheduleItem(slot, state.selectedDate); const existing = session.exercises.find(exercise => exercise.slotId === slot.id);
    if (existing && existing.libraryExerciseId === active?.exerciseId) return existing;
    return exerciseFromSlot(slot, state.selectedDate);
  }).filter(Boolean);
  saveState();
}

function render() {
  const session = getSession();
  dayTabs.replaceChildren(...schedule.map((day, index) => {
    const dateKey = toDateKey(currentWeek[index]); const button = document.createElement("button"); button.type = "button";
    button.className = `day-tab${dateKey === state.selectedDate ? " active" : ""}`; button.innerHTML = `${day.short}<span>${day.workout}</span>`;
    button.setAttribute("aria-label", `${day.label}, ${formatDate(dateKey, "short")}, ${day.workout} workout`); button.setAttribute("aria-pressed", String(dateKey === state.selectedDate));
    button.addEventListener("click", () => { state.selectedDate = dateKey; expandedExerciseId = null; saveState(); render(); if (manageDrawer.classList.contains("open")) renderManage(); }); return button;
  }));
  const selectedDate = fromDateKey(session.date); dayLabel.textContent = selectedDate.toLocaleDateString(undefined, { weekday: "long" });
  dateLabel.textContent = formatDate(session.date, "long"); dateLabel.dateTime = session.date; workoutTitle.textContent = `${session.workout} day`;
  exerciseCount.textContent = `${session.exercises.length} exercise${session.exercises.length === 1 ? "" : "s"}`; exerciseList.replaceChildren();
  if (!session.exercises.length) { const empty = document.createElement("div"); empty.className = "empty-state"; empty.innerHTML = "<strong>No exercises planned</strong>Use Manage workout plan to add exercises."; exerciseList.append(empty); }
  else session.exercises.forEach((exercise, index) => exerciseList.append(renderExercise(exercise, index)));
  renderHistory();
}
function formatDate(dateKey, style) { return fromDateKey(dateKey).toLocaleDateString(undefined, style === "long" ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" }); }
function tagById(group, id) { return state.tags[group].find(tag => tag.id === id); }
function fillTagSelect(select, group, selectedId) {
  select.replaceChildren(new Option(group === "type" ? "Not classified" : "Difficulty", "")); state.tags[group].forEach(tag => select.add(new Option(tag.label, tag.id)));
  select.value = state.tags[group].some(tag => tag.id === selectedId) ? selectedId : "";
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
  sessions.forEach(session => { const button = document.createElement("button"); const weekday = fromDateKey(session.date).toLocaleDateString(undefined, { weekday: "short" }); button.type = "button"; button.className = `history-item${session.date === state.selectedDate ? " selected" : ""}`;
    button.innerHTML = `<span class="history-item-top"><span class="history-item-title">${escapeHtml(session.workout)} · ${weekday}</span><span class="history-item-date">${formatDate(session.date, "short")}</span></span><span class="history-exercises">${escapeHtml(session.exercises.map(item => item.name).join(" · "))}</span>`;
    button.addEventListener("click", () => { state.selectedDate = session.date; expandedExerciseId = null; saveState(); closeHistory(); render(); }); historyList.append(button); });
}
function escapeHtml(value) { const element = document.createElement("span"); element.textContent = value; return element.innerHTML; }
function showToast(message) { const toast = $("#toast"); toast.textContent = message; toast.classList.add("show"); clearTimeout(toastTimeout); toastTimeout = setTimeout(() => toast.classList.remove("show"), 2400); }
function openHistory() { closeManage(); historyDrawer.classList.add("open"); drawerBackdrop.classList.remove("hidden"); historyDrawer.setAttribute("aria-hidden", "false"); document.body.style.overflow = "hidden"; }
function closeHistory() { historyDrawer.classList.remove("open"); drawerBackdrop.classList.add("hidden"); historyDrawer.setAttribute("aria-hidden", "true"); document.body.style.overflow = ""; }

function openManage(view = "plan") {
  closeHistory();
  if (view === "plan" && !isCurrentWeekDate(state.selectedDate)) {
    const dayKey = dayForDate(state.selectedDate).key; const index = schedule.findIndex(day => day.key === dayKey);
    state.selectedDate = toDateKey(currentWeek[Math.max(0, index)]); expandedExerciseId = null; saveState(); render();
  }
  activeManageView = view; renderManage(); manageDrawer.classList.add("open"); manageBackdrop.classList.remove("hidden"); manageDrawer.setAttribute("aria-hidden", "false"); document.body.style.overflow = "hidden";
}
function closeManage() { manageDrawer.classList.remove("open"); manageBackdrop.classList.add("hidden"); manageDrawer.setAttribute("aria-hidden", "true"); document.body.style.overflow = ""; render(); }
function renderManage() {
  document.querySelectorAll(".manage-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.manageView === activeManageView));
  $("#planManager").classList.toggle("hidden", activeManageView !== "plan"); $("#libraryManager").classList.toggle("hidden", activeManageView !== "library");
  if (activeManageView === "plan") renderPlanManager(); else renderLibraryManager();
}
function renderPlanManager() {
  const day = dayForDate(state.selectedDate); $("#planDayLabel").textContent = `${day.label} · Program week ${programWeek(state.selectedDate)}`;
  const list = $("#planSlotList"); list.replaceChildren(); const slots = state.plans[day.key];
  if (!slots.length) { const empty = document.createElement("p"); empty.className = "manager-empty"; empty.textContent = "No exercises in this workout yet."; list.append(empty); }
  slots.forEach((slot, index) => list.append(renderPlanSlot(slot, index, slots, day)));
  renderPlanPickerOptions($("#planSearch").value);
}
function renderPlanSlot(slot, index, slots, day) {
  const card = document.createElement("article"); card.className = "plan-slot"; const active = activeScheduleItem(slot, state.selectedDate); const activeExercise = libraryExercise(active?.exerciseId);
  card.innerHTML = `<div class="slot-header"><span class="slot-title">${escapeHtml(activeExercise?.name || "Missing exercise")}</span><span class="slot-actions"></span></div><div class="slot-schedule"></div>`;
  const actions = card.querySelector(".slot-actions");
  for (const [label, delta] of [["↑", -1], ["↓", 1]]) { const button = document.createElement("button"); button.type = "button"; button.className = "slot-action"; button.textContent = label; button.disabled = index + delta < 0 || index + delta >= slots.length; button.addEventListener("click", () => { [slots[index], slots[index + delta]] = [slots[index + delta], slots[index]]; syncSelectedSessionToPlan(); renderManage(); render(); }); actions.append(button); }
  const remove = document.createElement("button"); remove.type = "button"; remove.className = "slot-action danger"; remove.textContent = "×"; remove.setAttribute("aria-label", "Remove workout slot"); remove.addEventListener("click", () => { if (!confirm("Remove this exercise slot from the workout plan? Past sessions will remain.")) return; state.plans[day.key].splice(index, 1); syncSelectedSessionToPlan(); saveState(); renderManage(); render(); }); actions.append(remove);
  const scheduleList = card.querySelector(".slot-schedule"); [...slot.schedule].sort((a, b) => a.startWeek - b.startWeek).forEach(item => {
    const exercise = libraryExercise(item.exerciseId); const row = document.createElement("div"); row.className = `schedule-row${item.id === active?.id ? " active" : ""}`;
    row.innerHTML = `<span>W${item.startWeek}+</span><span class="schedule-name">${escapeHtml(exercise?.name || "Deleted exercise")}</span>`;
    const deleteButton = document.createElement("button"); deleteButton.type = "button"; deleteButton.className = "schedule-remove"; deleteButton.textContent = slot.schedule.length > 1 ? "×" : ""; deleteButton.disabled = slot.schedule.length <= 1;
    deleteButton.addEventListener("click", () => { slot.schedule = slot.schedule.filter(entry => entry.id !== item.id); syncSelectedSessionToPlan(); saveState(); renderManage(); render(); }); row.append(deleteButton); scheduleList.append(row);
  });
  const add = document.createElement("button"); add.type = "button"; add.className = "schedule-add"; add.textContent = "＋ Schedule replacement"; scheduleList.append(add);
  const form = document.createElement("div"); form.className = "schedule-form hidden"; form.innerHTML = `<input type="search" placeholder="Search or create exercise"><input type="number" min="1" max="520" inputmode="numeric" value="${programWeek(state.selectedDate) + 1}" aria-label="Starting week"><div class="schedule-results"></div>`; scheduleList.append(form);
  add.addEventListener("click", () => { form.classList.toggle("hidden"); if (!form.classList.contains("hidden")) { form.querySelector("input[type=search]").focus(); renderScheduleChoices(form, slot); } });
  form.querySelector("input[type=search]").addEventListener("input", () => renderScheduleChoices(form, slot)); return card;
}
function renderScheduleChoices(form, slot) {
  const query = form.querySelector("input[type=search]").value.trim(); const results = form.querySelector(".schedule-results"); results.replaceChildren();
  const scheduledIds = new Set(slot.schedule.map(item => item.exerciseId));
  state.library.filter(item => !item.archived && !scheduledIds.has(item.id) && normalizeName(item.name).includes(normalizeName(query))).slice(0, 8).forEach(exercise => {
    const choice = document.createElement("button"); choice.type = "button"; choice.className = "schedule-choice"; choice.textContent = exercise.name; choice.addEventListener("click", () => scheduleExercise(slot, exercise, form)); results.append(choice);
  });
  if (query && !state.library.some(item => normalizeName(item.name) === normalizeName(query))) { const create = document.createElement("button"); create.type = "button"; create.className = "schedule-choice"; create.textContent = `＋ Create “${query}”`; create.addEventListener("click", () => { const exercise = createLibraryExercise(query); scheduleExercise(slot, exercise, form); }); results.append(create); }
}
function scheduleExercise(slot, exercise, form) {
  const week = Number(form.querySelector("input[type=number]").value); if (!Number.isInteger(week) || week < 1) { showToast("Choose a valid starting week"); return; }
  const existing = slot.schedule.find(item => item.startWeek === week); if (existing && !confirm(`Replace the exercise already scheduled for week ${week}?`)) return;
  slot.schedule = slot.schedule.filter(item => item.startWeek !== week); slot.schedule.push({ id: makeId(), exerciseId: exercise.id, startWeek: week }); syncSelectedSessionToPlan(); saveState(); renderManage(); render(); showToast(`${exercise.name} scheduled for week ${week}`);
}
function renderPlanPickerOptions(query = "") {
  const results = $("#planPickerOptions"); results.replaceChildren(); const day = dayForDate(state.selectedDate); const used = new Set(state.plans[day.key].flatMap(slot => slot.schedule.map(item => item.exerciseId)));
  const choices = state.library.filter(item => !item.archived && !used.has(item.id) && normalizeName(item.name).includes(normalizeName(query))).sort((a, b) => a.name.localeCompare(b.name));
  if (!choices.length) { const empty = document.createElement("p"); empty.className = "library-empty"; empty.textContent = "No matching available exercises"; results.append(empty); return; }
  choices.slice(0, 12).forEach(exercise => { const button = document.createElement("button"); button.type = "button"; button.className = "library-option"; button.innerHTML = `<span class="library-option-name">${escapeHtml(exercise.name)}</span><span class="library-option-meta">Add</span>`; button.addEventListener("click", () => addSlot(exercise)); results.append(button); });
}
function addSlot(exercise) {
  const day = dayForDate(state.selectedDate); state.plans[day.key].push({ id: makeId(), schedule: [{ id: makeId(), exerciseId: exercise.id, startWeek: 1 }] }); $("#planPicker").classList.add("hidden"); $("#planSearch").value = ""; syncSelectedSessionToPlan(); saveState(); renderManage(); render(); showToast(`${exercise.name} added to ${day.label}`);
}
function createLibraryExercise(name) {
  const existing = state.library.find(item => normalizeName(item.name) === normalizeName(name)); if (existing) return existing;
  const exercise = { id: makeId(), name: name.trim().slice(0, 50), typeTagId: "", note: "", archived: false }; state.library.push(exercise); saveState(); return exercise;
}

function renderLibraryManager() {
  const query = $("#manageLibrarySearch").value; const list = $("#libraryManagerList"); list.replaceChildren();
  const exercises = state.library.filter(item => normalizeName(item.name).includes(normalizeName(query))).sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));
  if (!exercises.length) { const empty = document.createElement("p"); empty.className = "manager-empty"; empty.textContent = "No exercises found."; list.append(empty); return; }
  exercises.forEach(exercise => list.append(renderLibraryEditor(exercise)));
}
function renderLibraryEditor(exercise) {
  const details = document.createElement("details"); details.className = "library-editor"; const type = tagById("type", exercise.typeTagId);
  details.innerHTML = `<summary><span class="library-editor-name">${escapeHtml(exercise.name)}</span><span class="library-editor-status">${exercise.archived ? "Archived" : escapeHtml(type?.label || "Exercise")}</span></summary><div class="library-fields"><label>Name<input class="library-name" maxlength="50"></label><label>Exercise type<select class="library-type"></select></label><label>Shared setup note<textarea class="library-note" maxlength="500" rows="3"></textarea></label><div class="library-actions"><button class="archive-button" type="button">${exercise.archived ? "Restore" : "Archive"}</button><button class="delete-library-button" type="button">Delete permanently</button></div></div>`;
  const name = details.querySelector(".library-name"); name.value = exercise.name; name.addEventListener("change", () => {
    const next = name.value.trim(); const duplicate = state.library.find(item => item.id !== exercise.id && normalizeName(item.name) === normalizeName(next));
    if (!next || duplicate) { showToast(duplicate ? "An exercise with that name already exists" : "Name cannot be empty"); name.value = exercise.name; return; }
    exercise.name = next; syncDefinitionToCurrentSessions(exercise); saveState(); renderLibraryManager(); render();
  });
  const typeSelect = details.querySelector(".library-type"); fillTagSelect(typeSelect, "type", exercise.typeTagId); typeSelect.addEventListener("change", () => { exercise.typeTagId = typeSelect.value; syncDefinitionToCurrentSessions(exercise); saveState(); render(); });
  const note = details.querySelector(".library-note"); note.value = exercise.note; note.addEventListener("input", () => { exercise.note = note.value; syncDefinitionToCurrentSessions(exercise); saveState(); });
  details.querySelector(".archive-button").addEventListener("click", () => { exercise.archived = !exercise.archived; saveState(); renderLibraryManager(); showToast(exercise.archived ? "Exercise archived" : "Exercise restored"); });
  details.querySelector(".delete-library-button").addEventListener("click", () => deleteLibraryExercise(exercise)); return details;
}
function syncDefinitionToCurrentSessions(definition) {
  Object.values(state.sessions).filter(session => isCurrentWeekDate(session.date)).forEach(session => session.exercises.filter(item => item.libraryExerciseId === definition.id).forEach(item => { item.name = definition.name; item.typeTagId = definition.typeTagId; item.note = definition.note; }));
}
function deleteLibraryExercise(exercise) {
  if (!confirm(`Permanently delete ${exercise.name} from the library and every future plan? Workout history will remain readable.`)) return;
  state.library = state.library.filter(item => item.id !== exercise.id);
  for (const day of schedule) state.plans[day.key] = state.plans[day.key].map(slot => ({ ...slot, schedule: slot.schedule.filter(item => item.exerciseId !== exercise.id) })).filter(slot => slot.schedule.length);
  syncSelectedSessionToPlan(); saveState(); renderLibraryManager(); render(); showToast("Exercise deleted from library");
}

function openTagDialog() { renderTagManager(); tagDialog.showModal(); }
function renderTagManager() {
  for (const group of ["type", "difficulty"]) { const container = $(`#${group}TagList`); container.replaceChildren(); state.tags[group].forEach(tag => { const item = document.createElement("span"); item.className = "managed-tag"; const label = document.createElement("span"); label.textContent = tag.label; item.append(label);
      if (!tag.builtin) { const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "✎"; edit.addEventListener("click", () => { const next = prompt("Rename tag", tag.label)?.trim(); if (next) { tag.label = next.slice(0, 20); saveState(); renderTagManager(); } }); const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×"; remove.addEventListener("click", () => deleteTag(group, tag.id)); item.append(edit, remove); } container.append(item); }); }
}
function deleteTag(group, id) {
  if (!confirm("Delete this tag and remove it from all exercises?")) return; state.tags[group] = state.tags[group].filter(tag => tag.id !== id);
  state.library.forEach(exercise => { if (group === "type" && exercise.typeTagId === id) exercise.typeTagId = ""; }); Object.values(state.sessions).flatMap(session => session.exercises).forEach(exercise => { if (group === "type" && exercise.typeTagId === id) exercise.typeTagId = ""; if (group === "difficulty" && exercise.difficultyTagId === id) exercise.difficultyTagId = ""; }); saveState(); renderTagManager();
}

$("#historyButton").addEventListener("click", openHistory); $("#closeHistoryButton").addEventListener("click", closeHistory); drawerBackdrop.addEventListener("click", closeHistory);
$("#manageButton").addEventListener("click", () => openManage("plan")); $("#openManageFromWorkout").addEventListener("click", () => openManage("plan")); $("#closeManageButton").addEventListener("click", closeManage); manageBackdrop.addEventListener("click", closeManage);
document.querySelectorAll(".manage-tab").forEach(tab => tab.addEventListener("click", () => { activeManageView = tab.dataset.manageView; renderManage(); }));
$("#showPlanPickerButton").addEventListener("click", () => { $("#planPicker").classList.toggle("hidden"); renderPlanPickerOptions(); if (!$("#planPicker").classList.contains("hidden")) $("#planSearch").focus(); });
$("#planSearch").addEventListener("input", () => renderPlanPickerOptions($("#planSearch").value));
$("#createFromPlanButton").addEventListener("click", () => { const name = prompt("New exercise name")?.trim(); if (name) addSlot(createLibraryExercise(name)); });
$("#showLibraryCreateButton").addEventListener("click", () => { $("#libraryCreateForm").classList.toggle("hidden"); if (!$("#libraryCreateForm").classList.contains("hidden")) $("#libraryCreateName").focus(); });
$("#libraryCreateForm").addEventListener("submit", event => { event.preventDefault(); const input = $("#libraryCreateName"); const name = input.value.trim(); if (!name) return; const existing = state.library.find(item => normalizeName(item.name) === normalizeName(name)); if (existing) { showToast("That exercise already exists"); return; } createLibraryExercise(name); input.value = ""; $("#libraryCreateForm").classList.add("hidden"); renderLibraryManager(); });
$("#manageLibrarySearch").addEventListener("input", renderLibraryManager); $("#manageTagsFromLibrary").addEventListener("click", openTagDialog);
$("#closeTagDialogButton").addEventListener("click", () => tagDialog.close()); tagDialog.addEventListener("close", () => { renderManage(); render(); });
document.querySelectorAll(".tag-form").forEach(form => form.addEventListener("submit", event => { event.preventDefault(); const group = form.dataset.group; const input = form.querySelector("input"); const label = input.value.trim(); if (!label) return; if (state.tags[group].some(tag => tag.label.toLowerCase() === label.toLowerCase())) { showToast("That tag already exists"); return; } state.tags[group].push({ id: `${group}-${makeId()}`, label, builtin: false }); saveState(); input.value = ""; renderTagManager(); }));
document.addEventListener("keydown", event => { if (event.key === "Escape") { closeHistory(); closeManage(); } });

$("#exportButton").addEventListener("click", () => { saveState(); const backup = { app: "Rep Routine", version: 5, exportedAt: new Date().toISOString(), data: state }; const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `rep-routine-backup-${toDateKey(today)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); showToast("Workout data exported"); });
$("#importButton").addEventListener("click", () => $("#importFile").click());
$("#importFile").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  try { const parsed = JSON.parse(await file.text()); const candidate = parsed.data || parsed; let imported;
    if (candidate?.version === 5) imported = normalizeV5(candidate); else if (candidate?.version === 4) imported = migrateV4(candidate); else if (candidate?.version === 3) imported = migrateV4(migrateV3ToV4(candidate)); else if (candidate?.sessions) imported = migrateV4(migrateV3ToV4(v2ToV3(candidate))); else throw new Error("Invalid backup");
    if (!confirm("Replace the workout data in this browser with the imported backup?")) return; imported.selectedDate = defaultSelectedDate(); state = imported; getSession(); saveState(); render(); showToast("Backup imported and this week is ready");
  } catch { alert("This file is not a valid Rep Routine JSON backup."); } finally { event.target.value = ""; }
});
$("#resetWeekButton").addEventListener("click", () => { if (!confirm("Clear every workout, plan, exercise, tag, and set? Export a backup first if needed.")) return; state = createInitialState(); saveState(); closeHistory(); render(); showToast("Workout data cleared"); });

function selectTimer(seconds) { stopTimer(); timer.selectedSeconds = seconds; timer.remaining = seconds; document.querySelectorAll(".timer-preset").forEach(button => button.classList.toggle("active", Number(button.dataset.seconds) === seconds)); updateTimerDisplay(); }
function updateTimerDisplay() { const minutes = Math.floor(timer.remaining / 60); const seconds = timer.remaining % 60; timerDisplay.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`; document.title = timer.intervalId ? `${timerDisplay.textContent} · Rep Routine` : "Rep Routine"; }
function startTimer() { prepareTimerAudio(); if (timer.remaining <= 0) timer.remaining = timer.selectedSeconds; timer.endsAt = Date.now() + timer.remaining * 1000; timer.intervalId = window.setInterval(tickTimer, 250); timerToggle.textContent = "Pause"; timerToggle.classList.add("running"); tickTimer(); }
function stopTimer() { window.clearInterval(timer.intervalId); timer.intervalId = null; timer.endsAt = null; timerToggle.textContent = "Start"; timerToggle.classList.remove("running"); }
function tickTimer() { timer.remaining = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000)); updateTimerDisplay(); if (timer.remaining === 0) { stopTimer(); timerToggle.textContent = "Again"; playTimerAlert(); } }
function playTimerAlert() { if (navigator.vibrate) navigator.vibrate([180, 90, 180, 90, 180]); try { const audio = prepareTimerAudio(); [0, .3, .6, .9, 1.2, 1.5].forEach(delay => { const oscillator = audio.createOscillator(); const gain = audio.createGain(); const start = audio.currentTime + delay; oscillator.frequency.value = 920; oscillator.connect(gain); gain.connect(audio.destination); gain.gain.setValueAtTime(.001, start); gain.gain.exponentialRampToValueAtTime(.24, start + .02); gain.gain.exponentialRampToValueAtTime(.001, start + .2); oscillator.start(start); oscillator.stop(start + .22); }); } catch {} }
function prepareTimerAudio() { if (!timerAudioContext) { const AudioContextClass = window.AudioContext || window.webkitAudioContext; timerAudioContext = new AudioContextClass(); } if (timerAudioContext.state === "suspended") timerAudioContext.resume(); return timerAudioContext; }
document.querySelectorAll(".timer-preset[data-seconds]").forEach(button => button.addEventListener("click", () => selectTimer(Number(button.dataset.seconds)))); timerToggle.addEventListener("click", () => timer.intervalId ? stopTimer() : startTimer());
$("#customTimerButton").addEventListener("click", () => { customTimerForm.classList.toggle("hidden"); if (!customTimerForm.classList.contains("hidden")) $("#customSeconds").focus(); });
customTimerForm.addEventListener("submit", event => { event.preventDefault(); const seconds = Number($("#customSeconds").value); if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) return; selectTimer(seconds); customTimerForm.reset(); customTimerForm.classList.add("hidden"); });
document.addEventListener("visibilitychange", () => { if (!document.hidden && timer.intervalId) tickTimer(); });

render(); updateTimerDisplay();
