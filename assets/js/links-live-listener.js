// assets/js/links-live-listener.js (FIXED SAFE)
// - Nghe Firebase RTDB: control/tables/{tableId}/posUrl (hoặc links-live schema cũ)
// - CHỈ cập nhật LIVE link qua window.setPosLink(url,'links-live',tableId)
// - KHÔNG tự ý set iframe.src khi đang ở START (tránh nhảy vào link sai / link cũ)
// - Nếu đang ở POS của đúng bàn -> tự refresh sang LIVE mới bằng window.gotoPos(url, {by:'links-live'})
(function () {
  "use strict";
  const log  = (...a)=> console.log("[links-live]", ...a);
  const warn = (...a)=> console.warn("[links-live]", ...a);

  const getLS = (k, d=null)=>{ try{ const v=localStorage.getItem(k); return v ?? d; }catch(_){ return d; } };

  if (!window.firebase || !firebase.apps?.length){
    return warn("Firebase chưa init -> bỏ qua links-live listener.");
  }
  const db = firebase.database();

  const ACCEPT_URL = /^https?:\/\/order\.atpos\.net\//i;

  function getTableId(){
    return String(getLS("tableId","") || "").trim();
  }
  function getAppState(){
    return String(getLS("appState","") || "").trim(); // select | start | pos
  }

  let lastUrlByTable = Object.create(null);

  function applyUrl(tableId, url, sourcePath){
    const t = String(tableId||"").trim();
    const u = String(url||"").trim();
    if(!t || !u) return;
    if(!ACCEPT_URL.test(u)) return warn("Ignore non-atpos url", {t,u,sourcePath});

    if(lastUrlByTable[t] === u) return;
    lastUrlByTable[t] = u;

    if (typeof window.setPosLink === "function") {
      window.setPosLink(u, "links-live", t);
    } else {
      warn("window.setPosLink chưa có (redirect-core chưa load?)");
      return;
    }

    log("🔄 LIVE QR bàn", t, u);

    // Chỉ auto refresh nếu đang ở POS và đúng bàn
    const curTable = (typeof window.getCurrentTable === "function") ? window.getCurrentTable() : getTableId();
    const st = getAppState();
    if (st === "pos" && curTable === t && typeof window.gotoPos === "function") {
      window.gotoPos(u, { by: "links-live", source: sourcePath || "firebase", table: t });
    }
  }

  // ====== Listener 1: control/tables/{tableId}/posUrl (khuyến nghị) ======
  function attachPosUrlListener(tableId){
    const t = String(tableId||"").trim();
    if(!t) return;

    const ref = db.ref(`control/tables/${t}/posUrl`);
    ref.on("value", (snap)=>{
      const u = snap?.val();
      if(typeof u === "string" && u.trim()){
        applyUrl(t, u, `control/tables/${t}/posUrl`);
      }
    }, (err)=> warn("posUrl listener error", err));
    log("listen", `control/tables/${t}/posUrl`);
  }

  // ====== Listener 2: schema cũ (nếu có): links-live { links: {12: url} } ======
  const legacyRef = db.ref("links-live");
  legacyRef.on("value", (snap)=>{
    const v = snap?.val();
    const t = getTableId();
    if(!t) return;
    const u = v?.links?.[t] || v?.[t];
    if(typeof u === "string" && u.trim()){
      applyUrl(t, u, "links-live(legacy)");
    }
  }, (err)=> warn("legacy links-live error", err));
  log("listen", "links-live (legacy)");

  // ====== Re-attach when table changes (poll nhẹ) ======
  let lastTable = "";
  function tickTable(){
    const t = getTableId();
    if(t && t !== lastTable){
      lastTable = t;
      attachPosUrlListener(t);
    }
  }
  tickTable();
  setInterval(tickTable, 1500);
})();
