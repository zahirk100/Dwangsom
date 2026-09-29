/**
 * Brieven lezen, één voor één.
 *
 * Waarom niet alles in één verzoek? Omdat dat precies de fout was die het
 * uploaden van vijf brieven liet stranden. Een stapel van vijf pdf's is zo
 * acht megabyte, en dan loop je tegen twee grenzen tegelijk: de grootte van
 * een verzoek en de ruimte die een tabblad mag bewaren. Bij één brief per
 * verzoek bestaan die grenzen niet meer, kan er onderweg worden verteld
 * hoever we zijn, en houdt één onleesbaar bestand de rest niet tegen.
 *
 * Het samenvoegen gebeurt hier in de browser met `shared/dossierlezer.js` -
 * dezelfde regels die ook op de server gelden.
 */

import { leesDossier } from '/shared/dossierlezer.js';

/** Hoeveel brieven iemand in één keer kan laten lezen. */
export const MAX_BRIEVEN = 5;

const MAX_ZIJDE = 2200;

function base64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binair = '';
  for (let i = 0; i < bytes.length; i += 1) binair += String.fromCharCode(bytes[i]);
  return btoa(binair);
}

/**
 * Een telefoonfoto is al gauw vijf megabyte, terwijl de tekst op de brief bij
 * 2200 pixels ruim leesbaar blijft. Verkleinen scheelt wachttijd en kosten.
 */
async function verkleindeFoto(bestand) {
  if (!/^image\//i.test(bestand.type || '') || typeof createImageBitmap !== 'function') return null;
  try {
    const beeld = await createImageBitmap(bestand);
    const factor = Math.min(1, MAX_ZIJDE / Math.max(beeld.width, beeld.height));
    const doek = document.createElement('canvas');
    doek.width = Math.round(beeld.width * factor);
    doek.height = Math.round(beeld.height * factor);
    doek.getContext('2d').drawImage(beeld, 0, 0, doek.width, doek.height);
    const blob = await new Promise((klaar) => doek.toBlob(klaar, 'image/jpeg', 0.85));
    if (!blob || blob.size >= bestand.size) return null;
    return { mediaType: 'image/jpeg', data: base64(await blob.arrayBuffer()) };
  } catch {
    return null;
  }
}

/** Een gekozen bestand als iets dat verstuurd kan worden. */
export async function alsLading(bestand) {
  const kleiner = await verkleindeFoto(bestand);
  return {
    bestandsnaam: bestand.name,
    mediaType: kleiner ? kleiner.mediaType : (bestand.type || ''),
    data: kleiner ? kleiner.data : base64(await bestand.arrayBuffer()),
  };
}

/**
 * Uit een keuze van de bezoeker: de bestanden die inhoud hebben.
 *
 * Standaard hooguit vijf. De campagnelanding laat iemand in meerdere rondes
 * kiezen en telt zelf hoeveel er al liggen; die geeft daarom een eigen grens
 * mee, anders zou elke ronde opnieuw vijf bestanden mogen opleveren.
 */
export function gekozenBestanden(bestanden, grens = MAX_BRIEVEN) {
  const met = [...(bestanden || [])].filter((b) => b && b.size > 0);
  return Number.isFinite(grens) ? met.slice(0, grens) : met;
}

/**
 * Hoe lang wij op één brief wachten.
 *
 * Een pdf met tekstlaag is er in een oogwenk; een foto moet door
 * tekstherkenning heen en dat duurt seconden tot tientallen seconden. Daar
 * hoort een grens bij, en die stond er niet: bleef het antwoord uit, dan bleef
 * het verzoek eeuwig openstaan. Op het scherm zag je dan "Wij lezen je
 * brief..." met een knop die uit bleef, voorgoed. Dat is de ergste soort
 * storing, want er is niets te doen - zelfs niet opnieuw proberen.
 *
 * Deze grens ligt met opzet boven die van de tekstherkenning zelf (zie
 * `src/tekstherkenning.js`), zodat de server normaal gesproken eerst met een
 * echte reden komt en de bezoeker niet met "het duurde te lang" wordt
 * afgescheept terwijl wij weten wat er mis was.
 */
export const WACHTTIJD_MS = 40000;

/** Niet elke browser kent AbortSignal.timeout; daar geldt dan de oude situatie. */
function afbreeksein(ms) {
  try {
    return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(ms)
      : undefined;
  } catch {
    return undefined;
  }
}

async function leesEen(lading, { wachttijd = WACHTTIJD_MS } = {}) {
  let antwoord;
  try {
    antwoord = await fetch('/api/brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lading),
      signal: afbreeksein(wachttijd),
    });
  } catch (oorzaak) {
    // Hier komen we bij een verbroken verbinding en bij onze eigen grens. In
    // beide gevallen weten wij niet wat er mis ging, dus zeggen we dat ook.
    const verlopen = oorzaak && oorzaak.name === 'TimeoutError';
    const fout = new Error(verlopen
      ? 'Het lezen van deze brief duurde te lang.'
      : 'Wij konden deze brief niet versturen.');
    fout.hint = verlopen
      ? 'Probeer het nog een keer. Lukt het weer niet, stuur de brief dan als pdf.'
      : 'Controleer je internetverbinding en probeer het nog een keer.';
    throw fout;
  }
  const data = await antwoord.json().catch(() => ({}));
  if (!antwoord.ok) {
    const fout = new Error(data.fout || 'Wij konden deze brief niet lezen.');
    fout.hint = data.hint;
    throw fout;
  }
  return data;
}

