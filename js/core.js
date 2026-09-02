export const schedule = [
  { key: "monday", short: "Mon", label: "Monday", workout: "Pull" },
  { key: "tuesday", short: "Tue", label: "Tuesday", workout: "Push" },
  { key: "wednesday", short: "Wed", label: "Wednesday", workout: "Legs" },
  { key: "thursday", short: "Thu", label: "Thursday", workout: "Pull" },
  { key: "friday", short: "Fri", label: "Friday", workout: "Push" },
];

export const defaultTags = {
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

export function $(selector) { return document.querySelector(selector); }
export function startOfDay(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
export function toDateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
export function fromDateKey(key) { const [year, month, day] = key.split("-").map(Number); return new Date(year, month - 1, day); }
export function getWeekDates(date) {
  const monday = new Date(date); monday.setDate(date.getDate() + (date.getDay() === 0 ? -6 : 1 - date.getDay()));
  return schedule.map((_, index) => { const result = new Date(monday); result.setDate(monday.getDate() + index); return result; });
}

export const today = startOfDay(new Date());
export const currentWeek = getWeekDates(today);

export function defaultSelectedDate() {
  const day = today.getDay(); return toDateKey(currentWeek[day >= 1 && day <= 5 ? day - 1 : 0]);
}
export function makeId() { return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`; }
export function normalizeName(name) { return String(name || "").trim().toLocaleLowerCase().replace(/\s+/g, " "); }
export function copyDefaultTags() { return JSON.parse(JSON.stringify(defaultTags)); }
export function emptyPlans() { return Object.fromEntries(schedule.map(day => [day.key, []])); }
export function dayForDate(dateKey) { return schedule[Math.min(Math.max(fromDateKey(dateKey).getDay() - 1, 0), 4)]; }
export function makeSession(dateKey, exercises = []) { const day = dayForDate(dateKey); return { date: dateKey, dayKey: day.key, workout: day.workout, exercises }; }
export function formatDate(dateKey, style) { return fromDateKey(dateKey).toLocaleDateString(undefined, style === "long" ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" }); }
export function escapeHtml(value) { const element = document.createElement("span"); element.textContent = value; return element.innerHTML; }
