// Register the service worker — this is what enables offline + "installed app" behaviour.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}

const $ = (id) => document.getElementById(id);

// Home: status line tells you whether iOS launched this standalone (from the home screen).
const status = $('status');
if (status) {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  status.textContent = `${standalone ? 'standalone ✓' : 'in browser'} · ${navigator.onLine ? 'online' : 'offline'}`;
}

const ping = $('ping');
if (ping) {
  let n = 0;
  ping.addEventListener('click', () => { ping.textContent = `Tapped ${++n}×`; });
}

// Counter: persisted so you can kill the app and reopen it.
const count = $('count');
if (count) {
  const render = () => { count.textContent = localStorage.getItem('count') || '0'; };
  $('inc').addEventListener('click', () => {
    localStorage.setItem('count', String(Number(localStorage.getItem('count') || 0) + 1));
    render();
  });
  $('reset').addEventListener('click', () => { localStorage.removeItem('count'); render(); });
  render();
}
