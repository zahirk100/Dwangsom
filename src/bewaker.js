/**
 * De bewaker: wat de aanvrager hoort te horen, zonder dat iemand eraan denkt.
 *
 * Tot nu toe hoorde een aanvrager na zijn welkomstmail niets meer, tenzij een
 * behandelaar zelf iets stuurde. Dat is precies verkeerd om: de momenten die
 * ertoe doen zijn *datums*, en een datum verstrijkt ook op een zondag.
 *
 * Er zijn twee soorten momenten, en ze werken allebei via deze module:
 *
 *   - **Datummomenten.** De beslistermijn loopt af; de hersteltermijn is om en
 *     de dwangsom begint te lopen. Niemand doet hier iets, de kalender doet
 *     het. Een dagelijkse taak (`/api/taken/bewaking`) loopt de dossiers af.
 *   - **Statusmomenten.** Een behandelaar zet de melding op verstuurd, of legt
 *     een toekenning vast. Dan mag de aanvrager dat meteen horen en niet pas
 *     de volgende ochtend, dus de server roept `bewaakDossier` ook direct na
 *     zo'n wijziging aan.
 *
 * Beide wegen komen uit bij dezelfde `bepaalBerichten`. Die is puur: dossier
 * plus datum erin, lijst berichten eruit. Daardoor is elk moment te toetsen
 * zonder mailserver, zonder opslag en zonder te wachten tot morgen.
 *
 * Dat een bericht maar één keer gaat, staat in het dossier zelf
 * (`dossier.berichten`) en niet in het geheugen van een proces. Serverloos
 * draait elk verzoek ergens anders; alleen de opslag onthoudt iets.
 */

import { UITKOMST } from '../public/shared/dwangsom.js';
import { labelBestuursorgaan } from '../public/shared/catalogus.js';
import { parseDatum, vandaag, verschilDagen } from '../public/shared/datum.js';
import { dossierStatus } from '../public/shared/dossier.js';

/** Statussen waarbij de zaak klaar is; daar mag niets meer automatisch uit. */
const AFGEROND = new Set(['toegekend', 'afgewezen', 'afgesloten']);

/** Na hoeveel dagen stilte we één keer aan ontbrekende stukken herinneren. */
export const HERINNERING_NA_DAGEN = 5;

/** Hoe vaak we een mislukte verzending opnieuw proberen voor we opgeven. */
export const MAX_POGINGEN = 3;

export const MOMENT = {
  TERMIJN_VERLOPEN: 'termijn-verlopen',
  MELDING_VERSTUURD: 'melding-verstuurd',
  DWANGSOM_LOOPT: 'dwangsom-loopt',
  STUKKEN_HERINNERING: 'stukken-herinnering',
  TOEGEKEND: 'toegekend',
};

function orgaanNaam(dossier) {
  const invoer = (dossier && dossier.invoer) || {};
  return invoer.organisatienaam
    || (invoer.bestuursorgaan ? labelBestuursorgaan(invoer.bestuursorgaan) : '')
    || 'de instantie';
}

/** Is deze datum vandaag of eerder? */
function bereikt(datum, nu) {
  const ms = parseDatum(datum);
  if (ms === null) return false;
  return verschilDagen(ms, nu) >= 0;
}

/**
 * Welke berichten horen er voor dit dossier inmiddels verstuurd te zijn?
 *
 * Puur: geen opslag, geen mail, geen `new Date()` tenzij je hem weglaat. Wat
 * er al uit is gegaan staat in `dossier.berichten` en wordt hier overgeslagen.
 *
 * @param {object} dossier
 * @param {number} [nu] UTC-middernacht van vandaag
 * @returns {Array<{sleutel: string, sjabloon: string, gegevens: object}>}
 */
