/**
 * STEM Academy - Core Application Controller (Multi-Page Architecture)
 * Handles API wrapper with token injection, session management, active sidebar navigation highlighting, and UI event delegation.
 */

class AppController {
  constructor() {
    this.currentUser = null;
    this.token = null;
    this.init();
  }

  async init() {
    this.setupEventListeners();
    this.initActiveNavigation();
    this.checkSession();
  }

  /**
   * Reusable API Fetch Wrapper with Token Injection and Error Handling
   */
  async apiFetch(endpoint, options = {}) {
    try {
      const token = await this.getAuthToken();
      
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(endpoint, {
        ...options,
        headers
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || `HTTP error! status: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      this.showErrorPopup(error.message || 'An unexpected network error occurred.');
      throw error;
    }
  }

  async getAuthToken() {
    if (window.firebase && window.firebase.auth) {
      const user = window.firebase.auth().currentUser;
      if (user) {
        return await user.getIdToken();
      }
    }
    return localStorage.getItem('stem_auth_token') || null;
  }

  /**
   * Active Navigation Highlighting for Multi-Page Setup
   */
  initActiveNavigation() {
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('aside nav a, .sidebar-nav a');

    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href && href === currentPath) {
        link.classList.add('bg-primary-600', 'text-white', 'font-semibold');
        link.classList.remove('text-gray-600', 'hover:bg-gray-100');
      } else {
        link.classList.remove('bg-primary-600', 'text-white', 'font-semibold');
        link.classList.add('text-gray-600', 'hover:bg-gray-100');
      }
    });
  }

  /**
   * Session State Check
   */
  async checkSession() {
    const userRoleEl = document.getElementById('user-role-display');
    const userNameEl = document.getElementById('user-name-display');

    try {
      const storedUser = localStorage.getItem('stem_user_profile');
      if (storedUser) {
        this.currentUser = JSON.parse(storedUser);
        if (userNameEl) userNameEl.textContent = this.currentUser.fullName || 'User';
        if (userRoleEl) userRoleEl.textContent = this.currentUser.role || 'Member';
      }
    } catch (err) {
      console.error('Failed to parse user session profile:', err);
    }
  }

  /**
   * Global Event Delegation & UI Helpers
   */
  setupEventListeners() {
    // Global Logout Delegation
    document.addEventListener('click', (e) => {
      if (e.target.matches('#logout-btn, #logout-btn *')) {
        e.preventDefault();
        this.handleLogout();
      }
    });

    // Close Error Popups
    document.addEventListener('click', (e) => {
      if (e.target.matches('.error-popup-close, .error-popup-close *')) {
        const popup = document.getElementById('global-error-popup');
        if (popup) popup.classList.add('hidden');
      }
    });
  }

  handleLogout() {
    localStorage.removeItem('stem_auth_token');
    localStorage.removeItem('stem_user_profile');
    if (window.firebase && window.firebase.auth) {
      window.firebase.auth().signOut();
    }
    window.location.href = '/login.html';
  }

  showErrorPopup(message) {
    let popup = document.getElementById('global-error-popup');
    if (!popup) {
      popup = document.createElement('div');
      popup.id = 'global-error-popup';
      popup.className = 'fixed bottom-4 right-4 z-50 bg-red-600 text-white px-6 py-4 rounded-lg shadow-xl flex items-center space-x-4 transition-all duration-300';
      popup.innerHTML = `
        <span class="error-message-text flex-1">${message}</span>
        <button class="error-popup-close font-bold text-lg hover:text-gray-200">&times;</button>
      `;
      document.body.appendChild(popup);
    } else {
      const textEl = popup.querySelector('.error-message-text');
      if (textEl) textEl.textContent = message;
      popup.classList.remove('hidden');
    }

    setTimeout(() => {
      if (popup) popup.classList.add('hidden');
    }, 6000);
  }
}

// Initialize global application controller on DOM content load
document.addEventListener('DOMContentLoaded', () => {
  window.StemApp = new AppController();
});
