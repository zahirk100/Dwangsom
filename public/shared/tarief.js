/**
 * Wat kost het de klant?
 *
 * Dit is de enige plek waar de vergoeding staat, en hij komt uit de omgeving.
 * Reden: een percentage is een bedrijfsbeslissing, geen code, en het staat op
 * te veel plekken om het te kopiëren (homepage, funnel, machtiging,
 * voorwaarden).
 *
 * Het gekozen tarief is **25% van de toegekende dwangsom**, en dat staat
 * hieronder als standaard. De afweging waarom een percentage en geen vast
 * bedrag staat in docs/livegang.md: de dwangsom loopt van € 23 tot € 1.442,
 * dus een vast bedrag is bij een kleine zaak hoger dan de hele vergoeding.
 *
 * Dat percentage is een **consumentenprijs en dus inclusief btw**. Verandert
 * het tarief, zet dan de omgevingsvariabele; die gaat vóór de standaard, zodat
 * je het kunt wijzigen zonder de code aan te raken.
 *
 * Instellen met één van deze twee:
 *   TARIEF_PERCENTAGE=25      een deel van de toegekende dwangsom
 *   TARIEF_VAST=129           een vast bedrag per toegekende zaak
 *
 * Zet je ze allebei op leeg (TARIEF_PERCENTAGE=0), dan noemt de site géén
 * getal en zegt hij dat je het vooraf hoort. Die stand blijft bestaan omdat
 * een verzonnen percentage op een pagina waar iemand tekent erger is dan geen
 * percentage.
 */

/** Het gekozen tarief, als er niets in de omgeving staat. */
export const STANDAARD_PERCENTAGE = 25;

/** @typedef {{soort: string, percentage: number, bedrag: number, bekend: boolean}} Tarief */

/**
 * @param {object} env
 * @returns {Tarief}
 */
export function tarief(env = {}) {
  const heeftPercentage = String(env.TARIEF_PERCENTAGE ?? '').trim() !== '';
  const heeftVast = String(env.TARIEF_VAST ?? '').trim() !== '';
  const percentage = Number(env.TARIEF_PERCENTAGE);
  const vast = Number(env.TARIEF_VAST);

  if (heeftPercentage && Number.isFinite(percentage) && percentage > 0 && percentage < 100) {
    return { soort: 'percentage', percentage, bedrag: 0, bekend: true };
  }
  if (heeftVast && Number.isFinite(vast) && vast > 0) {
    return { soort: 'vast', percentage: 0, bedrag: vast, bekend: true };
  }
  // Is er uitdrukkelijk iets ingevuld dat niet klopt (een 0, een letter), dan
  // is dat een keuze om geen bedrag te noemen; dan niet stilletjes terugvallen
  // op de standaard.
  if (heeftPercentage || heeftVast) return { soort: 'onbekend', percentage: 0, bedrag: 0, bekend: false };
  return { soort: 'percentage', percentage: STANDAARD_PERCENTAGE, bedrag: 0, bekend: true };
}

/**
 * Wat blijft er van een bedrag over na onze vergoeding?
 *
 * Dit is wat de aanvrager wil weten en wat hij zelf niet gaat uitrekenen.
 * @returns {{bedrag: number, vergoeding: number, overhoudt: number}|null}
 */
export function tariefSplitsing(t, bedrag) {
  const totaal = Number(bedrag);
  if (!t.bekend || !Number.isFinite(totaal) || totaal <= 0) return null;
  const vergoeding = t.soort === 'percentage'
    ? Math.round((totaal * t.percentage) / 100 * 100) / 100
    : Math.min(t.bedrag, totaal);
  return { bedrag: totaal, vergoeding, overhoudt: Math.round((totaal - vergoeding) * 100) / 100 };
}

/** Dezelfde bedragen, als leesbare tekst. */
export function euroTekst(bedrag) {
  return euroKort(bedrag);
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
