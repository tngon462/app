// assets/js/admin-tabs.js
(function(){
  const $ = (id)=> document.getElementById(id);
  const panes = {
    devices: $('viewDevices'),
    codes:   $('viewCodes'),
    ads:     $('viewAds')
  };
  const tabs = {
    devices: $('tabDevices'),
    codes:   $('tabCodes'),
    ads:     $('tabAds')
  };
  function show(name){
    Object.entries(panes).forEach(([k,el])=>{
      el.classList.toggle('hidden', k!==name);
    });
    Object.entries(tabs).forEach(([k,btn])=>{
      btn.classList.toggle('bg-blue-600', k===name);
      btn.classList.toggle('text-white', k===name);
      btn.classList.toggle('bg-gray-100', k!==name);
    });
    if (name==='ads') {
      const ifr = document.getElementById('ads-iframe');
      if (ifr && (!ifr.src || ifr.src==='about:blank')) ifr.src = 'https://pic-flame.vercel.app/';
    }
  }
  function route(){
    const h = (location.hash||'').replace('#','');
    if (h==='codes') show('codes');
    else if (h==='ads') show('ads');
    else show('devices');
  }
  tabs.devices.addEventListener('click', ()=>{ location.hash='#devices'; route(); });
  tabs.codes.addEventListener('click',   ()=>{ location.hash='#codes';   route(); });
  tabs.ads.addEventListener('click',     ()=>{ location.hash='#ads';     route(); });
  window.addEventListener('hashchange', route);
  document.addEventListener('DOMContentLoaded', route);
})();
