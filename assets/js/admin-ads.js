// admin-ads.js
// Tab "Up ảnh quảng cáo" — giữ nguyên: chỉ gán src khi cần

(function(){
  const ifr = document.getElementById('ads-iframe');
  if (!ifr) return;
  // nếu đang rỗng → gán url
  if (!ifr.src || ifr.src === 'about:blank') {
    ifr.src = 'https://pic-flame.vercel.app/';
  }
})();
