// /assets/js/device-bind.js  v3
(function(){
  'use strict';

  const log  = (...a)=> console.log('[bind]', ...a);
  const warn = (...a)=> console.warn('[bind]', ...a);
  const err  = (...a)=> console.error('[bind]', ...a);

  // ===== LocalStorage keys =====
  const LS = localStorage;
  const LS_DEVICE_ID = 'deviceId';
  const LS_CODE      = 'deviceCode';
  const LS_TABLE     = 'tableId';
  const LS_STATE     = 'appState';   // 'select' | 'start' | 'pos'
  const LS_TURL      = 'tableUrl';
  const LS_BINDFLAG  = 'bindFlag';   // '1' khi đã bind thành công (cho bind-probe)

  // ===== Helpers =====
  function uuidv4(){return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);});}
  function get(k){ try{ return LS.getItem(k); }catch(_){ return null; } }
  function set(k,v){ try{ if(v==null) LS.removeItem(k); else LS.setItem(k,v); }catch(_){ } }
  function deviceId(){
    let id = get(LS_DEVICE_ID);
    if (!id){ id = uuidv4(); set(LS_DEVICE_ID,id); }
    return id;
  }

  function needFirebase(){
    if (!window.firebase) throw new Error('Firebase SDK chưa load');
    if (!firebase.apps?.length) throw new Error('Firebase chưa initializeApp');
    return firebase;
  }

  async function ensureAnonAuth(){
    const fb = needFirebase();
    if (fb.auth().currentUser) return;
    await fb.auth().signInAnonymously();
    await new Promise(res=>{
      const un = fb.auth().onAuthStateChanged(u=>{ if(u){ un(); res(); }});
    });
  }

  // ===== Mini UI: overlay nhập mã nếu chưa có mã =====
  function showBindOverlay(onSubmit){
    // Nếu trang đã có form riêng thì không dựng overlay; bạn có thể
    // gọi window.tryBindWithCode(code) ở handler của bạn.
    if (document.getElementById('bind-overlay')) return;

    const wrap = document.createElement('div');
    wrap.id = 'bind-overlay';
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    wrap.innerHTML = `
      <div style="background:#fff;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.2);width:100%;max-width:420px;padding:20px;font:14px system-ui">
        <div style="font-weight:700;font-size:16px;margin-bottom:8px">Nhập MÃ thiết bị</div>
        <div style="color:#6b7280;margin-bottom:12px">Mã do Admin cấp. Dùng để gắn iPad vào hệ thống.</div>
        <input id="bind-code-input" inputmode="latin" autocapitalize="characters" maxlength="32"
               placeholder="VD: A1B2C3" style="width:100%;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;font-weight:700;letter-spacing:2px;text-transform:uppercase">
        <div id="bind-err" style="display:none;margin-top:8px;color:#dc2626;font-weight:600"></div>
        <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">
          <button id="bind-cancel" style="padding:8px 12px;border:1px solid #e5e7eb;border-radius:10px;background:#fff">Để sau</button>
          <button id="bind-submit" style="padding:8px 12px;border-radius:10px;background:#2563eb;color:#fff;font-weight:700">Gắn mã</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    const $in  = wrap.querySelector('#bind-code-input');
    const $err = wrap.querySelector('#bind-err');
    wrap.querySelector('#bind-cancel').addEventListener('click', ()=> wrap.remove());
    wrap.querySelector('#bind-submit').addEventListener('click', async ()=>{
      $err.style.display='none'; $err.textContent='';
      const code = String($in.value||'').trim().toUpperCase();
      if (!code){ $err.textContent='Nhập mã trước đã.'; $err.style.display='block'; return; }
      try{
        wrap.querySelector('#bind-submit').disabled = true;
        await onSubmit(code);
        wrap.remove();
      }catch(e){
        wrap.querySelector('#bind-submit').disabled = false;
        $err.textContent = e?.message || 'Gắn mã thất bại.';
        $err.style.display='block';
      }
    });
    $in.focus();
  }

  // ===== Core: Claim / Verify code =====
  async function claimCodeStrict(code){
    await ensureAnonAuth();
    const fb = needFirebase();
    const db = fb.database();
    const id = deviceId();
    const now = fb.database.ServerValue.TIMESTAMP;

    // Transaction đảm bảo: code tồn tại, enabled !== false, chưa bị gắn sang máy khác
    const codeRef = db.ref('codes/'+code);
    const txRes = await codeRef.transaction(cur=>{
      if (!cur) return cur; // null -> fail
      const enabled = cur.enabled !== false;
      const bound   = !!cur.boundDeviceId && cur.boundDeviceId !== id;
      if (!enabled || bound) return; // abort
      return {
        ...cur,
        enabled: true,
        boundDeviceId: id,
        boundAt: cur.boundAt || now,
      };
    }, {applyLocally:false});

    if (!txRes.committed || !txRes.snapshot.exists()){
      // chi tiết lỗi
      const snap = await codeRef.get();
      if (!snap.exists()) throw new Error('Mã không tồn tại.');
      const v = snap.val();
      if (v.enabled === false) throw new Error('Mã đã bị tắt.');
      if (v.boundDeviceId && v.boundDeviceId !== id) throw new Error('Mã đang dùng ở thiết bị khác.');
      throw new Error('Không thể gắn mã. Thử lại.');
    }

    // Ghi thiết bị (lần đầu)
    await db.ref('devices/'+id).update({
      code: code,
      table: null,
      stage: 'select',
      inPOS: false,
      lastSeen: now,
    });

    // Lưu localStorage CHỈ SAU KHI claim OK:
    set(LS_CODE, code);
    set(LS_BINDFLAG, '1'); // để bind-probe bắt đầu heartbeat

    log('Bind OK with code', code);
    return true;
  }

  // Xác minh code hiện có (khi refresh, khởi động lại)
  async function verifyExistingCodeOrClear(){
    const code = get(LS_CODE);
    if (!code) return false;
    await ensureAnonAuth();
    const fb = needFirebase();
    const db = fb.database();
    const snap = await db.ref('codes/'+code).get();
    if (!snap.exists()){
      clearBinding('Mã không còn tồn tại.');
      return false;
    }
    const v = snap.val();
    const id = deviceId();
    if (v.enabled === false || (v.boundDeviceId && v.boundDeviceId !== id)){
      clearBinding('Mã không hợp lệ (đã tắt hoặc gắn máy khác).');
      return false;
    }
    return true;
  }

  function clearBinding(reason){
    warn('Clear binding:', reason);
    set(LS_CODE, null);
    set(LS_BINDFLAG, null);
    // KHÔNG đổi state/UI ở đây; để người dùng tự nhập lại
  }

  // ===== Remote commands từ Admin =====
  function attachDeviceCommandListeners(){
    const fb = needFirebase();
    const db = fb.database();
    const id = deviceId();

    // setTable {value, at}
    db.ref('devices/'+id+'/commands/setTable').on('value', snap=>{
      if (!snap.exists()) return;
      const cmd = snap.val();
      db.ref('devices/'+id+'/commands/setTable').remove().catch(()=>{});
      const label = String(cmd?.value || '').trim();
      if (!label) return;

      // Tìm link từ links.json (nếu đã load) hoặc giữ url cũ
      const url = (window.getLinkForTable && window.getLinkForTable(label))
               || get(LS_TURL) || null;

      set(LS_TABLE, label);
      if (url) set(LS_TURL, url);
      // Phát event để UI cập nhật
      window.dispatchEvent(new CustomEvent('tngon:tableChanged', { detail:{ table: label, url }}));
    });

    // unbindAt → xóa mã & reset
    db.ref('devices/'+id+'/commands/unbindAt').on('value', snap=>{
      if (!snap.exists()) return;
      db.ref('devices/'+id+'/commands/unbindAt').remove().catch(()=>{});
      clearBinding('Unbind by admin');
      try{
        set(LS_TABLE,null); set(LS_TURL,null); set(LS_STATE,'select');
        if (typeof window.gotoSelect === 'function') window.gotoSelect(true);
      }catch(_){}
    });

    // reloadAt
    db.ref('devices/'+id+'/commands/reloadAt').on('value', snap=>{
      if (!snap.exists()) return;
      db.ref('devices/'+id+'/commands/reloadAt').remove().catch(()=>{});
      location.reload();
    });

    // homeAt (về màn Start)
    db.ref('devices/'+id+'/commands/homeAt').on('value', snap=>{
      if (!snap.exists()) return;
      db.ref('devices/'+id+'/commands/homeAt').remove().catch(()=>{});
      if (typeof window.gotoStart === 'function') window.gotoStart();
    });

    // Nếu Admin xóa hẳn node devices/<id> → buộc nhập mã lại
    db.ref('devices/'+id).on('value', snap=>{
      if (!snap.exists()){
        clearBinding('Device removed by admin');
        try{
          set(LS_TABLE,null); set(LS_TURL,null); set(LS_STATE,'select');
          if (typeof window.gotoSelect === 'function') window.gotoSelect(true);
        }catch(_){}
      }
    });
  }

  // ===== Public API: cho UI hiện có gọi thủ công nếu muốn =====
  window.tryBindWithCode = async function(raw){
    const code = String(raw||'').trim().toUpperCase();
    if (!code) throw new Error('Chưa nhập mã.');
    await claimCodeStrict(code);
    // Thành công → nếu đang ở Select thì giữ nguyên, để chọn bàn; nếu đang Start/Pos thì không đổi gì.
    // Bạn có thể tùy chọn tự gotoSelect() hoặc hiển thị toast ở đây.
    log('Bind thành công → giữ trạng thái hiện tại.');
  };

  // ===== Boot =====
  (async function boot(){
    try{
      log('deviceId =', deviceId());
      await ensureAnonAuth();
      attachDeviceCommandListeners();

      const ok = await verifyExistingCodeOrClear();
      if (!ok){
        // Chưa có/không còn mã → hiện overlay nhập mã (an toàn, không ảnh hưởng UI cũ)
        showBindOverlay(window.tryBindWithCode);
        // Đánh dấu state để admin không thấy rác (bind-probe sẽ KHÔNG heartbeat khi chưa bind)
        set(LS_BINDFLAG,null);
      }else{
        // Có mã hợp lệ → cho phép bind-probe heartbeat
        set(LS_BINDFLAG,'1');
      }
    }catch(e){
      err('boot error:', e);
      // Không phá UI; nếu muốn có thể hiện overlay
      showBindOverlay(window.tryBindWithCode);
    }
  })();

})();
