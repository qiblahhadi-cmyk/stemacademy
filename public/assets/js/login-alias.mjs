/**
 * STEM Academy - Login Alias Module
 * Manages quick login aliases and role preview shortcuts on the login portal.
 */

export class LoginAliasManager {
  constructor() {
    this.initAliases();
  }

  initAliases() {
    const aliasButtons = document.querySelectorAll('.login-alias-btn');
    if (!aliasButtons.length) return;

    aliasButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const role = button.getAttribute('data-role-alias');
        if (role) {
          this.applyAlias(role);
        }
      });
    });
  }

  applyAlias(role) {
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');

    if (!emailInput || !passwordInput) return;

    switch (role) {
      case 'admin':
        emailInput.value = 'admin@stem.academy';
        passwordInput.value = 'Password123!';
        break;
      case 'teacher':
        emailInput.value = 'teacher@stem.academy';
        passwordInput.value = 'Password123!';
        break;
      case 'student':
        emailInput.value = 'student@stem.academy';
        passwordInput.value = 'Password123!';
        break;
      case 'parent':
        emailInput.value = 'parent@stem.academy';
        passwordInput.value = 'Password123!';
        break;
      default:
        emailInput.value = '';
        passwordInput.value = '';
        break;
    }

    // Trigger input events for form validation state binders if present
    emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.LoginAlias = new LoginAliasManager();
});
