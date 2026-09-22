/**
 * Wat de aanvrager over zijn eigen zaak leest.
 *
 * Twee dingen gingen hier eerder mis, allebei omdat de tekst uit een module
 * kwam die voor de behandelaar geschreven was:
 *
 *   - "De instantie heeft nog twee weken" terwijl in hetzelfde dossier UWV
 *     staat. Wie zijn eigen dossier opent, weet op wie hij wacht.
 *   - "De eigen ingebrekestelling van de aanvrager" als kop boven een
 *     uploadknop voor diezelfde aanvrager.
 *
 * Het tweede zit in mijn.js en is browsercode; deze toets bewaakt het eerste
 * en de stukkenlijst waar de tweede uit voortkomt.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { klantSamenvatting, klantTijdlijn } from '../public/shared/tijdlijn.js';
import { UITKOMST } from '../public/shared/dwangsom.js';

const dossier = (uitkomst, extra = {}) => ({
  status: 'nieuw',
  invoer: { bestuursorgaan: 'uwv', zaaktype: 'uwv-wia', ...(extra.invoer || {}) },
  rapport: { uitkomst },
  ...extra,
});

test('de samenvatting noemt de instantie bij naam', () => {
  assert.match(klantSamenvatting(dossier(UITKOMST.HERSTELTERMIJN_LOOPT)).kop, /^UWV heeft nog twee weken$/);
  assert.match(klantSamenvatting(dossier(UITKOMST.INGEBREKESTELLING_NODIG)).kop, /UWV/);
  assert.match(klantSamenvatting(dossier(UITKOMST.TERMIJN_LOOPT)).tekst, /UWV/);
});

test('een eigen organisatienaam gaat voor het catalogus-label', () => {
  const eigen = dossier(UITKOMST.HERSTELTERMIJN_LOOPT, { invoer: { organisatienaam: 'Gemeente Almere' } });
  assert.match(klantSamenvatting(eigen).kop, /^Gemeente Almere heeft nog twee weken$/);
});

test('zonder bekende instantie blijft er een leesbare zin staan', () => {
  const leeg = { status: 'nieuw', invoer: {}, rapport: { uitkomst: UITKOMST.HERSTELTERMIJN_LOOPT } };
  assert.equal(klantSamenvatting(leeg).kop, 'De instantie heeft nog twee weken');
});

test('de tijdlijn noemt de instantie bij naam', () => {
  const stappen = klantTijdlijn(dossier(UITKOMST.INGEBREKESTELLING_NODIG));
  const melding = stappen.find((s) => s.sleutel === 'melding');
  const herstel = stappen.find((s) => s.sleutel === 'hersteltermijn');
  assert.match(melding.titel, /UWV/);
  assert.match(herstel.titel, /^UWV krijgt nog twee weken$/);
});

test('de samenvatting zegt nooit dat de klant zelf iets moet stellen', () => {
  for (const uitkomst of Object.values(UITKOMST)) {
    const samen = klantSamenvatting(dossier(uitkomst));
    assert.doesNotMatch(`${samen.kop} ${samen.tekst}`, /in gebreke/i);
  }
});

test('een toegekend bedrag leest als Nederlands geld', () => {
  // Stond als "€ 1442,00" terwijl er twee regels lager "€ 1.442,00" staat.
  const samen = klantSamenvatting({ status: 'toegekend', afhandeling: { bedragToegekend: 1442 } });
  assert.match(samen.tekst, /€ 1\.442,00/);
});
