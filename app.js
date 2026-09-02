const STORAGE_KEY = "rep-routine-v4";
const V3_STORAGE_KEY = "rep-routine-v3";
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
let expandedExerciseId = null;

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
const libraryPicker = $("#libraryPicker");
const librarySearch = $("#librarySearch");
const libraryOptions = $("#libraryOptions");

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
    version: 4,
    selectedDate: defaultSelectedDate(),
    programStartDate: toDateKey(currentWeek[0]),
    tags: copyDefaultTags(),
    library: [],
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
    if (saved?.version === 4 && saved.library && saved.plans && saved.sessions) return normalizeV4(saved);
    const v3 = JSON.parse(localStorage.getItem(V3_STORAGE_KEY));
    if (v3?.version === 3 && v3.plans && v3.sessions) { const migrated = migrateV3(v3); persistMigratedState(migrated); return migrated; }
    const previous = JSON.parse(localStorage.getItem(PREVIOUS_STORAGE_KEY));
    if (previous?.sessions) { const migrated = migrateV3(v2ToV3(previous)); persistMigratedState(migrated); return migrated; }
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
    if (legacy?.workouts) { const migrated = migrateV3(v2ToV3(v1ToV2(legacy))); persistMigratedState(migrated); return migrated; }
  } catch {}
  return createInitialState();
}

