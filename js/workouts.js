import { currentWeek, dayForDate, fromDateKey, makeId, makeSession, normalizeName, startOfDay, toDateKey } from "./core.js?v=20260904-1";
import { saveState, state } from "./storage.js?v=20260904-1";

export function programWeek(dateKey) {
  const difference = startOfDay(fromDateKey(dateKey)) - startOfDay(fromDateKey(state.programStartDate));
  return Math.max(1, Math.floor(difference / 604800000) + 1);
}
export function libraryExercise(id) { return state.library.find(item => item.id === id); }
export function activeScheduleItem(slot, dateKey) {
  const week = programWeek(dateKey);
  return [...slot.schedule].filter(item => item.startWeek <= week).sort((a, b) => b.startWeek - a.startWeek)[0]
    || [...slot.schedule].sort((a, b) => a.startWeek - b.startWeek)[0];
}
export function latestPerformance(exerciseId, beforeDate) {
  const sessions = Object.values(state.sessions).filter(session => session.date < beforeDate).sort((a, b) => b.date.localeCompare(a.date));
  for (const session of sessions) {
    const exercise = session.exercises.find(item => item.libraryExerciseId === exerciseId);
    if (exercise) return exercise;
  }
  return null;
}
export function exerciseFromSlot(slot, dateKey) {
  const scheduled = activeScheduleItem(slot, dateKey); const definition = libraryExercise(scheduled?.exerciseId); if (!definition) return null;
  const previous = latestPerformance(definition.id, dateKey);
  return {
    id: makeId(), slotId: slot.id, libraryExerciseId: definition.id, name: definition.name,
    typeTagId: definition.typeTagId, difficultyTagId: "", note: definition.note,
    sets: previous ? previous.sets.map(set => ({ id: makeId(), weight: set.weight, reps: set.reps })) : [],
  };
}
export function getSession(dateKey = state.selectedDate) {
  if (!state.sessions[dateKey]) {
    const day = dayForDate(dateKey);
    state.sessions[dateKey] = makeSession(dateKey, state.plans[day.key].map(slot => exerciseFromSlot(slot, dateKey)).filter(Boolean));
    saveState();
  }
  return state.sessions[dateKey];
}
export function isCurrentWeekDate(dateKey) { return currentWeek.some(date => toDateKey(date) === dateKey); }
export function syncDefinitionToCurrentSessions(definition) {
  Object.values(state.sessions).filter(session => isCurrentWeekDate(session.date)).forEach(session => session.exercises.filter(item => item.libraryExerciseId === definition.id).forEach(item => { item.name = definition.name; item.typeTagId = definition.typeTagId; item.note = definition.note; }));
}
export function updateExerciseNote(exercise, note) {
  const value = String(note ?? "").slice(0, 500); const definition = libraryExercise(exercise.libraryExerciseId);
  if (definition && isCurrentWeekDate(state.selectedDate)) {
    definition.note = value; syncDefinitionToCurrentSessions(definition);
  } else {
    // Historical or deleted-library exercises retain their independent snapshots.
    exercise.note = value;
  }
  saveState();
}
export function syncSelectedSessionToPlan() {
  if (!isCurrentWeekDate(state.selectedDate)) return;
  const session = getSession(); const day = dayForDate(state.selectedDate);
  session.exercises = state.plans[day.key].map(slot => {
    const active = activeScheduleItem(slot, state.selectedDate); const existing = session.exercises.find(exercise => exercise.slotId === slot.id);
    if (existing && existing.libraryExerciseId === active?.exerciseId) return existing;
    return exerciseFromSlot(slot, state.selectedDate);
  }).filter(Boolean);
  saveState();
}
export function createLibraryExercise(name) {
  const existing = state.library.find(item => normalizeName(item.name) === normalizeName(name)); if (existing) return existing;
  const exercise = { id: makeId(), name: name.trim().slice(0, 50), typeTagId: "", note: "", archived: false };
  state.library.push(exercise); saveState(); return exercise;
}
export function tagById(group, id) { return state.tags[group].find(tag => tag.id === id); }
export function fillTagSelect(select, group, selectedId) {
  select.replaceChildren(new Option(group === "type" ? "Not classified" : "Difficulty", ""));
  state.tags[group].forEach(tag => select.add(new Option(tag.label, tag.id)));
  select.value = state.tags[group].some(tag => tag.id === selectedId) ? selectedId : "";
}
