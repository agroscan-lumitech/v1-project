if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(error => {
      console.warn("AgroScan offline support could not be initialized:", error);
    });
  });
}
