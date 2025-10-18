// firebase.js
const firebaseConfig = {
  apiKey: "AIzaSyD1A2fJY-EXAMPLE",
  authDomain: "tngon-pos.firebaseapp.com",
  databaseURL: "https://tngon-pos-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "tngon-pos",
  storageBucket: "tngon-pos.appspot.com",
  messagingSenderId: "9728391723",
  appId: "1:9728391723:web:4e7bda8b6e8a4b5a"
};

// Kết nối Firebase khi trang load
function connectFirebase() {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log("[firebase] connected");
  }

  const db = firebase.database();

  // Lắng nghe tín hiệu điều khiển từ admin / QRback
  const ref = db.ref("control");
  ref.on("value", (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    console.log("[firebase] signal:", data);

    // Khi admin yêu cầu tắt / bật màn hình
    if (data.command === "blackout_on") {
      const overlay = document.getElementById("screen-overlay");
      if (overlay) overlay.style.display = "block";
    }
    if (data.command === "blackout_off") {
      const overlay = document.getElementById("screen-overlay");
      if (overlay) overlay.style.display = "none";
    }

    // Khi QRback báo link hết hạn
    if (data.command === "reload_start") {
      localStorage.removeItem("tableUrl");
      localStorage.removeItem("tableId");
      location.reload();
    }
  });
}

document.addEventListener("DOMContentLoaded", connectFirebase);