const firebaseConfig = {
  // TODO: cấu hình firebase
};
function connectFirebase() {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log("[firebase] connected");
  }
}
document.addEventListener("DOMContentLoaded", connectFirebase);