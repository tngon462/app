// screen-state.js — FINAL SAFE (stage + blackout sync cho admin, KHÔNG phá app)
(function () {
  "use strict";
  const log = (...a) => console.log("[tngon][screen]", ...a);

  if (!window.firebase) return;

  const db = firebase.database();
  const LS = localStorage;

  const deviceId = LS.getItem("deviceId") || "";
  const getTableId = () => LS.getItem("tableId") || null;

  let curStage = (LS.getItem("appState") || "select").toLowerCase(); // select|start|pos
  let curBlack = "off"; // off = không che, on = đang che

  function writeStatus(by) {
    const tbl = getTableId();
    curStage = (LS.getItem("appState") || curStage || "select").toLowerCase();

    const payload = {
      table: tbl,
      stage: curStage,
      blackout: curBlack,
      by: by || "unknown",
      at: firebase.database.ServerValue.TIMESTAMP,
    };

    // NOTE: nếu rules chặn /status/* thì sẽ warn permission_denied (không ảnh hưởng chạy app)
    if (deviceId) {
      db.ref("devices/" + deviceId)
        .update({
          table: tbl,
          stage: curStage,
          blackout: curBlack,
          lastSeen: firebase.database.ServerValue.TIMESTAMP,
        })
        .catch(() => {});

      db.ref("status/devices/" + deviceId).set(payload).catch(() => {});
    }

    if (tbl) {
      db.ref("status/tables/" + tbl).set(payload).catch(() => {});
    }

    log("reported =>", payload);
  }

  // redirect-core gọi
  window.reportStage = function (stage, by) {
    const st = String(stage || "").toLowerCase();
    if (!st) return;
    curStage = st;
    LS.setItem("appState", curStage);
    writeStatus(by || "core");
  };

  // blackout sync bằng overlay DOM (an toàn nhất)
  function hookOverlayObserver() {
    const overlay = document.getElementById("screen-overlay");
    if (!overlay) return;

    const read = () => {
      const isOn = getComputedStyle(overlay).display !== "none";
      const next = isOn ? "on" : "off";
      if (next !== curBlack) {
        curBlack = next;
        writeStatus("overlay");
      }
    };

    // đọc ngay 1 lần
    read();

    const obs = new MutationObserver(read);
    obs.observe(overlay, { attributes: true, attributeFilter: ["style", "class"] });
    log("overlay observer ready");
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", hookOverlayObserver, { once: true });
  else hookOverlayObserver();

  // đổi bàn từ admin/bind
  window.addEventListener("tngon:tableChanged", () => writeStatus("table-change"));

  // boot report
  setTimeout(() => writeStatus("boot"), 300);
})();
