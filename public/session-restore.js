(() => {
  const SESSION_KEY = 'bjb_session';
  function restore() {
    const token = localStorage.getItem(SESSION_KEY);
    if (!token || typeof show !== 'function') return;
    fetch('/api/markets', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => { if (!r.ok) throw new Error('session'); return r.json(); })
      .then(() => {
        if (typeof show === 'function') show('dashboard');
        if (typeof loadMarkets === 'function') loadMarkets();
      })
      .catch(() => {
        localStorage.removeItem(SESSION_KEY);
      });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', restore, { once: true });
  else restore();
})();
