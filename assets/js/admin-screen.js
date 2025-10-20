// admin-screen.js
// Tab "Tắt/Bật màn hình" (giữ nguyên logic bản cũ)

(function(){
  const db = window.Admin && Admin.db;
  if (!db) return;

  const toggleEl = document.getElementById('screenToggle');
  const statusEl = document.getElementById('screenStatusText');
  const btnOn    = document.getElementById('btnOn');
  const btnOff   = document.getElementById('btnOff');
  const errorBox = document.getElementById('errorBox');
  const tablesGrid = document.getElementById('tablesGrid');

  function showError(msg){ if(!errorBox) return; errorBox.textContent=msg||''; errorBox.classList.toggle('hidden', !msg); }

  const refScreen = db.ref('control/screen');
  refScreen.once('value').then(s=>{ if(!s.exists()) refScreen.set('on'); });

  refScreen.on('value', (s)=>{
    showError('');
    const v = s.exists()? String(s.val()).toLowerCase() : 'on';
    const isOn = v === 'on';
    if (toggleEl) toggleEl.checked = isOn;
    if (statusEl) statusEl.textContent = isOn? 'Đang bật màn hình' : 'Đang tắt (phủ đen)';
  }, (e)=> showError('Lỗi subscribe: '+(e?.message||e)));

  toggleEl?.addEventListener('change', async ()=>{
    try{ await refScreen.set(toggleEl.checked? 'on':'off'); }
    catch(e){ showError('Ghi thất bại: '+(e?.message||e)); }
  });

  const TABLE_COUNT = 15;
  const tableRefs = {};
  const tableStates = {};

  function makeTile(i, onToggle, onRefresh){
    const card = document.createElement('div');
    card.className = 'bg-white rounded-xl shadow-sm border border-gray-200 p-3 flex flex-col';

    const head = document.createElement('div');
    head.className = 'flex items-start justify-between gap-3';

    const left = document.createElement('div');
    left.className = 'min-w-0';
    left.innerHTML = `<div class="font-semibold text-gray-800">Bàn ${i}</div>
                      <div id="tb-status-${i}" class="text-xs text-gray-500">Đang tải…</div>`;

    const wrapper = document.createElement('div');
    wrapper.className = 'toggle';
    const input = document.createElement('input'); input.type='checkbox'; input.id=`tb-toggle-${i}`;
    const label = document.createElement('label'); label.setAttribute('for', input.id);
    wrapper.appendChild(input); wrapper.appendChild(label);
    input.addEventListener('change', ()=> onToggle(i, input.checked?'on':'off'));

    head.appendChild(left); head.appendChild(wrapper);

    const btnRefresh = document.createElement('button');
    btnRefresh.textContent = 'Làm mới';
    btnRefresh.className = 'mt-2 self-end px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700';
    btnRefresh.addEventListener('click', ()=> onRefresh(i));

    card.appendChild(head); card.appendChild(btnRefresh);
    return { card, input };
  }

  function renderPerTable(){
    if (!tablesGrid) return;
    tablesGrid.innerHTML = '';
    for (let i=1;i<=TABLE_COUNT;i++){
      const {card, input} = makeTile(i, setTableScreen, refreshTable);
      tablesGrid.appendChild(card);

      const sEl = document.getElementById(`tb-status-${i}`);
      const ref = db.ref(`control/tables/${i}/screen`);
      tableRefs[i] = ref;

      ref.on('value', async (snap)=>{
        if (!snap.exists()){
          try{ await ref.set('on'); }catch(_){}
          sEl.textContent = 'Đang bật (khởi tạo)';
          input.checked = true; tableStates[i] = 'on'; return;
        }
        const val = (snap.val()||'on').toString().toLowerCase();
        tableStates[i] = val;
        sEl.textContent = (val === 'on') ? 'Đang bật' : 'Đang tắt';
        if (input.checked !== (val==='on')) input.checked = (val==='on');
      }, (err)=> sEl.textContent = 'Lỗi: ' + (err?.message || err));
    }
  }

  async function setTableScreen(i, val){
    try{ await tableRefs[i].set(val); }
    catch(e){
      showError(`Ghi thất bại cho Bàn ${i}: ` + (e?.message || e));
      const input = document.getElementById(`tb-toggle-${i}`);
      if (input) input.checked = (tableStates[i] === 'on');
    }
  }

  async function refreshTable(i){
    showError('');
    try{
      await db.ref(`signals/${i}`).set({ status:'expired', ts: firebase.database.ServerValue.TIMESTAMP });
    }catch(e){ showError(`Làm mới Bàn ${i} thất bại: ` + (e?.message || e)); }
  }

  document.getElementById('btnOn')?.addEventListener('click', async ()=>{
    try{
      await refScreen.set('on');
      const updates = {};
      for (let i=1;i<=TABLE_COUNT;i++) updates[`control/tables/${i}/screen`]='on';
      await db.ref().update(updates);
    }catch(e){ showError('Bật tất cả thất bại: ' + (e?.message||e)); }
  });
  document.getElementById('btnOff')?.addEventListener('click', async ()=>{
    try{ await refScreen.set('off'); }
    catch(e){ showError('Tắt tất cả thất bại: ' + (e?.message||e)); }
  });

  renderPerTable();
})();
