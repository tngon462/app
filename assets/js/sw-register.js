if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw-admin.js", { scope: "./" })
    .then(() => console.log("SW registered"))
    .catch(console.error);
}
