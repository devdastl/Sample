import { $ } from "./core.js?v=20260904-4";

export const APP_VERSION = "2.0.1";

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
  const notificationStatus = $("#notificationStatusText");
  const notificationButton = $("#notificationButton");
  let installPrompt = null;
  let waitingWorker = null;
  let reloading = false;
  let installed = window.matchMedia("(display-mode: standalone)").matches || Boolean(navigator.standalone);
  const hadController = Boolean(navigator.serviceWorker?.controller);
  const supportsNotifications = "Notification" in window && "serviceWorker" in navigator
    && "ServiceWorkerRegistration" in window && "showNotification" in ServiceWorkerRegistration.prototype;

  const showSystemNotification = async (title, body, tag) => {
    if (!supportsNotifications || Notification.permission !== "granted") return false;
    const registration = await navigator.serviceWorker.getRegistration("./");
    if (!registration?.active) return false;
    const base = registration.scope;
    await registration.showNotification(title, {
      body,
      icon: new URL("icons/icon-192.png", base).href,
      tag,
      renotify: true,
      timestamp: Date.now(),
      data: { url: base },
    });
    return true;
  };
  const showTimerCompletionNotification = () => showSystemNotification(
    "Rest finished",
    "Ready for your next set.",
    "rep-routine-rest-finished",
  );
  const updateNotificationStatus = () => {
    if (!notificationStatus || !notificationButton) return;
    if (!supportsNotifications) {
      notificationStatus.textContent = "System notifications are not supported by this browser.";
      notificationButton.textContent = "Unavailable"; notificationButton.disabled = true; return;
    }
    if (Notification.permission === "granted") {
      notificationStatus.textContent = "Enabled · uses your phone's notification sound and vibration settings.";
      notificationButton.textContent = "Test alert"; notificationButton.disabled = false; return;
    }
    if (Notification.permission === "denied") {
      notificationStatus.textContent = "Blocked · allow Rep Routine notifications in your browser or app settings.";
      notificationButton.textContent = "Blocked"; notificationButton.disabled = true; return;
    }
    notificationStatus.textContent = "Enable one alert when a rest timer finishes.";
    notificationButton.textContent = "Enable alerts"; notificationButton.disabled = false;
  };

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
  window.addEventListener("focus", updateNotificationStatus);
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
  notificationButton?.addEventListener("click", async () => {
    if (!supportsNotifications) return;
    notificationButton.disabled = true;
    try {
      if (Notification.permission === "default") await Notification.requestPermission();
      updateNotificationStatus();
      if (Notification.permission !== "granted") return;
      const shown = await showSystemNotification(
        "Notifications ready",
        "Rep Routine can alert you when rest finishes.",
        "rep-routine-notification-test",
      );
      notificationStatus.textContent = shown ? "Test sent · adjust its sound and vibration in your phone settings." : "The test could not be shown. Reopen the app and try again.";
    } catch {
      notificationStatus.textContent = "The notification test failed. Check the app permission and try again.";
    } finally {
      notificationButton.disabled = Notification.permission === "denied";
    }
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

  updateConnectionStatus(); updateNotificationStatus();
  if (!("serviceWorker" in navigator)) return { showTimerCompletionNotification };
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
  return { showTimerCompletionNotification };
}
