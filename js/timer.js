import { $ } from "./core.js?v=20260904-3";

const MAX_NOTIFICATION_DELAY_MS = 5 * 60 * 1000;

export function initTimer({ onComplete = () => {} } = {}) {
  const display = $("#timerDisplay"); const toggle = $("#timerToggle"); const customForm = $("#customTimerForm");
  const panel = $("#timerPanel"); const label = $("#timerLabel");
  const timer = { selectedSeconds: 60, remaining: 60, intervalId: null, endsAt: null };

  function selectTimer(seconds) {
    stopTimer(); setComplete(false); timer.selectedSeconds = seconds; timer.remaining = seconds;
    document.querySelectorAll(".timer-preset").forEach(button => button.classList.toggle("active", Number(button.dataset.seconds) === seconds)); updateDisplay();
  }
  function updateDisplay() {
    const minutes = Math.floor(timer.remaining / 60); const seconds = timer.remaining % 60;
    display.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    document.title = timer.intervalId ? `${display.textContent} · Rep Routine` : "Rep Routine";
  }
  function startTimer() {
    setComplete(false); if (timer.remaining <= 0) timer.remaining = timer.selectedSeconds;
    timer.endsAt = Date.now() + timer.remaining * 1000; timer.intervalId = window.setInterval(tick, 250);
    toggle.textContent = "Pause"; toggle.classList.add("running"); tick();
  }
  function stopTimer() {
    window.clearInterval(timer.intervalId); timer.intervalId = null; timer.endsAt = null;
    toggle.textContent = "Start"; toggle.classList.remove("running");
  }
  function tick() {
    timer.remaining = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000)); updateDisplay();
    if (timer.remaining === 0) {
      const lateByMs = Math.max(0, Date.now() - timer.endsAt); stopTimer(); toggle.textContent = "Again"; setComplete(true);
      if (lateByMs <= MAX_NOTIFICATION_DELAY_MS) Promise.resolve(onComplete()).catch(() => {});
    }
  }
  function setComplete(complete) {
    panel.classList.toggle("complete", complete); label.textContent = complete ? "Rest finished" : "Rest timer";
  }

  document.querySelectorAll(".timer-preset[data-seconds]").forEach(button => button.addEventListener("click", () => selectTimer(Number(button.dataset.seconds))));
  toggle.addEventListener("click", () => timer.intervalId ? stopTimer() : startTimer());
  $("#customTimerButton").addEventListener("click", () => { customForm.classList.toggle("hidden"); if (!customForm.classList.contains("hidden")) $("#customSeconds").focus(); });
  customForm.addEventListener("submit", event => { event.preventDefault(); const seconds = Number($("#customSeconds").value); if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) return; selectTimer(seconds); customForm.reset(); customForm.classList.add("hidden"); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && timer.intervalId) tick(); }); updateDisplay();
  return { isActive: () => Boolean(timer.intervalId) };
}
