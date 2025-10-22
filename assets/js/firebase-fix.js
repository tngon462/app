<script>
/* T-NGON v2 · QRBack listener
   - Lắng nghe: signals/<tableNo>
   - Khi status='expired' và ts thay đổi → quay về ORDER_URL hoặc reload
   - Đồng thời nghe broadcast/reloadAt để đồng bộ lệnh Reload toàn bộ từ Admin
*/

(function(){
  'use strict';

  // ============ CONFIG ============
  // Trang đích khi “quay lại order” (điều chỉnh theo app của bạn)
  // Nếu trang hiện tại chính là order rồi, script sẽ chỉ reload.
  const ORDER_URL = '/';        // ví dụ '/', '/order', '/index.html'...
  const DEBUG_LOG = true;       // bật log cho dễ kiểm tra

  // Thử lấy số bàn từ nhiều nguồn khác nhau để tương thích V2
  function resolveTableNo(){
    // 1) query ?table=12
    const qs = new URLSearchParams(location.search);
    if (qs.get('table')) return String(qs.get('table')).trim();

    // 2) localStorage (tuỳ bạn đã lưu khoá nào – thử vài khoá phổ biến)
    const keys = ['tngon.table','table','TABLE','tn_table'];
    for (const k of keys){
      const v = localStorage.getItem(k);
      if (v) return String(v).trim();
    }

    // 3) data-attr trên body: <body data-table="12">
    const dt = document.body?.dataset?.table;
    if (dt) return String(dt).trim();

    // 4) Đoán từ URL kiểu .../table/12 hoặc .../ban/12
    const m = location.pathname.match(/(?:table|ban)\/(\d+)/i);
    if (m) return m[1];

    // Không tìm thấy
    return null;
  }

  // Điều hướng về order hoặc reload trang hiện tại
  function goToOrder(){
    try{
      // Nếu đã ở đúng URL order → reload cứng để clear state
      const here = location.pathname.replace(/\/+$/,'');
      const dest = ORDER_URL.replace(/\/+$/,'');
      if (here === dest){
        if (DEBUG_LOG) console.log('[qrback] reload order page');
        location.reload(true);
      } else {
        if (DEBUG_LOG) console.log('[qrback] navigate to order:', ORDER_URL);
        location.href = ORDER_URL;
      }
    }catch(e){
      console.warn('[qrback] navigate error:', e);
      location.reload(true);
    }
  }

  async function ensureFirebaseReady(){
    if (!window.firebase || !firebase.apps?.length) throw new Error('Firebase chưa init');
    if (!firebase.auth().currentUser){
      await firebase.auth().signInAnonymously();
      await new Promise(res=>{
        const un = firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); res(); }});
      });
    }
    return firebase.database();
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      const db = await ensureFirebaseReady();

      // 1) Nghe lệnh reload toàn bộ từ Admin (broadcast)
      let lastReloadAt = null;
      db.ref('broadcast/reloadAt').on('value', s=>{
        const v = s.val();
        if (!v) return;
        if (v !== lastReloadAt){
          lastReloadAt = v;
          if (DEBUG_LOG) console.log('[qrback] broadcast/reloadAt changed → reload');
          location.reload(true);
        }
      });

      // 2) Nghe tín hiệu “qr back” theo bàn
      const tableNo = resolveTableNo();
      if (!tableNo){
        console.warn('[qrback] Không xác định được số bàn → bỏ qua signals/* listener');
        return;
      }
      const ref = db.ref('signals/'+String(tableNo));
      let lastTs = null, initialized = false;

      if (DEBUG_LOG) console.log('[qrback] listen signals/'+tableNo);

      ref.on('value', snap=>{
        const val = snap.val();
        if (!val) return;

        const status = (val.status || '').toString().toLowerCase();
        const ts     = Number(val.ts || 0);

        // Bỏ qua lần đầu để không tự kích hoạt nếu đã có giá trị cũ
        if (!initialized){
          lastTs = ts || null;
          initialized = true;
          if (DEBUG_LOG) console.log('[qrback] prime value:', val);
          return;
        }

        if (status === 'expired' && ts && ts !== lastTs){
          lastTs = ts;
          if (DEBUG_LOG) console.log('[qrback] expired received → back to order');
          // Thực thi quay lại order
          goToOrder();
        }
      });

    }catch(e){
      console.error('[qrback] init error:', e);
    }
  });
})();
</script>
