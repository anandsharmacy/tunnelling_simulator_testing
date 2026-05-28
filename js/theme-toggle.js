const THEME_STORAGE_KEY = "qp-theme-preference";

function getStoredTheme() {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark") return value;
  } catch {
    // Ignore storage failures (private mode, blocked storage, etc.)
  }
  return null;
}

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getResolvedTheme() {
  return getStoredTheme() ?? getSystemTheme();
}

function persistTheme(theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures.
  }
}

function applyTheme(theme) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", nextTheme);
  document.documentElement.style.colorScheme = nextTheme;
  window.dispatchEvent(
    new window.CustomEvent("qp-theme-change", { detail: { theme: nextTheme } }),
  );
  return nextTheme;
}

function syncToggleState(theme) {
  const toggle = document.getElementById("themeToggle");
  if (toggle) toggle.checked = theme === "dark";
}

function bindThemeToggle() {
  const toggle = document.getElementById("themeToggle");
  if (!toggle || toggle.dataset.bound === "true") return false;

  toggle.addEventListener("change", () => {
    const nextTheme = applyTheme(toggle.checked ? "dark" : "light");
    persistTheme(nextTheme);
    syncToggleState(nextTheme);
  });

  const container = toggle.closest(".header-theme");
  const leftLabel = container?.querySelector(".theme-label.left");
  const rightLabel = container?.querySelector(".theme-label.right");

  if (leftLabel) {
    leftLabel.addEventListener("click", () => {
      const nextTheme = applyTheme("light");
      persistTheme(nextTheme);
      syncToggleState(nextTheme);
    });
  }

  if (rightLabel) {
    rightLabel.addEventListener("click", () => {
      const nextTheme = applyTheme("dark");
      persistTheme(nextTheme);
      syncToggleState(nextTheme);
    });
  }

  toggle.dataset.bound = "true";
  return true;
}

function initializeTheme() {
  const theme = applyTheme(getResolvedTheme());
  syncToggleState(theme);
}

initializeTheme();

document.addEventListener("DOMContentLoaded", () => {
  if (bindThemeToggle()) return;

  const headerContainer =
    document.getElementById("header-container") || document.body;
  const observer = new window.MutationObserver(() => {
    if (bindThemeToggle()) {
      syncToggleState(
        document.documentElement.getAttribute("data-theme") || "light",
      );
      observer.disconnect();
    }
  });

  observer.observe(headerContainer, { childList: true, subtree: true });

  let attempts = 0;
  const maxAttempts = 30;
  const retryTimer = window.setInterval(() => {
    attempts += 1;
    if (bindThemeToggle() || attempts >= maxAttempts) {
      syncToggleState(
        document.documentElement.getAttribute("data-theme") || "light",
      );
      window.clearInterval(retryTimer);
      observer.disconnect();
    }
  }, 200);

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", () => {
    if (getStoredTheme()) return;
    const nextTheme = applyTheme(getSystemTheme());
    syncToggleState(nextTheme);
  });
});
