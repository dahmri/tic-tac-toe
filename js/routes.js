// Addresses for the big dialogs (/#stats, /#leaderboard, /#profile,
// /#arena, /#admin), like the legal pages have: a link opens one, opening
// one adds its address to the history (so the back button closes it), and
// closing it takes the address away again.
//
// A dialog opens the way its button does, so the button being hidden (a
// guest has no Stats) means the address does nothing.

const ROUTES = {
  '#stats': { dialog: 'statsDialog', button: 'statsBtn' },
  '#leaderboard': { dialog: 'leaderboardDialog', button: 'leaderboardBtn' },
  '#profile': { dialog: 'profileDialog', button: 'profileBtn' },
  '#arena': { dialog: 'arenaDialog', button: 'arenaStandingsBtn' },
  '#admin': { dialog: 'adminDialog', button: 'adminBtn' },
};

const $ = (id) => /** @type {any} */ (document.getElementById(id));
let ready = false;

const drop = () => history.replaceState(history.state, '', location.pathname + location.search);

// Opens the dialog the address names, if its button is there to press
export function followRoute() {
  ready = true;
  const route = ROUTES[location.hash];
  if (!route) return;
  const dialog = $(route.dialog);
  if (dialog.open) return;
  const button = $(route.button);
  // Hidden for this player (a guest's Stats, a player's Admin): nothing to open
  if (!button || button.hidden) {
    drop();
    return;
  }
  button.click();
}

export function initRoutes() {
  for (const [hash, { dialog: id }] of Object.entries(ROUTES)) {
    const dialog = $(id);
    // Opened, the address follows; closed, it goes at once (the observer
    // runs straight after the change, before the dialog's close event, so a
    // reload right after closing doesn't open it again)
    new MutationObserver(() => {
      if (dialog.open && location.hash !== hash) history.pushState({ dialog: id }, '', hash);
      else if (!dialog.open && location.hash === hash) drop();
    }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  }
  // Back or forward: open or close to match the address
  window.addEventListener('popstate', () => {
    for (const [hash, { dialog: id }] of Object.entries(ROUTES)) {
      if ($(id).open && location.hash !== hash) $(id).close();
    }
    if (ready) followRoute();
  });
  window.addEventListener('hashchange', () => {
    if (ready) followRoute();
  });
}
