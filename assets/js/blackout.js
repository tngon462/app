(function(){
  const blackout = document.createElement('div');
  blackout.id = 'blackout';
  const img = document.createElement('img');
  img.src = './assets/black.png';
  blackout.appendChild(img);
  document.body.appendChild(blackout);
  let globalScreen = 'on';
  let tableScreen  = 'on';
  let perTableRef  = null;
  function isOffEffective(){ return (globalScreen==='off'||tableScreen==='off'); }
  function applyBlackout(){
    blackout.style.display = isOffEffective() ? 'block':'none';
  }
  blackout.addEventListener('pointerdown',()=>{ blackout.style.display='none'; });
  function listenGlobal(){
    const db=firebase.database();
    db.ref('control/screen').on('value',(snap)=>{
      globalScreen=(snap.val()==='off')?'off':'on'; applyBlackout();
    });
  }
  const _origSelectTable = window.selectTable;
  window.selectTable=function(banNumber){ _origSelectTable.call(this,banNumber); };
  document.addEventListener('DOMContentLoaded',()=>{ setTimeout(listenGlobal,80); });
})();