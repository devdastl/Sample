import { $ } from "./core.js?v=20260904-5";

export const APP_VERSION = "2.0.2";

function requestWorkerUpdate(worker) {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => resolve({ ok: false, reason: "The update did not respond." }), 4000);
    channel.port1.onmessage = event => { window.clearTimeout(timeout); resolve(event.data || { ok: false }); };
    worker.postMessage({ type: "PREPARE_UPDATE" }, [channel.port2]);
  });
}

export function initPwa({ canApplyUpdate }) {
  const version = $("#appVersion");
  const status = $("#pwaStatusText");
  const installButton = $("#installAppButton");
  const banner = $("#updateBanner");
  const message = $("#updateMessage");
  const applyButton = $("#applyUpdateButton");
  let installPrompt = null;
  let waitingWorker = null;
  let reloading = false;
  let installed = window.matchMedia("(display-mode: standalone)").matches || Boolean(navigator.standalone);
  const hadController = Boolean(navigator.serviceWorker?.controller);

  version.textContent = APP_VERSION;
  const updateConnectionStatus = () => {
    if (!("serviceWorker" in navigator)) status.textContent = "Offline installation is not supported by this browser.";
    else if (!navigator.onLine) status.textContent = `${installed ? "Installed · " : ""}Offline · workout data is saved on this device.`;
    else if (navigator.serviceWorker.controller) status.textContent = `${installed ? "Installed · " : ""}Offline ready · updates check automatically.`;
    else status.textContent = "Preparing offline access. Reopen the app after setup.";
  };
  const showWaiting = worker => { waitingWorker = worker; message.textContent = "A new version is ready."; banner.classList.remove("hidden"); };
  const watchInstalling = registration => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) showWaiting(worker);
      updateConnectionStatus();
    });
  };

  window.addEventListener("online", updateConnectionStatus);
  window.addEventListener("offline", updateConnectionStatus);
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault(); installPrompt = event; installButton.classList.remove("hidden");
  });
  window.addEventListener("appinstalled", () => { installed = true; installPrompt = null; installButton.classList.add("hidden"); status.textContent = "Installed · offline ready after setup completes."; });
  installButton.addEventListener("click", async () => {
    if (!installPrompt) return;
    installButton.disabled = true; await installPrompt.prompt(); const choice = await installPrompt.userChoice;
    installPrompt = null; installButton.classList.add("hidden"); installButton.disabled = false;
    status.textContent = choice.outcome === "accepted" ? "Installing…" : "Install canceled. You can use the browser menu later.";
  });
  $("#laterUpdateButton").addEventListener("click", () => banner.classList.add("hidden"));
  applyButton.addEventListener("click", async () => {
    if (!waitingWorker) return;
    const reason = canApplyUpdate();
    if (reason) { message.textContent = reason; return; }
    applyButton.disabled = true; reloading = true; message.textContent = "Checking open app windows…";
    const result = await requestWorkerUpdate(waitingWorker);
    if (!result.ok) { reloading = false; message.textContent = result.reason || "Close other Rep Routine windows, then try again."; applyButton.disabled = false; return; }
    message.textContent = "Updating…";
  });

  updateConnectionStatus();
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    updateConnectionStatus();
    if (hadController && reloading) window.location.reload();
  });
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./sw.js", { scope: "./", updateViaCache: "none" });
      updateConnectionStatus();
      if (registration.waiting && navigator.serviceWorker.controller) showWaiting(registration.waiting);
      registration.addEventListener("updatefound", () => watchInstalling(registration));
      window.setTimeout(() => registration.update().catch(() => {}), 1500);
    } catch { status.textContent = navigator.onLine ? "Offline setup failed. Reload while online to retry." : "Offline setup needs one successful online visit."; }
  });
}
