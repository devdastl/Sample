import {
  copyDefaultTags, currentWeek, dayForDate, defaultSelectedDate, defaultTags, emptyPlans,
  makeId, makeSession, normalizeName, schedule, toDateKey,
} from "./core.js?v=20260904-4";

const STORAGE_KEY = "rep-routine-v5";
const V4_STORAGE_KEY = "rep-routine-v4";
const V3_STORAGE_KEY = "rep-routine-v3";
const V2_STORAGE_KEY = "rep-routine-v2";
const V1_STORAGE_KEY = "rep-routine-v1";

export function createInitialState() {
  return { version: 5, selectedDate: defaultSelectedDate(), programStartDate: toDateKey(currentWeek[0]), tags: copyDefaultTags(), library: [], plans: emptyPlans(), sessions: {} };
}

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

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.version === 5) return normalizeV5(saved);
    const v4 = JSON.parse(localStorage.getItem(V4_STORAGE_KEY)); if (v4?.version === 4) return persistAndReturn(migrateV4(v4));
    const v3 = JSON.parse(localStorage.getItem(V3_STORAGE_KEY)); if (v3?.version === 3) return persistAndReturn(migrateV4(migrateV3ToV4(v3)));
    const v2 = JSON.parse(localStorage.getItem(V2_STORAGE_KEY)); if (v2?.sessions) return persistAndReturn(migrateV4(migrateV3ToV4(v2ToV3(v2))));
    const v1 = JSON.parse(localStorage.getItem(V1_STORAGE_KEY)); if (v1?.workouts) return persistAndReturn(migrateV4(migrateV3ToV4(v2ToV3(v1ToV2(v1)))));
  } catch {}
  return createInitialState();
}
function persistAndReturn(value) { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); return value; }

export let state = loadState();
export function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
export function replaceState(nextState) { state = nextState; }
export function resetState() { state = createInitialState(); saveState(); return state; }
export function compactLatestState(candidate) {
  const compact = normalizeV5(candidate); const seenExercises = new Set(); const latestSessions = {};
  Object.values(compact.sessions).sort((a, b) => b.date.localeCompare(a.date)).forEach(session => {
    const latestExercises = session.exercises.filter(exercise => {
      const key = exercise.libraryExerciseId || `name:${normalizeName(exercise.name)}`;
      if (seenExercises.has(key)) return false; seenExercises.add(key); return true;
    });
    if (latestExercises.length) latestSessions[session.date] = makeSession(session.date, latestExercises);
  });
  compact.sessions = latestSessions; return compact;
}
export function normalizeImportedState(candidate) {
  let imported;
  if (candidate?.version === 5) imported = normalizeV5(candidate);
  else if (candidate?.version === 4) imported = migrateV4(candidate);
  else if (candidate?.version === 3) imported = migrateV4(migrateV3ToV4(candidate));
  else if (candidate?.sessions) imported = migrateV4(migrateV3ToV4(v2ToV3(candidate)));
  else throw new Error("Invalid backup");
  return compactLatestState(imported);
}
