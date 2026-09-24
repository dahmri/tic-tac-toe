// Tells the server about errors in players' browsers, so bugs that only
// happen on someone else's device show up in the server's log. At most a
// few per page, each one once, and never anything personal: just the
// message, where it happened, and the page's language.

const MAX_REPORTS = 5;
const sent = new Set();

function report(kind, message, stack) {
  const text = String(message || 'Unknown error').slice(0, 300);
  if (sent.size >= MAX_REPORTS || sent.has(text)) return;
  sent.add(text);
  const body = JSON.stringify({
    kind,
    message: text,
    stack: String(stack || '').slice(0, 1500),
    page: location.pathname,
    lang: document.documentElement.lang,
    userAgent: navigator.userAgent.slice(0, 200),
  });
  try {
    fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true, // still sent if the page is closing
    }).catch(() => {});
  } catch {
    /* reporting must never break the page */
  }
}

export function initMonitor() {
  window.addEventListener('error', (e) => report('error', e.message, e.error?.stack));
  window.addEventListener('unhandledrejection', (e) =>
    report('rejection', e.reason?.message ?? e.reason, e.reason?.stack),
  );
}
