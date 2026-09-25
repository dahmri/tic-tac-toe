// Runs before the page is drawn (a plain script in <head>), so a chosen
// light or dark theme shows from the first frame. theme.js does the rest.
try {
  const theme = localStorage.getItem('pencil-ttt-theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {
  /* storage unavailable: follow the system */
}
