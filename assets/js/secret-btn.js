function setupSecretButton(btn, callback) {
  let count = 0;
  let timer = null;
  btn.addEventListener("click", (e) => {
    if (!timer) {
      timer = setTimeout(() => {
        count = 0;
        timer = null;
      }, 3000);
    }
    count++;
    if (count >= 10) {
      clearTimeout(timer);
      timer = null;
      count = 0;
      callback(e);
    }
  });
}

const backBtnStart = document.getElementById("back-btn-start");
const backBtnSelect = document.getElementById("back-btn-select");

// Quay lại màn bắt đầu
setupSecretButton(backBtnStart, () => {
  document.getElementById("pos-container").classList.add("hidden");
  document.getElementById("pos-frame").src = "about:blank";
  document.getElementById("start-screen").classList.remove("hidden");
});

// Quay lại màn chọn bàn (cần mật mã)
setupSecretButton(backBtnSelect, () => {
  const popup = document.getElementById("password-popup");
  const input = document.getElementById("password-input");
  const error = document.getElementById("password-error");

  popup.classList.remove("hidden");
  input.focus();

  document.getElementById("password-ok").onclick = () => {
    if (input.value === "6868") {
      popup.classList.add("hidden");
      input.value = "";
      error.classList.add("hidden");

      document.getElementById("start-screen").classList.add("hidden");
      document.getElementById("pos-container").classList.add("hidden");
      document.getElementById("pos-frame").src = "about:blank";
      document.getElementById("select-table").classList.remove("hidden");

      localStorage.removeItem("tableId");
      localStorage.removeItem("tableUrl");
    } else {
      error.classList.remove("hidden");
    }
  };

  document.getElementById("password-cancel").onclick = () => {
    popup.classList.add("hidden");
    input.value = "";
    error.classList.add("hidden");
  };
});
