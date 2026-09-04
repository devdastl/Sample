import { $ } from "./core.js?v=20260904-7";

export function initTimer() {
  const display = $("#timerDisplay"); const toggle = $("#timerToggle"); const customForm = $("#customTimerForm");
  const timer = { selectedSeconds: 60, remaining: 60, intervalId: null, endsAt: null };
  let audioContext;

  function selectTimer(seconds) {
    stopTimer(); timer.selectedSeconds = seconds; timer.remaining = seconds;
    document.querySelectorAll(".timer-preset").forEach(button => button.classList.toggle("active", Number(button.dataset.seconds) === seconds)); updateDisplay();
  }
  function updateDisplay() {
    const minutes = Math.floor(timer.remaining / 60); const seconds = timer.remaining % 60;
    display.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    document.title = timer.intervalId ? `${display.textContent} · Rep Routine` : "Rep Routine";
  }
  function startTimer() {
    prepareAudio(); if (timer.remaining <= 0) timer.remaining = timer.selectedSeconds;
    timer.endsAt = Date.now() + timer.remaining * 1000; timer.intervalId = window.setInterval(tick, 250);
    toggle.textContent = "Pause"; toggle.classList.add("running"); tick();
  }
  function stopTimer() {
    window.clearInterval(timer.intervalId); timer.intervalId = null; timer.endsAt = null;
    toggle.textContent = "Start"; toggle.classList.remove("running");
  }
  function tick() {
    timer.remaining = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000)); updateDisplay();
    if (timer.remaining === 0) { stopTimer(); playAlert(); selectTimer(60); }
  }
  function playAlert() {
    if (navigator.vibrate) navigator.vibrate([180, 90, 180, 90, 180]);
    try {
      const audio = prepareAudio();
      Array.from({ length: 10 }, (_, index) => index * .3).forEach(delay => {
        const oscillator = audio.createOscillator(); const gain = audio.createGain(); const start = audio.currentTime + delay;
        oscillator.frequency.value = 920; oscillator.connect(gain); gain.connect(audio.destination);
        gain.gain.setValueAtTime(.001, start); gain.gain.exponentialRampToValueAtTime(.24, start + .02); gain.gain.exponentialRampToValueAtTime(.001, start + .2);
        oscillator.start(start); oscillator.stop(start + .22);
      });
    } catch {}
  }
  function prepareAudio() {
    if (!audioContext) { const AudioContextClass = window.AudioContext || window.webkitAudioContext; audioContext = new AudioContextClass(); }
    if (audioContext.state === "suspended") audioContext.resume(); return audioContext;
  }

  document.querySelectorAll(".timer-preset[data-seconds]").forEach(button => button.addEventListener("click", () => selectTimer(Number(button.dataset.seconds))));
  toggle.addEventListener("click", () => timer.intervalId ? stopTimer() : startTimer());
  $("#customTimerButton").addEventListener("click", () => { customForm.classList.toggle("hidden"); if (!customForm.classList.contains("hidden")) $("#customSeconds").focus(); });
  customForm.addEventListener("submit", event => { event.preventDefault(); const seconds = Number($("#customSeconds").value); if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) return; selectTimer(seconds); customForm.reset(); customForm.classList.add("hidden"); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && timer.intervalId) tick(); }); updateDisplay();
  return { isActive: () => Boolean(timer.intervalId) };
}
