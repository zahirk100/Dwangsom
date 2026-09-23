/**
 * De meetmelding vanuit de browser.
 *
 * Zo klein mogelijk gehouden, en met opzet zonder enige vorm van opslag: geen
 * cookie, geen localStorage, geen bezoeker-id. Er wordt geteld, niet gevolgd.
 * Daardoor is hier ook geen toestemming voor nodig - er wordt niets op het
 * apparaat van de bezoeker gezet of gelezen.
 *
 * `sendBeacon` waar het kan: dat overleeft het wegklikken van de pagina,
 * terwijl een gewone fetch dan wordt afgebroken. Juist de laatste gebeurtenis
 * voor vertrek is degene die je wilt weten.
 *
 * Mislukt het? Dan gebeurt er niets. Een meetmelding mag nooit een reden zijn
 * dat er iets op het scherm misgaat.
 */

/** De herkomst uit de url, als die er is. Wordt niet bewaard. */
function bron() {
  try {
    const p = new URLSearchParams(location.search);
    return p.get('bron') || p.get('utm_source') || '';
  } catch { return ''; }
}

/** Alleen de host van de verwijzer, nooit het hele adres. */
function verwijzer() {
  try { return document.referrer ? new URL(document.referrer).hostname : ''; } catch { return ''; }
}

export function meet(gebeurtenis, extra = {}) {
  try {
    const lading = JSON.stringify({
      g: gebeurtenis, b: bron(), v: verwijzer(),
      ...(gebeurtenis === 'bezoek' ? { p: location.pathname } : {}),
      ...extra,
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/meting', new Blob([lading], { type: 'application/json' }));
      return;
    }
    fetch('/api/meting', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: lading, keepalive: true,
    }).catch(() => {});
  } catch { /* meten mag nooit iets kosten */ }
}

// Elke pagina die dit script laadt, telt één bezoek.
meet('bezoek');

// Zodat andere scripts hem kunnen gebruiken zonder te importeren.
window.nbMeet = meet;