export function bepaalBerichten(dossier, nu = vandaag()) {
  if (!dossier || !dossier.gebruikerId) return [];
  const contact = dossier.contact || {};
  if (!contact.email) return [];

  const rapport = dossier.rapport || {};
  const status = dossier.status || 'nieuw';
  const al = dossier.berichten || {};
  const orgaan = orgaanNaam(dossier);
  const basis = { naam: contact.naam, instantie: orgaan, referentie: dossier.referentie };

  const uit = [];
  const voegToe = (sleutel, sjabloon, extra = {}) => {
    const eerder = al[sleutel];
    // Verstuurd is klaar. Mislukt mag een paar keer opnieuw, maar niet
    // eindeloos: een adres dat hard weigert krijgt anders elke dag een poging.
    if (eerder && (eerder.verstuurdOp || (eerder.pogingen || 0) >= MAX_POGINGEN)) return;
    uit.push({ sleutel, sjabloon, gegevens: { ...basis, ...extra } });
  };

  // Een afgeronde zaak krijgt alleen nog het bericht dat hoort bij die
  // afronding. Geen herinneringen meer over stukken bij een zaak die al is
  // toegekend; dat is het soort mail waar mensen terecht boos van worden.
  if (status === 'toegekend') {
    const afhandeling = dossier.afhandeling || {};
    const bedrag = Number(afhandeling.bedragToegekend);
    voegToe(MOMENT.TOEGEKEND, 'toegekend', {
      bedrag: Number.isFinite(bedrag) && bedrag > 0
        ? `€ ${bedrag.toFixed(2).replace('.', ',')}`
        : 'het vastgestelde bedrag',
    });
    return uit;
  }
  if (AFGEROND.has(status)) return uit;

  // De behandelaar heeft de melding de deur uit gedaan.
  if (status === 'ingebrekestelling-verstuurd') {
    voegToe(MOMENT.MELDING_VERSTUURD, 'meldingVerstuurd');
  }

  // De beslistermijn is verstreken terwijl wij hem bewaakten.
  if (rapport.uitkomst === UITKOMST.TERMIJN_LOOPT
    && rapport.beslistermijn && bereikt(rapport.beslistermijn.einddatum, nu)) {
    voegToe(MOMENT.TERMIJN_VERLOPEN, 'termijnVerlopen');
  }

  // De hersteltermijn is om: vanaf vandaag telt de dwangsom.
  if (rapport.uitkomst === UITKOMST.HERSTELTERMIJN_LOOPT
    && rapport.berekening && bereikt(rapport.berekening.eersteDag, nu)) {
    voegToe(MOMENT.DWANGSOM_LOOPT, 'dwangsomLoopt');
  }

  // Er ontbreken stukken en het is stil gebleven. Eén keer, niet elke week:
  // wie er niets mee doet, doet er met de vierde mail ook niets mee.
  const ontbreekt = dossierStatus(dossier).ontbreekt.filter((s) => s.verplicht);
  const aangemaakt = dossier.aangemaaktOp ? Date.parse(dossier.aangemaaktOp) : NaN;
  const dagenOud = Number.isNaN(aangemaakt) ? 0 : verschilDagen(vandaag(new Date(aangemaakt)), nu);
  if (ontbreekt.length > 0 && dagenOud >= HERINNERING_NA_DAGEN) {
    voegToe(MOMENT.STUKKEN_HERINNERING, 'stukkenHerinnering', {
      stukken: ontbreekt.map((s) => s.label),
    });
  }

  return uit;
}

/**
 * Verstuurt wat er voor één dossier openstaat en tekent aan wat eruit is.
 *
 * Gooit nooit. Een dossier dat om wat voor reden ook niet lukt, mag de rest
 * van de ronde niet tegenhouden — anders houdt één kapot dossier de post van
 * alle anderen tegen.
 *
 * @returns {Promise<{verstuurd: string[], mislukt: string[]}>}
 */
export async function bewaakDossier(dossier, { store, gebruikers, verstuur, siteUrl, nu }) {
  const verstuurd = [];
  const mislukt = [];
  let berichten;
  try {
    berichten = bepaalBerichten(dossier, nu);
  } catch (err) {
    console.error(`[bewaker] ${dossier && dossier.referentie}: bepalen mislukt:`, err.message);
    return { verstuurd, mislukt };
  }
  if (berichten.length === 0) return { verstuurd, mislukt };

  for (const bericht of berichten) {
    try {
      // Elke mail krijgt een eigen verse inloglink. Een oude link uit een
      // eerdere mail is allang verlopen, en de aanvrager hoort niet eerst een
      // nieuwe te moeten aanvragen om te zien wat wij hem melden.
      const token = await gebruikers.maakKoppeling(dossier.gebruikerId, 'magic');
      const antwoord = await verstuur({
        aan: dossier.contact.email,
        sjabloon: bericht.sjabloon,
        gegevens: { ...bericht.gegevens, url: `${siteUrl}/mijn?t=${encodeURIComponent(token)}` },
      });
      if (antwoord && antwoord.gelukt) {
        await store.noteerBericht(dossier.id, bericht.sleutel, { gelukt: true });
        verstuurd.push(bericht.sleutel);
      } else {
        await store.noteerBericht(dossier.id, bericht.sleutel, { gelukt: false });
        mislukt.push(bericht.sleutel);
      }
    } catch (err) {
      console.error(`[bewaker] ${dossier.referentie} / ${bericht.sleutel}:`, err.message);
      try {
        await store.noteerBericht(dossier.id, bericht.sleutel, { gelukt: false });
      } catch { /* opslag is even weg; volgende ronde opnieuw */ }
      mislukt.push(bericht.sleutel);
    }
  }
  return { verstuurd, mislukt };
}

/**
 * De dagelijkse ronde langs alle dossiers.
 *
 * @returns {Promise<{bekeken: number, verstuurd: number, mislukt: number, per: object}>}
 */
export async function loopBewakingAf({ store, gebruikers, verstuur, siteUrl, nu = vandaag() }) {
  const dossiers = await store.opslag.haalAlle();
  const per = {};
  let verstuurd = 0;
  let mislukt = 0;
  for (const dossier of dossiers) {
    const uitslag = await bewaakDossier(dossier, { store, gebruikers, verstuur, siteUrl, nu });
    for (const sleutel of uitslag.verstuurd) per[sleutel] = (per[sleutel] || 0) + 1;
    verstuurd += uitslag.verstuurd.length;
    mislukt += uitslag.mislukt.length;
  }
  return { bekeken: dossiers.length, verstuurd, mislukt, per };
}