function normalizeV4(candidate) {
  const normalized = createInitialState();
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate.selectedDate || "")) normalized.selectedDate = candidate.selectedDate;
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate.programStartDate || "")) normalized.programStartDate = candidate.programStartDate;
  for (const group of ["type", "difficulty"]) {
    const custom = Array.isArray(candidate.tags?.[group]) ? candidate.tags[group] : [];
    normalized.tags[group] = uniqueTags([...defaultTags[group], ...custom.filter(tag => !tag.builtin)]);
  }
  normalized.library = (candidate.library || []).map(normalizeLibraryExercise);
  const libraryIds = new Set(normalized.library.map(exercise => exercise.id));
  for (const day of schedule) normalized.plans[day.key] = (candidate.plans?.[day.key] || [])
    .map(normalizeAssignment).filter(assignment => libraryIds.has(assignment.exerciseId));
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
function normalizeLibraryExercise(exercise) {
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
function normalizeAssignment(assignment) {
  return { id: String(assignment?.id || makeId()), exerciseId: String(assignment?.exerciseId || "") };
}
function normalizeSessionExercise(exercise) {
  return {
    id: String(exercise?.id || makeId()),
    libraryExerciseId: String(exercise?.libraryExerciseId || ""),
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

function normalizeName(name) { return String(name || "").trim().toLocaleLowerCase().replace(/\s+/g, " "); }
function migrateV3(previous) {
  const migrated = createInitialState(); const exerciseByName = new Map(); const planMappings = new Map();
  if (/^\d{4}-\d{2}-\d{2}$/.test(previous.selectedDate || "")) migrated.selectedDate = previous.selectedDate;
  if (/^\d{4}-\d{2}-\d{2}$/.test(previous.programStartDate || "")) migrated.programStartDate = previous.programStartDate;
  for (const group of ["type", "difficulty"]) {
    const custom = Array.isArray(previous.tags?.[group]) ? previous.tags[group] : [];
    migrated.tags[group] = uniqueTags([...defaultTags[group], ...custom.filter(tag => !tag.builtin)]);
  }
  for (const day of schedule) {
    for (const rawPlanExercise of previous.plans?.[day.key] || []) {
      const oldPlan = normalizeLibraryExercise(rawPlanExercise); const key = normalizeName(oldPlan.name);
      let libraryExercise = exerciseByName.get(key);
      if (!libraryExercise) {
        libraryExercise = { ...oldPlan, id: makeId(), variations: [] };
        migrated.library.push(libraryExercise); exerciseByName.set(key, libraryExercise);
      } else {
        if (!libraryExercise.typeTagId && oldPlan.typeTagId) libraryExercise.typeTagId = oldPlan.typeTagId;
        if (!libraryExercise.note && oldPlan.note) libraryExercise.note = oldPlan.note;
      }
      const variationMap = new Map([["base", "base"]]);
      oldPlan.variations.forEach(oldVariation => {
        let shared = libraryExercise.variations.find(item => item.startWeek === oldVariation.startWeek && normalizeName(item.name) === normalizeName(oldVariation.name));
        if (!shared) { shared = { ...oldVariation, id: makeId() }; libraryExercise.variations.push(shared); }
        variationMap.set(oldVariation.id, shared.id);
      });
      planMappings.set(oldPlan.id, { exerciseId: libraryExercise.id, variationMap });
      migrated.plans[day.key].push({ id: makeId(), exerciseId: libraryExercise.id });
    }
  }
  for (const [key, rawSession] of Object.entries(previous.sessions || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Array.isArray(rawSession?.exercises)) continue;
    const exercises = rawSession.exercises.map(rawExercise => {
      const oldExercise = normalizeSessionExercise({ ...rawExercise, libraryExerciseId: "" });
      let mapping = planMappings.get(String(rawExercise.planExerciseId || ""));
      if (!mapping) {
        let libraryExercise = exerciseByName.get(normalizeName(oldExercise.name));
        if (!libraryExercise) {
          libraryExercise = normalizeLibraryExercise({ name: oldExercise.name, typeTagId: oldExercise.typeTagId, note: oldExercise.note });
          migrated.library.push(libraryExercise); exerciseByName.set(normalizeName(libraryExercise.name), libraryExercise);
        }
        mapping = { exerciseId: libraryExercise.id, variationMap: new Map([["base", "base"]]) };
      }
      oldExercise.libraryExerciseId = mapping.exerciseId;
      oldExercise.variationId = mapping.variationMap.get(String(rawExercise.variationId || "base")) || "base";
      return oldExercise;
    });
    migrated.sessions[key] = makeSession(key, exercises);
  }
  return migrated;
}
function v1ToV2(legacy) {
  const converted = { selectedDate: defaultSelectedDate(), sessions: {} };
  currentWeek.forEach((date, index) => {
    const exercises = legacy.workouts?.[schedule[index].key];
    if (Array.isArray(exercises) && exercises.length) {
      const key = toDateKey(date);
      converted.sessions[key] = makeSession(key, exercises);
    }
  });
  const selectedIndex = schedule.findIndex(day => day.key === legacy.selectedDay);
  if (selectedIndex >= 0) converted.selectedDate = toDateKey(currentWeek[selectedIndex]);
  return converted;
}
function v2ToV3(previous) {
  const converted = { version: 3, selectedDate: previous.selectedDate, programStartDate: toDateKey(currentWeek[0]), tags: copyDefaultTags(), plans: emptyPlans(), sessions: {} };
  for (const [key, oldSession] of Object.entries(previous.sessions || {})) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(key) && Array.isArray(oldSession?.exercises)) converted.sessions[key] = makeSession(key, oldSession.exercises.map(exercise => ({ ...normalizeSessionExercise(exercise), planExerciseId: "" })));
  }
  for (const day of schedule) {
    const matching = Object.values(converted.sessions).filter(session => session.dayKey === day.key).sort((a, b) => b.date.localeCompare(a.date));
    const latest = matching[0];
    if (!latest) continue;
    converted.plans[day.key] = latest.exercises.map(exercise => ({
      id: makeId(), name: exercise.name, typeTagId: exercise.typeTagId || "", note: exercise.note || "", variations: [],
    }));
    matching.forEach(session => session.exercises.forEach((exercise, index) => {
      const plan = converted.plans[day.key][index] || converted.plans[day.key].find(item => normalizeName(item.name) === normalizeName(exercise.name));
      if (plan) { exercise.planExerciseId = plan.id; exercise.variationId = "base"; }
    }));
  }
  return converted;
}
function persistMigratedState(value) { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); }
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function activeVariation(libraryExercise, dateKey) {
  const week = programWeek(dateKey);
  const eligible = libraryExercise.variations.filter(item => item.startWeek <= week).sort((a, b) => b.startWeek - a.startWeek);
  return eligible[0] || { id: "base", name: libraryExercise.name, startWeek: 1 };
}
function latestPerformance(libraryExerciseId, variationId, beforeDate) {
  const matching = Object.values(state.sessions)
    .filter(session => session.date < beforeDate)
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const session of matching) {
    const exercise = session.exercises.find(item => item.libraryExerciseId === libraryExerciseId && item.variationId === variationId);
    if (exercise) return exercise;
  }
  return null;
}
function exerciseFromAssignment(assignment, dateKey) {
  const libraryExercise = state.library.find(item => item.id === assignment.exerciseId);
  if (!libraryExercise) return null;
  const variation = activeVariation(libraryExercise, dateKey);
  const previous = latestPerformance(libraryExercise.id, variation.id, dateKey);
  return {
    id: makeId(), libraryExerciseId: libraryExercise.id, variationId: variation.id, name: variation.name,
    typeTagId: libraryExercise.typeTagId, difficultyTagId: "", note: libraryExercise.note,
    sets: previous ? previous.sets.map(set => ({ id: makeId(), weight: set.weight, reps: set.reps })) : [],
  };
}
function getSession(dateKey = state.selectedDate) {
  if (!state.sessions[dateKey]) {
    const day = dayForDate(dateKey);
    state.sessions[dateKey] = makeSession(dateKey, state.plans[day.key].map(assignment => exerciseFromAssignment(assignment, dateKey)).filter(Boolean));
    saveState();
  }
  return state.sessions[dateKey];
}
function getLibraryExercise(sessionExercise) { return state.library.find(item => item.id === sessionExercise.libraryExerciseId); }

