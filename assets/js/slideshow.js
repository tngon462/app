// assets/js/slideshow.js

// Đường dẫn GitHub Pages repo "slide"
const basePath = "https://tngon462.github.io/slide/slides/";

// Đường dẫn tới manifest.json
const manifestUrl = basePath + "manifest.json";

// Container hiển thị slideshow
const slideshowContainer = document.getElementById("slideshow");

let imageList = [];
let currentIndex = 0;

// Hiển thị 1 ảnh
function showSlide(index) {
  slideshowContainer.innerHTML = "";

  const img = document.createElement("img");
  img.src = basePath + imageList[index];
  img.alt = "slide";
  img.style.maxWidth = "100%";
  img.style.maxHeight = "100%";
  img.onerror = function () {
    slideshowContainer.innerHTML =
      "<p style='color:red'>Không tải được ảnh: " + imageList[index] + "</p>";
  };

  slideshowContainer.appendChild(img);
}

// Chạy tự động
function startSlideshow() {
  if (imageList.length === 0) {
    slideshowContainer.innerHTML =
      "<p style='color:red'>Danh sách ảnh trống</p>";
    return;
  }

  showSlide(currentIndex);
  setInterval(() => {
    currentIndex = (currentIndex + 1) % imageList.length;
    showSlide(currentIndex);
  }, 5000); // đổi ảnh sau 5 giây
}

// Tải manifest.json
async function loadManifest() {
  try {
    const res = await fetch(manifestUrl);
    if (!res.ok) throw new Error("HTTP " + res.status);
    imageList = await res.json();
    startSlideshow();
  } catch (err) {
    slideshowContainer.innerHTML =
      "<p style='color:red'>Lỗi tải manifest.json: " + err + "</p>";
  }
}

// Khởi động
document.addEventListener("DOMContentLoaded", loadManifest);
