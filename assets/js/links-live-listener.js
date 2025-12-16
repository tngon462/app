(function () {
  'use strict';
  if (!window.firebase || !firebase.apps?.length) return;

  const db = firebase.database();
  const log = (...a)=>console.log('[links-live]', ...a);

  function getLS(k,d=null){ try{return localStorage.getItem(k)||d}catch{return d} }
  function setLS(k,v){ try{localStorage.setItem(k,v)}catch{} }

  const tableId = getLS('tableId');
  if (!tableId){
    log('chưa có tableId → chờ');
    return;
  }

  const ref = db.ref('links_live');

  ref.on('value', snap=>{
    const data = snap.val();
    if (!data || !data.links) return;

    const newLink = data.links[String(tableId)];
    if (!newLink) return;

    const cur = getLS('posLink');
    if (cur === newLink) return;

    log('🔄 QR mới cho bàn', tableId, newLink);

    setLS('posLink', newLink);

    // nếu đang ở POS → reload iframe
    const iframe = document.getElementById('pos-frame');
    if (iframe){
      iframe.src = newLink;
    }
  });
})();
