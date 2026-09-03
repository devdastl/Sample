import { $, currentWeek, dayForDate, escapeHtml, makeId, normalizeName, schedule, toDateKey } from "./core.js?v=20260903-5";
import { saveState, state } from "./storage.js?v=20260903-5";
import {
  activeScheduleItem, createLibraryExercise, fillTagSelect, isCurrentWeekDate,
  libraryExercise, programWeek, syncDefinitionToCurrentSessions, syncSelectedSessionToPlan, tagById,
} from "./workouts.js?v=20260903-5";

export function initManager({ closeHistory, renderApp, showToast }) {
  const drawer = $("#manageDrawer"); const backdrop = $("#manageBackdrop"); const tagDialog = $("#tagDialog");
  let activeView = "plan";

  function openLibraryCreate(prefill = "") {
    activeView = "library"; renderManage(); $("#libraryCreateForm").classList.remove("hidden");
    $("#libraryCreateName").value = prefill; $("#libraryCreateName").focus();
  }

  function openManage(view = "plan") {
    closeHistory();
    if (view === "plan" && !isCurrentWeekDate(state.selectedDate)) {
      const dayKey = dayForDate(state.selectedDate).key; const index = schedule.findIndex(day => day.key === dayKey);
      state.selectedDate = toDateKey(currentWeek[Math.max(0, index)]); saveState(); renderApp();
    }
    activeView = view; renderManage(); drawer.classList.add("open"); backdrop.classList.remove("hidden");
    drawer.setAttribute("aria-hidden", "false"); document.body.style.overflow = "hidden";
  }
  function closeManage() {
    drawer.classList.remove("open"); backdrop.classList.add("hidden"); drawer.setAttribute("aria-hidden", "true");
    document.body.style.overflow = ""; renderApp();
  }
  function renderManage() {
    document.querySelectorAll(".manage-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.manageView === activeView));
    $("#planManager").classList.toggle("hidden", activeView !== "plan"); $("#libraryManager").classList.toggle("hidden", activeView !== "library");
    if (activeView === "plan") renderPlanManager(); else renderLibraryManager();
  }
  function renderPlanManager() {
    const day = dayForDate(state.selectedDate); $("#planDayLabel").textContent = `${day.label} · Program week ${programWeek(state.selectedDate)}`;
    const list = $("#planSlotList"); list.replaceChildren(); const slots = state.plans[day.key];
    if (!slots.length) { const empty = document.createElement("p"); empty.className = "manager-empty"; empty.textContent = "No exercises in this workout yet."; list.append(empty); }
    slots.forEach((slot, index) => list.append(renderPlanSlot(slot, index, slots, day)));
    renderPlanPickerOptions($("#planSearch").value);
  }
  function renderPlanSlot(slot, index, slots, day) {
    const card = document.createElement("article"); card.className = "plan-slot";
    const active = activeScheduleItem(slot, state.selectedDate); const activeExercise = libraryExercise(active?.exerciseId);
    card.innerHTML = `<div class="slot-header"><span class="slot-title">${escapeHtml(activeExercise?.name || "Missing exercise")}</span><span class="slot-actions"></span></div><div class="slot-schedule"></div>`;
    const actions = card.querySelector(".slot-actions");
    for (const [label, delta] of [["↑", -1], ["↓", 1]]) {
      const button = document.createElement("button"); button.type = "button"; button.className = "slot-action"; button.textContent = label;
      button.disabled = index + delta < 0 || index + delta >= slots.length;
      button.addEventListener("click", () => { [slots[index], slots[index + delta]] = [slots[index + delta], slots[index]]; syncSelectedSessionToPlan(); renderManage(); renderApp(); }); actions.append(button);
    }
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "slot-action danger"; remove.textContent = "×"; remove.setAttribute("aria-label", "Remove workout slot");
    remove.addEventListener("click", () => { if (!confirm("Remove this exercise slot from the workout plan? Past sessions will remain.")) return; state.plans[day.key].splice(index, 1); syncSelectedSessionToPlan(); saveState(); renderManage(); renderApp(); }); actions.append(remove);
    const scheduleList = card.querySelector(".slot-schedule");
    [...slot.schedule].sort((a, b) => a.startWeek - b.startWeek).forEach(item => {
      const exercise = libraryExercise(item.exerciseId); const row = document.createElement("div"); row.className = `schedule-row${item.id === active?.id ? " active" : ""}`;
      row.innerHTML = `<span>W${item.startWeek}+</span><span class="schedule-name">${escapeHtml(exercise?.name || "Deleted exercise")}</span>`;
      const deleteButton = document.createElement("button"); deleteButton.type = "button"; deleteButton.className = "schedule-remove"; deleteButton.textContent = slot.schedule.length > 1 ? "×" : ""; deleteButton.disabled = slot.schedule.length <= 1;
      deleteButton.addEventListener("click", () => { slot.schedule = slot.schedule.filter(entry => entry.id !== item.id); syncSelectedSessionToPlan(); saveState(); renderManage(); renderApp(); }); row.append(deleteButton); scheduleList.append(row);
    });
    const add = document.createElement("button"); add.type = "button"; add.className = "schedule-add"; add.textContent = "＋ Schedule replacement"; scheduleList.append(add);
    const form = document.createElement("div"); form.className = "schedule-form hidden";
    form.innerHTML = `<input type="search" placeholder="Search or create exercise"><input type="number" min="1" max="520" inputmode="numeric" value="${programWeek(state.selectedDate) + 1}" aria-label="Starting week"><div class="schedule-results"></div>`; scheduleList.append(form);
    add.addEventListener("click", () => { form.classList.toggle("hidden"); if (!form.classList.contains("hidden")) { form.querySelector("input[type=search]").focus(); renderScheduleChoices(form, slot); } });
    form.querySelector("input[type=search]").addEventListener("input", () => renderScheduleChoices(form, slot)); return card;
  }
  function renderScheduleChoices(form, slot) {
    const query = form.querySelector("input[type=search]").value.trim(); const results = form.querySelector(".schedule-results"); results.replaceChildren();
    const scheduledIds = new Set(slot.schedule.map(item => item.exerciseId));
    state.library.filter(item => !item.archived && !scheduledIds.has(item.id) && normalizeName(item.name).includes(normalizeName(query))).slice(0, 8).forEach(exercise => {
      const choice = document.createElement("button"); choice.type = "button"; choice.className = "schedule-choice"; choice.textContent = exercise.name;
      choice.addEventListener("click", () => scheduleExercise(slot, exercise, form)); results.append(choice);
    });
    if (query && !state.library.some(item => normalizeName(item.name) === normalizeName(query))) {
      const create = document.createElement("button"); create.type = "button"; create.className = "schedule-choice"; create.textContent = `＋ Create “${query}”`;
      create.addEventListener("click", () => openLibraryCreate(query)); results.append(create);
    }
  }
  function scheduleExercise(slot, exercise, form) {
    const week = Number(form.querySelector("input[type=number]").value); if (!Number.isInteger(week) || week < 1) { showToast("Choose a valid starting week"); return; }
    const existing = slot.schedule.find(item => item.startWeek === week); if (existing && !confirm(`Replace the exercise already scheduled for week ${week}?`)) return;
    slot.schedule = slot.schedule.filter(item => item.startWeek !== week); slot.schedule.push({ id: makeId(), exerciseId: exercise.id, startWeek: week });
    syncSelectedSessionToPlan(); saveState(); renderManage(); renderApp(); showToast(`${exercise.name} scheduled for week ${week}`);
  }
  function renderPlanPickerOptions(query = "") {
    const results = $("#planPickerOptions"); results.replaceChildren(); const day = dayForDate(state.selectedDate);
    const used = new Set(state.plans[day.key].flatMap(slot => slot.schedule.map(item => item.exerciseId)));
    const choices = state.library.filter(item => !item.archived && !used.has(item.id) && normalizeName(item.name).includes(normalizeName(query))).sort((a, b) => a.name.localeCompare(b.name));
    if (!choices.length) { const empty = document.createElement("p"); empty.className = "library-empty"; empty.textContent = "No matching available exercises"; results.append(empty); return; }
    choices.slice(0, 12).forEach(exercise => { const button = document.createElement("button"); button.type = "button"; button.className = "library-option"; button.innerHTML = `<span class="library-option-name">${escapeHtml(exercise.name)}</span><span class="library-option-meta">Add</span>`; button.addEventListener("click", () => addSlot(exercise)); results.append(button); });
  }
  function addSlot(exercise) {
    const day = dayForDate(state.selectedDate); state.plans[day.key].push({ id: makeId(), schedule: [{ id: makeId(), exerciseId: exercise.id, startWeek: 1 }] });
    $("#planPicker").classList.add("hidden"); $("#planSearch").value = ""; syncSelectedSessionToPlan(); saveState(); renderManage(); renderApp(); showToast(`${exercise.name} added to ${day.label}`);
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
    const name = details.querySelector(".library-name"); name.value = exercise.name;
    name.addEventListener("change", () => { const next = name.value.trim(); const duplicate = state.library.find(item => item.id !== exercise.id && normalizeName(item.name) === normalizeName(next)); if (!next || duplicate) { showToast(duplicate ? "An exercise with that name already exists" : "Name cannot be empty"); name.value = exercise.name; return; } exercise.name = next; syncDefinitionToCurrentSessions(exercise); saveState(); renderLibraryManager(); renderApp(); });
    const typeSelect = details.querySelector(".library-type"); fillTagSelect(typeSelect, "type", exercise.typeTagId); typeSelect.addEventListener("change", () => { exercise.typeTagId = typeSelect.value; syncDefinitionToCurrentSessions(exercise); saveState(); renderApp(); });
    const note = details.querySelector(".library-note"); note.value = exercise.note; note.addEventListener("input", () => { exercise.note = note.value; syncDefinitionToCurrentSessions(exercise); saveState(); });
    details.querySelector(".archive-button").addEventListener("click", () => { exercise.archived = !exercise.archived; saveState(); renderLibraryManager(); showToast(exercise.archived ? "Exercise archived" : "Exercise restored"); });
    details.querySelector(".delete-library-button").addEventListener("click", () => deleteLibraryExercise(exercise)); return details;
  }
  function deleteLibraryExercise(exercise) {
    if (!confirm(`Permanently delete ${exercise.name} from the library and every future plan? Workout history will remain readable.`)) return;
    state.library = state.library.filter(item => item.id !== exercise.id);
    for (const day of schedule) state.plans[day.key] = state.plans[day.key].map(slot => ({ ...slot, schedule: slot.schedule.filter(item => item.exerciseId !== exercise.id) })).filter(slot => slot.schedule.length);
    syncSelectedSessionToPlan(); saveState(); renderLibraryManager(); renderApp(); showToast("Exercise deleted from library");
  }
  function renderTagManager() {
    for (const group of ["type", "difficulty"]) {
      const container = $(`#${group}TagList`); container.replaceChildren(); state.tags[group].forEach(tag => {
        const item = document.createElement("span"); item.className = "managed-tag"; const label = document.createElement("span"); label.textContent = tag.label; item.append(label);
        if (!tag.builtin) {
          const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "✎"; edit.addEventListener("click", () => { const next = prompt("Rename tag", tag.label)?.trim(); if (next) { tag.label = next.slice(0, 20); saveState(); renderTagManager(); } });
          const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×"; remove.addEventListener("click", () => deleteTag(group, tag.id)); item.append(edit, remove);
        }
        container.append(item);
      });
    }
  }
  function deleteTag(group, id) {
    if (!confirm("Delete this tag and remove it from all exercises?")) return; state.tags[group] = state.tags[group].filter(tag => tag.id !== id);
    state.library.forEach(exercise => { if (group === "type" && exercise.typeTagId === id) exercise.typeTagId = ""; });
    Object.values(state.sessions).flatMap(session => session.exercises).forEach(exercise => { if (group === "type" && exercise.typeTagId === id) exercise.typeTagId = ""; if (group === "difficulty" && exercise.difficultyTagId === id) exercise.difficultyTagId = ""; });
    saveState(); renderTagManager();
  }

  $("#manageButton").addEventListener("click", () => openManage("plan")); $("#openManageFromWorkout").addEventListener("click", () => openManage("plan"));
  $("#closeManageButton").addEventListener("click", closeManage); backdrop.addEventListener("click", closeManage);
  document.querySelectorAll(".manage-tab").forEach(tab => tab.addEventListener("click", () => { activeView = tab.dataset.manageView; renderManage(); }));
  $("#showPlanPickerButton").addEventListener("click", () => { $("#planPicker").classList.toggle("hidden"); renderPlanPickerOptions(); if (!$("#planPicker").classList.contains("hidden")) $("#planSearch").focus(); });
  $("#planSearch").addEventListener("input", () => renderPlanPickerOptions($("#planSearch").value));
  $("#createFromPlanButton").addEventListener("click", () => openLibraryCreate($("#planSearch").value.trim()));
  $("#showLibraryCreateButton").addEventListener("click", () => { $("#libraryCreateForm").classList.toggle("hidden"); if (!$("#libraryCreateForm").classList.contains("hidden")) $("#libraryCreateName").focus(); });
  $("#libraryCreateForm").addEventListener("submit", event => { event.preventDefault(); const input = $("#libraryCreateName"); const name = input.value.trim(); if (!name) return; const existing = state.library.find(item => normalizeName(item.name) === normalizeName(name)); if (existing) { showToast("That exercise already exists"); return; } createLibraryExercise(name); input.value = ""; $("#libraryCreateForm").classList.add("hidden"); renderLibraryManager(); });
  $("#manageLibrarySearch").addEventListener("input", renderLibraryManager); $("#manageTagsFromLibrary").addEventListener("click", () => { renderTagManager(); tagDialog.showModal(); });
  $("#closeTagDialogButton").addEventListener("click", () => tagDialog.close()); tagDialog.addEventListener("close", () => { renderManage(); renderApp(); });
  document.querySelectorAll(".tag-form").forEach(form => form.addEventListener("submit", event => { event.preventDefault(); const group = form.dataset.group; const input = form.querySelector("input"); const label = input.value.trim(); if (!label) return; if (state.tags[group].some(tag => tag.label.toLowerCase() === label.toLowerCase())) { showToast("That tag already exists"); return; } state.tags[group].push({ id: `${group}-${makeId()}`, label, builtin: false }); saveState(); input.value = ""; renderTagManager(); }));

  return { closeManage, openManage, renderManage, isOpen: () => drawer.classList.contains("open") };
}
