let slideIndex = 0;
const slides = ["./assets/slides/Sting.jpg","./assets/slides/PhoGa.jpg"];
function showSlide(i) {
  const stage = document.querySelector(".slide-stage");
  if (stage) stage.innerHTML = `<img src="${slides[i]}" alt="slide"/>`;
}
function nextSlide() {
  slideIndex = (slideIndex + 1) % slides.length;
  showSlide(slideIndex);
}
document.addEventListener("DOMContentLoaded", () => {
  showScreen("start-slideshow-screen");
  showSlide(slideIndex);
  setInterval(nextSlide, 5000);
});