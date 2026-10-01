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
  const letterFrame = document.getElementById("letter-frame");
  let letterReady = false;
  // Prepare the player before the click, so play() runs inside the opening gesture.
  const fallbackTimer = setTimeout(() => { openFlowerButton.disabled = false; }, 10000);
  letterFrame.addEventListener("load", async () => {
    try {
      const letterWindow = letterFrame.contentWindow;
      if (!letterWindow.foryouMusicReady) throw new Error("Letter player unavailable.");
      await letterWindow.foryouMusicReady;
      letterReady = typeof letterWindow.foryouStartMusic === "function";
    } catch {
      letterReady = false;
    }
    clearTimeout(fallbackTimer);
    openFlowerButton.disabled = false;
  });
  openFlowerButton.addEventListener("click", () => {
    if (!letterReady) {
      window.location.href = "foryouBody2.html";
      return;
    }
    letterFrame.hidden = false;
    document.body.classList.add("letter-open");
    document.title = "A little letter | ForYou";
    // Do not await navigation or storage here: browsers require this opening gesture.
    letterFrame.contentWindow.foryouStartMusic();
    letterFrame.focus();
  });
}
