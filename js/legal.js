// The privacy policy and terms of use: dialogs that open from their links
// and from their own addresses (/#privacy, /#terms), so they can be linked
// to from anywhere, emails included.

const DIALOGS = { '#privacy': 'privacyDialog', '#terms': 'termsDialog' };

function showFromHash() {
  const id = DIALOGS[location.hash];
  if (!id) return;
  const dialog = /** @type {HTMLDialogElement} */ (document.getElementById(id));
  document.querySelectorAll('dialog[open]').forEach((d) => {
    if (d !== dialog) /** @type {HTMLDialogElement} */ (d).close();
  });
  if (!dialog.open) dialog.showModal();
}

export function initLegal() {
  for (const id of Object.values(DIALOGS)) {
    const dialog = /** @type {HTMLDialogElement} */ (document.getElementById(id));
    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    // Closing drops the address, so the same link opens it again
    dialog.addEventListener('close', () => {
      if (DIALOGS[location.hash]) history.replaceState(null, '', location.pathname);
    });
  }
  window.addEventListener('hashchange', showFromHash);
  showFromHash();
}
