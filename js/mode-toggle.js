// js/mode-toggle.js
// Handles navigation toggle between simulator (index.html) and numerical mode (numerical-mode.html).

function getCurrentPageName() {
  const path = window.location.pathname || '';
  const page = path.substring(path.lastIndexOf('/') + 1);
  return page || 'index.html';
}

function bindModeToggle() {
  const toggle = document.getElementById('modeToggle');
  if (!toggle || toggle.dataset.bound === 'true') return false;

  const onNumericalPage = getCurrentPageName() === 'numerical-mode.html';
  toggle.checked = onNumericalPage;

  const navigateByState = () => {
    const target = toggle.checked ? 'numerical-mode.html' : 'index.html';
    if (getCurrentPageName() !== target) {
      window.location.href = target;
    }
  };

  toggle.addEventListener('change', navigateByState);
  toggle.addEventListener('input', navigateByState);

  const container = toggle.closest('.header-toggle');
  const leftLabel = container?.querySelector('.mode-label.left');
  const rightLabel = container?.querySelector('.mode-label.right');

  if (leftLabel) {
    leftLabel.addEventListener('click', () => {
      toggle.checked = false;
      navigateByState();
    });
  }

  if (rightLabel) {
    rightLabel.addEventListener('click', () => {
      toggle.checked = true;
      navigateByState();
    });
  }

  toggle.dataset.bound = 'true';
  return true;
}

document.addEventListener('DOMContentLoaded', () => {
  if (bindModeToggle()) return;

  const headerContainer = document.getElementById('header-container') || document.body;
  const observer = new window.MutationObserver(() => {
    if (bindModeToggle()) observer.disconnect();
  });

  observer.observe(headerContainer, { childList: true, subtree: true });

  let attempts = 0;
  const maxAttempts = 30;
  const retryTimer = window.setInterval(() => {
    attempts += 1;
    if (bindModeToggle() || attempts >= maxAttempts) {
      window.clearInterval(retryTimer);
      observer.disconnect();
    }
  }, 200);
});
