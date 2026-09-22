/**
 * Wat kost het de klant?
 *
 * Dit is de enige plek waar de vergoeding staat, en hij komt uit de omgeving.
 * Reden: een percentage is een bedrijfsbeslissing, geen code, en het staat op
 * te veel plekken om het te kopiëren (homepage, funnel, machtiging,
 * voorwaarden).
 *
 * Staat er niets ingesteld, dan noemt de site géén getal. Dat is met opzet:
 * een verzonnen percentage op een pagina waar iemand zijn handtekening zet, is
 * erger dan geen percentage. De site zegt dan eerlijk dat je het vooraf te
 * horen krijgt, en `ontbrekendTarief()` zet het op de lijst met dingen die
 * vóór livegang geregeld moeten zijn.
 *
 * Instellen met één van deze twee:
 *   TARIEF_PERCENTAGE=25      een deel van de toegekende dwangsom
 *   TARIEF_VAST=129           een vast bedrag per toegekende zaak
 */

/** @typedef {{soort: string, percentage: number, bedrag: number, bekend: boolean}} Tarief */

/**
 * @param {object} env
 * @returns {Tarief}
 */
export function tarief(env = {}) {
  const percentage = Number(env.TARIEF_PERCENTAGE);
  const vast = Number(env.TARIEF_VAST);

  if (Number.isFinite(percentage) && percentage > 0 && percentage < 100) {
    return { soort: 'percentage', percentage, bedrag: 0, bekend: true };
  }
  if (Number.isFinite(vast) && vast > 0) {
    return { soort: 'vast', percentage: 0, bedrag: vast, bekend: true };
  }
  return { soort: 'onbekend', percentage: 0, bedrag: 0, bekend: false };
}

/** Nederlandse notatie: punt voor duizendtallen, komma voor centen. */
const euroKort = (bedrag) => {
  const heel = Math.trunc(Math.abs(bedrag));
  const centen = Math.round((Math.abs(bedrag) - heel) * 100);
  const metPunten = String(heel).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `€ ${metPunten}${centen ? `,${String(centen).padStart(2, '0')}` : ''}`;
};

/** Eén regel die zegt wat het kost. Altijd waar, ook zonder ingesteld tarief. */
export function tariefZin(t) {
  if (!t.bekend) {
    return 'Wordt er een dwangsom toegekend, dan hoor je vooraf precies wat onze vergoeding is.';
  }
  if (t.soort === 'percentage') {
    return `Wordt er een dwangsom toegekend, dan is onze vergoeding ${t.percentage}% van het `
      + 'bedrag dat je ontvangt.';
  }
  return `Wordt er een dwangsom toegekend, dan is onze vergoeding ${euroKort(t.bedrag)}.`;
}

/**
 * Een rekenvoorbeeld, want een percentage alleen zegt mensen weinig.
 * @returns {string} lege tekst als er geen tarief bekend is
 */
export function tariefVoorbeeld(t, ontvangen = 1000) {
  if (!t.bekend) return '';
  const kosten = t.soort === 'percentage' ? (ontvangen * t.percentage) / 100 : Math.min(t.bedrag, ontvangen);
  return `Rekenvoorbeeld: ontvang je ${euroKort(ontvangen)}, dan is onze vergoeding `
    + `${euroKort(kosten)} en houd jij ${euroKort(ontvangen - kosten)} over.`;
}

/** Kort, voor in een opsomming of op een knop. */
export function tariefKort(t) {
  if (!t.bekend) return 'vooraf bekend';
  return t.soort === 'percentage' ? `${t.percentage}% van de vergoeding` : `${euroKort(t.bedrag)} per zaak`;
}

/** Voor de afvinklijst bij livegang: is dit al geregeld? */
export function ontbrekendTarief(env = {}) {
  return tarief(env).bekend
    ? ''
    : 'TARIEF_PERCENTAGE of TARIEF_VAST is niet ingesteld; de site noemt daarom geen bedrag.';
}
