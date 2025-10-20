// assets/js/redirect-core.js
// Giao diện chính iPad T-NGON
(function(){
  const LS = localStorage;
  const $ = (id)=>document.getElementById(id);

  function gotoSelect(){
    LS.setItem('appState','select');
    document.body.innerHTML = `<div class="flex flex-col items-center justify-center min-h-screen bg-white">
      <h1 class="text-3xl font-bold mb-4 text-gray-800">Vui lòng chọn bàn</h1>
      <div class="grid grid-cols-3 gap-3">
        ${Array.from({length:15},(_,i)=>`<button class="px-4 py-3 bg-blue-600 text-white rounded-lg" onclick="selectTable(${i+1})">${i+1}</button>`).join('')}
      </div>
    </div>`;
  }

  window.selectTable = function(num){
    const map = window.LINKS_MAP || {};
    const url = map[num] || '';
    LS.setItem('tableId', num);
    LS.setItem('tableUrl', url);
    gotoStart();
  };

  function gotoStart(){
    LS.setItem('appState','start');
    const tableId = LS.getItem('tableId');
    document.body.innerHTML = `<div class="flex flex-col items-center justify-center min-h-screen bg-white">
      <h1 class="text-6xl font-extrabold text-blue-600 mb-10">${tableId ? 'BÀN '+tableId : '-'}</h1>
      <button class="rounded-2xl bg-blue-500 text-white font-extrabold shadow-lg hover:bg-blue-600 flex items-center justify-center px-10 py-6 text-3xl"
        onclick="gotoPos()">START ORDER</button>
    </div>`;
  }

  function gotoPos(){
    LS.setItem('appState','pos');
    const url = LS.getItem('tableUrl');
    if (url) location.href = url;
    else alert('Chưa có link POS.');
  }

  window.gotoSelect = gotoSelect;
  window.gotoStart = gotoStart;
  window.gotoPos = gotoPos;

  document.addEventListener('DOMContentLoaded', ()=> gotoSelect());
})();
