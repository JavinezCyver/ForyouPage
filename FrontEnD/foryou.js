// Demo credentials only. Production authentication needs a server.
const loginForm = document.getElementById("login-form");

if (loginForm) {
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const loginError = document.getElementById("login-error");

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (usernameInput.value === "Cyvie123" && passwordInput.value === "Cyvie123") {
      window.location.href = "foryouBody.html";
      return;
    }

    loginError.textContent = "Incorrect username or password. Please try again.";
    loginError.hidden = false;
    usernameInput.setAttribute("aria-invalid", "true");
    passwordInput.setAttribute("aria-invalid", "true");
  });

  loginForm.addEventListener("input", () => {
    loginError.hidden = true;
    loginError.textContent = "";
    usernameInput.removeAttribute("aria-invalid");
    passwordInput.removeAttribute("aria-invalid");
  });
}

const openFlowerButton = document.getElementById("open-flower");

if (openFlowerButton) {
  openFlowerButton.addEventListener("click", () => {
    window.location.href = "foryouBody2.html";
  });
}
