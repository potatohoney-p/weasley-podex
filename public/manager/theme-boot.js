(function () {
  try {
    var key = 'weasley-podex.uiTheme';
    var legacyKey = 'jaw.uiTheme';
    var saved = localStorage.getItem(key) || localStorage.getItem(legacyKey);
    if (!localStorage.getItem(key) && saved) localStorage.setItem(key, saved);
    localStorage.removeItem(legacyKey);
    if (saved !== 'dark' && saved !== 'light' && saved !== 'auto') saved = 'auto';
    document.documentElement.setAttribute('data-theme', saved);
  } catch (_) {
    document.documentElement.setAttribute('data-theme', 'auto');
  }
})();
