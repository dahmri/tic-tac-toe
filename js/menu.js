// On phones the account links fold behind a Menu button (styles.css). A
// choice, Escape or a tap elsewhere closes it.

const $ = (id) => /** @type {any} */ (document.getElementById(id));

export function initMenu() {
  const button = $('menuBtn');
  const links = $('accountLinks');
  const set = (open) => {
    links.classList.toggle('open', open);
    button.setAttribute('aria-expanded', String(open));
  };
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !links.classList.contains('open');
    set(open);
    if (open) links.querySelector('button:not([hidden])')?.focus();
  });
  links.addEventListener('click', (e) => {
    if (e.target.closest('button')) set(false);
  });
  document.addEventListener('click', (e) => {
    if (!links.contains(e.target)) set(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && links.classList.contains('open')) {
      set(false);
      button.focus();
    }
  });
}
