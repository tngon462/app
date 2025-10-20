// admin-common.js
// Init Firebase + tiện ích chung + route tab (nếu cần)

(function(){
  window.Admin = window.Admin || {};

  // Đã có firebaseConfig trong admin.html
  if (!window.firebase || !firebase.apps?.length) {
    firebase.initializeApp(window.firebaseConfig);
  }

  const db = firebase.database();
  Admin.db = db;

  // Anonymous auth
  (async ()=>{
    try{
      await firebase.auth().signInAnonymously();
    }catch(e){ console.warn('[admin] signInAnonymously fail:', e?.message||e); }
  })();

  // Utils
  Admin.fmt = {
    ts: (ts)=> {
      if (!ts) return '—';
      try{ return new Date(ts).toLocaleString(); }catch(_){ return String(ts); }
    },
    ago: (ts)=>{
      if (!ts) return '-';
      const s = Math.floor((Date.now() - ts)/1000);
      if (s < 60) return s+'s';
      const m = Math.floor(s/60); if (m < 60) return m+'m';
      const h = Math.floor(m/60); if (h < 24) return h+'h';
      return Math.floor(h/24)+'d';
    }
  };

  // Kết nối badge (nếu có)
  const connBadge = document.getElementById('connBadge');
  if (connBadge){
    db.ref('.info/connected').on('value', snap=>{
      const online = !!snap.val();
      connBadge.textContent = online ? 'Đã kết nối Firebase' : 'Mất kết nối Firebase';
      connBadge.className = online ? 'text-xs text-emerald-600' : 'text-xs text-red-600';
    });
  }
})();
