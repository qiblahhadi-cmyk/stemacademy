const form = document.getElementById("loginForm");
const message = document.getElementById("loginMessage");

form?.addEventListener("submit", event => {
  event.preventDefault();
  if (message) {
    message.textContent = "Sign-in is not active in this preview. Please do not submit real account credentials.";
  }
});