/**
 * Leest een stapel brieven en zegt wat ze samen betekenen.
 *
 * @param {Array} ladingen
 * @param {{bijVoortgang?: (klaar: number, totaal: number) => void}} [opties]
 * @returns {Promise<{brieven, opmerkingen, invoer, herkenning, mislukt, gelezen}>}
 */
export async function leesBrieven(ladingen, { bijVoortgang } = {}) {
  const gelezen = [];
  const mislukt = [];

  for (let i = 0; i < ladingen.length; i += 1) {
    if (bijVoortgang) bijVoortgang(i, ladingen.length);
    try {
      const data = await leesEen(ladingen[i]);
      gelezen.push({
        bestandsnaam: ladingen[i].bestandsnaam,
        herkenning: data.herkenning,
        brief: data.brief,
      });
    } catch (fout) {
      mislukt.push({ bestandsnaam: ladingen[i].bestandsnaam, fout: fout.message, hint: fout.hint });
    }
  }
  if (bijVoortgang) bijVoortgang(ladingen.length, ladingen.length);

  if (gelezen.length === 0) {
    const fout = new Error(mislukt[0] ? mislukt[0].fout : 'Wij konden deze brieven niet lezen.');
    fout.hint = mislukt[0] ? mislukt[0].hint : '';
    throw fout;
  }

  return { ...combineer(gelezen), gelezen, mislukt };
}

/**
 * Wat gelezen brieven samen betekenen.
 *
 * Staat los van het lezen, want de campagnelanding leest ze daar al en geeft
 * alleen het resultaat door aan de funnel. Die hoeft ze dan niet nog een keer
 * te versturen.
 */
export function combineer(gelezen) {
  const dossier = leesDossier(gelezen);
  const verlenging = gelezen.find((b) => b.herkenning.soortBrief === 'verlenging') || null;
  const hoofd = dossier.hoofdbrief || gelezen[0];

  return {
    brieven: dossier.brieven,
    opmerkingen: dossier.opmerkingen,
    invoer: dossier.invoer,
    herkenning: hoofd.herkenning,
    brief: hoofd.brief,
    verlengbrief: verlenging ? verlenging.brief : null,
    alleBrieven: gelezen.map((b) => b.brief),
    gelezen,
    mislukt: [],
  };
}
