{
  const THEME_KEY = 'theme';
  const LIGHT = 'light';
  try { if (localStorage.getItem(THEME_KEY) === LIGHT) document.documentElement.dataset.theme = LIGHT; } catch {}
}
