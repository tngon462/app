<script>
// assets/js/admin-devices.js (list-only to verify data pipe)
(function(){
  'use strict';
  if (!window.firebase){ console.warn('[admin-devices] firebase undefined'); return; }

  // chờ tới khi auth ẩn danh xong (admin.html đã signInAnonymously)
  function readyAuth(){
    return new Promise(r=>{
      if (firebase.auth().currentUser) return r();
      const un = firebase.auth().onAuthStateChanged(()=>{ un(); r(); });
    });
  }

  function ensureTab(){
    // thêm link & view nếu chưa có
    const aside = document.querySelector('aside.drawer nav');
    if (!aside) return null;

    let navA = document.getElementById('navDevices');
    if (!navA){
      navA = document.createElement('a');
      navA.id = 'navDevices';
      navA.href = '#devices';
      navA.className = 'nav-link';
      navA.textContent = 'Thiết bị';
      aside.appendChild(navA);
    }

    let view = document.getElementById('viewDevices');
    if (!view){
      view = document.createElement('section');
      view.id = 'viewDevices';
      view.className = 'p-4 md:p-6 hidden';
      view.innerHTML = `
        <h2 class="text-2xl font-bold text-gray-800 mb-4">Thiết bị (đọc từ /devices)</h2>
        <div id="devError" class="hidden p-3 rounded-lg bg-red-50 text-red-700 text-sm mb-3"></div>
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-5">
          <table class="min-w-full text-sm">
            <thead class="bg-gray-100">
              <tr>
                <th class="px-2 py-1 text-left">Device ID</th>
                <th class="px-2 py-1 text-left">Tên</th>
                <th class="px-2 py-1 text-left">Mã</th>
                <th class="px-2 py-1 text-left">Bàn</th>
                <th class="px-2 py-1 text-left">Stage</th>
                <th class="px-2 py-1 text-left">LastSeen</th>
              </tr>
            </thead>
            <tbody id="devices-tbody"></tbody>
          </table>
        </div>`;
      const main = document.querySelector('main.content');
      main?.appendChild(view);

      // hook router có sẵn của admin.html
      const navScreen = document.getElementById('navScreen');
      const navAds    = document.getElementById('navAds');
      function setActive(hash) {
        [navScreen, navAds, navA].forEach(a=>a?.classList.remove('active'));
        document.getElementById('viewScreen')?.classList.add('hidden');
        document.getElementById('viewAds')?.classList.add('hidden');
        view.classList.add('hidden');
        if (hash==='#devices'){ navA.classList.add('active'); view.classList.remove('hidden'); }
        else if (hash==='#ads'){ navAds?.classList.add('active'); document.getElementById('viewAds')?.classList.remove('hidden'); }
        else { navScreen?.classList.add('active'); document.getElementById('viewScreen')?.classList.remove('hidden'); }
      }
      window.addEventListener('hashchange', ()=> setActive(location.hash||'#screen'));
      setActive(location.hash||'#screen');
    }
    return view;
  }

  function ts(x){ try{ return x? new Date(x).toLocaleString(): '—'; }catch(_){ return String(x||'—'); } }
  function showErr(msg){ const el=document.getElementById('devError'); if(!el) return; el.textContent=msg||''; el.classList.toggle('hidden', !msg); }

  (async function boot(){
    try{
      await readyAuth();
      const view = ensureTab();
      if (!view) return;

      const tbody = document.getElementById('devices-tbody');
      const db = firebase.database();

      db.ref('devices').on('value', (snap)=>{
        const data = snap.val() || {};
        const rows = Object.entries(data).sort((a,b)=>(b[1]?.lastSeen||0)-(a[1]?.lastSeen||0));
        tbody.innerHTML = '';
        if (!rows.length){
          const tr = document.createElement('tr');
          tr.innerHTML = `<td colspan="6" class="px-2 py-3 text-center text-gray-500">Chưa có thiết bị nào ghi vào /devices</td>`;
          tbody.appendChild(tr);
          return;
        }
        rows.forEach(([id, v])=>{
          const tr = document.createElement('tr');
          tr.className = 'border-b last:border-0';
          tr.innerHTML = `
            <td class="px-2 py-1 text-xs break-all">${id}</td>
            <td class="px-2 py-1">${v?.name||'—'}</td>
            <td class="px-2 py-1 font-mono">${v?.code||'—'}</td>
            <td class="px-2 py-1">${v?.inPOS ? ('+'+(v?.table||'—')) : (v?.table||'—')}</td>
            <td class="px-2 py-1">${v?.stage||'—'}</td>
            <td class="px-2 py-1 text-xs">${ts(v?.lastSeen)}</td>
          `;
          tbody.appendChild(tr);
        });
        showErr('');
      }, (e)=> showErr('Lỗi đọc /devices: ' + (e?.message||e)));
    }catch(e){
      showErr('Lỗi khởi chạy: ' + (e?.message||e));
    }
  })();

})();
</script>