function render() {
  const session = getSession();
  dayTabs.replaceChildren(...schedule.map((day, index) => {
    const dateKey = toDateKey(currentWeek[index]);
    const button = document.createElement("button");
    button.type = "button"; button.className = `day-tab${dateKey === state.selectedDate ? " active" : ""}`;
    button.innerHTML = `${day.short}<span>${day.workout}</span>`;
    button.setAttribute("aria-label", `${day.label}, ${formatDate(dateKey, "short")}, ${day.workout} workout`);
    button.setAttribute("aria-pressed", String(dateKey === state.selectedDate));
    button.addEventListener("click", () => { state.selectedDate = dateKey; expandedExerciseId = null; saveState(); render(); });
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
  const libraryExercise = getLibraryExercise(exercise);
  if (libraryExercise) {
    exercise.typeTagId = libraryExercise.typeTagId;
    exercise.note = libraryExercise.note;
  }
  card.dataset.exerciseId = exercise.id;
  card.querySelector(".exercise-number").textContent = String(exerciseIndex + 1).padStart(2, "0");
  card.querySelector(".exercise-name").textContent = exercise.name; updateCardMeta(card, exercise);
  const collapseButton = card.querySelector(".exercise-collapse"); const exerciseBody = card.querySelector(".exercise-body");
  setCardExpanded(card, expandedExerciseId === exercise.id);
  collapseButton.addEventListener("click", () => {
    const willOpen = exerciseBody.classList.contains("hidden");
    document.querySelectorAll(".exercise-card.open").forEach(openCard => setCardExpanded(openCard, false));
    expandedExerciseId = willOpen ? exercise.id : null; setCardExpanded(card, willOpen);
  });
  card.querySelector(".remove-exercise").addEventListener("click", () => {
    if (!confirm(`Remove ${exercise.name} from this workout plan? Past history will remain available.`)) return;
    getSession().exercises.splice(exerciseIndex, 1);
    if (libraryExercise) {
      const day = dayForDate(state.selectedDate); state.plans[day.key] = state.plans[day.key].filter(item => item.exerciseId !== libraryExercise.id);
    }
    saveState(); render();
  });
  const setsList = card.querySelector(".sets-list");
  exercise.sets.forEach((set, setIndex) => setsList.append(renderSet(exercise, set, setIndex)));
  card.querySelector(".add-set-button").addEventListener("click", () => {
    exercise.sets.push({ id: makeId(), weight: "", reps: "" }); saveState(); render();
  });

  const details = card.querySelector(".exercise-details"); const detailsToggle = card.querySelector(".details-toggle");
  detailsToggle.textContent = `Details${libraryExercise?.variations.length ? ` · ${libraryExercise.variations.length} var` : ""}`;
  detailsToggle.addEventListener("click", () => {
    const willOpen = details.classList.contains("hidden"); details.classList.toggle("hidden");
    detailsToggle.setAttribute("aria-expanded", String(willOpen)); detailsToggle.textContent = willOpen ? "Close" : `Details${libraryExercise?.variations.length ? ` · ${libraryExercise.variations.length} var` : ""}`;
  });
  const typeSelect = card.querySelector(".type-select"); const difficultySelect = card.querySelector(".difficulty-select");
  fillTagSelect(typeSelect, "type", exercise.typeTagId); fillTagSelect(difficultySelect, "difficulty", exercise.difficultyTagId);
  typeSelect.addEventListener("change", () => {
    exercise.typeTagId = typeSelect.value; if (libraryExercise) libraryExercise.typeTagId = typeSelect.value; saveState(); updateCardMeta(card, exercise);
  });
  difficultySelect.addEventListener("change", () => { exercise.difficultyTagId = difficultySelect.value; saveState(); updateCardMeta(card, exercise); });
  card.querySelector(".manage-tags-button").addEventListener("click", openTagDialog);
  const noteInput = card.querySelector(".note-input"); noteInput.value = exercise.note;
  noteInput.addEventListener("input", () => {
    exercise.note = noteInput.value; if (libraryExercise) libraryExercise.note = noteInput.value; saveState(); updateCardMeta(card, exercise);
  });
  renderVariations(card, exercise, libraryExercise);
  return card;
}
function setCardExpanded(card, expanded) {
  card.classList.toggle("open", expanded);
  card.querySelector(".exercise-body").classList.toggle("hidden", !expanded);
  card.querySelector(".exercise-collapse").setAttribute("aria-expanded", String(expanded));
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

function renderVariations(card, sessionExercise, libraryExercise) {
  const list = card.querySelector(".variation-list"); const form = card.querySelector(".variation-form");
  card.querySelector(".program-week").textContent = `Program week ${programWeek(state.selectedDate)} · active changes persist`;
  card.querySelector(".variation-toggle").addEventListener("click", () => {
    form.classList.toggle("hidden");
    if (!form.classList.contains("hidden")) {
      form.querySelector(".variation-week").value = programWeek(state.selectedDate) + 1; form.querySelector(".variation-name").focus();
    }
  });
  if (!libraryExercise) { list.textContent = "This historical exercise is no longer in the library."; form.classList.add("hidden"); return; }
  const base = { id: "base", name: libraryExercise.name, startWeek: 1 };
  [base, ...libraryExercise.variations.sort((a, b) => a.startWeek - b.startWeek)].forEach(variation => {
    const item = document.createElement("div"); item.className = `variation-item${variation.id === sessionExercise.variationId ? " active" : ""}`;
    const name = document.createElement("span"); name.className = "variation-name-label"; name.textContent = variation.name;
    const week = document.createElement("span"); week.className = "variation-week-label"; week.textContent = `Week ${variation.startWeek}+`;
    item.append(name, week);
    if (variation.id !== "base") {
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "remove-variation"; remove.textContent = "×";
      remove.setAttribute("aria-label", `Remove ${variation.name}`);
      remove.addEventListener("click", () => {
        if (!confirm(`Remove the scheduled variation ${variation.name}?`)) return;
        libraryExercise.variations = libraryExercise.variations.filter(item => item.id !== variation.id);
        syncSelectedExerciseVariation(sessionExercise, libraryExercise); saveState(); render();
      }); item.append(remove);
    }
    list.append(item);
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const name = form.querySelector(".variation-name").value.trim(); const startWeek = Number(form.querySelector(".variation-week").value);
    if (!name || !Number.isInteger(startWeek) || startWeek < 1) return;
    const existing = libraryExercise.variations.find(item => item.startWeek === startWeek);
    if (existing && !confirm(`Week ${startWeek} already has ${existing.name}. Replace it?`)) return;
    libraryExercise.variations = libraryExercise.variations.filter(item => item.startWeek !== startWeek);
    libraryExercise.variations.push({ id: makeId(), name, startWeek });
    syncSelectedExerciseVariation(sessionExercise, libraryExercise); saveState(); render(); showToast(`${name} scheduled for week ${startWeek}`);
  });
}
function syncSelectedExerciseVariation(sessionExercise, libraryExercise) {
  const active = activeVariation(libraryExercise, state.selectedDate);
  if (active.id === sessionExercise.variationId) { sessionExercise.name = active.name; return; }
  const previous = latestPerformance(libraryExercise.id, active.id, state.selectedDate);
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
    button.addEventListener("click", () => { state.selectedDate = session.date; expandedExerciseId = null; saveState(); closeHistory(); render(); }); historyList.append(button);
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
  state.library.forEach(exercise => { if (group === "type" && exercise.typeTagId === id) exercise.typeTagId = ""; });
  Object.values(state.sessions).flatMap(session => session.exercises).forEach(exercise => {
    if (group === "type" && exercise.typeTagId === id) exercise.typeTagId = "";
    if (group === "difficulty" && exercise.difficultyTagId === id) exercise.difficultyTagId = "";
  });
  saveState(); renderTagManager();
}

function renderLibraryOptions(query = "") {
  const day = dayForDate(state.selectedDate); const assigned = new Set(state.plans[day.key].map(item => item.exerciseId));
  const available = state.library
    .filter(exercise => !assigned.has(exercise.id) && normalizeName(exercise.name).includes(normalizeName(query)))
    .sort((a, b) => mostRecentUse(b.id).localeCompare(mostRecentUse(a.id)) || a.name.localeCompare(b.name));
  libraryPicker.classList.toggle("hidden", state.library.length === 0);
  libraryOptions.replaceChildren();
  if (!available.length) {
    const empty = document.createElement("p"); empty.className = "library-empty";
    empty.textContent = query ? "No matching unassigned exercise" : "Every library exercise is already in this workout"; libraryOptions.append(empty); return;
  }
  available.forEach(exercise => {
    const button = document.createElement("button"); button.type = "button"; button.className = "library-option";
    const type = tagById("type", exercise.typeTagId);
    button.innerHTML = `<span class="library-option-name">${escapeHtml(exercise.name)}</span><span class="library-option-meta">${escapeHtml(type?.label || "Exercise")}</span>`;
    button.addEventListener("click", () => addLibraryExercise(exercise)); libraryOptions.append(button);
  });
}
function mostRecentUse(libraryExerciseId) {
  return Object.values(state.sessions).filter(session => session.exercises.some(exercise => exercise.libraryExerciseId === libraryExerciseId))
    .reduce((latest, session) => session.date > latest ? session.date : latest, "");
}
function addLibraryExercise(libraryExercise) {
  const day = dayForDate(state.selectedDate);
  if (state.plans[day.key].some(item => item.exerciseId === libraryExercise.id)) { showToast("Exercise is already in this workout"); return; }
  const assignment = { id: makeId(), exerciseId: libraryExercise.id };
  state.plans[day.key].push(assignment); const sessionExercise = exerciseFromAssignment(assignment, state.selectedDate);
  if (sessionExercise) { getSession().exercises.push(sessionExercise); expandedExerciseId = sessionExercise.id; }
  saveState(); closeExerciseForm(); render(); showToast(`${libraryExercise.name} added from library`);
}
function closeExerciseForm() {
  exerciseForm.reset(); exerciseForm.classList.add("hidden"); librarySearch.value = "";
}
$("#showExerciseFormButton").addEventListener("click", () => {
  exerciseForm.classList.remove("hidden"); renderLibraryOptions();
  if (state.library.length) librarySearch.focus(); else exerciseName.focus();
});
librarySearch.addEventListener("input", () => renderLibraryOptions(librarySearch.value));
$("#cancelExerciseButton").addEventListener("click", closeExerciseForm);
exerciseForm.addEventListener("submit", event => {
  event.preventDefault(); const name = exerciseName.value.trim(); if (!name) return;
  const existing = state.library.find(exercise => normalizeName(exercise.name) === normalizeName(name));
  if (existing) { addLibraryExercise(existing); return; }
  const libraryExercise = { id: makeId(), name, typeTagId: "", note: "", variations: [] };
  state.library.push(libraryExercise); addLibraryExercise(libraryExercise);
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
  saveState(); const backup = { app: "Rep Routine", version: 4, exportedAt: new Date().toISOString(), data: state };
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
    if (candidate?.version === 4 && candidate.library && candidate.plans && candidate.sessions) imported = normalizeV4(candidate);
    else if (candidate?.version === 3 && candidate.plans && candidate.sessions) imported = migrateV3(candidate);
    else if (candidate?.sessions) imported = migrateV3(v2ToV3(candidate));
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
