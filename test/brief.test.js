/**
 * De brief is de intake: als de herkenning verschuift, verschuift de hele
 * funnel mee. Deze tests draaien op de voorbeeldbrieven in voorbeelden/,
 * zodat een aanpassing aan de patronen meteen zichtbaar wordt.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pdfNaarTekst } from '../src/pdftekst.js';
import { herkenBrief, herkendeVelden, naarInvoer } from '../src/briefherkenning.js';
import { leesBrief } from '../src/brieflezer.js';
import { berekenDwangsom, UITKOMST } from '../public/shared/dwangsom.js';

const MAP = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'voorbeelden');
const lees = (naam) => fs.readFileSync(path.join(MAP, naam));
const tekstVan = (naam) => lees(naam).toString('utf8');

test('uit een pdf met tekstlaag komt de tekst van de brief', () => {
  const resultaat = pdfNaarTekst(lees('uwv-wia-ontvangstbevestiging.pdf'));
  assert.equal(resultaat.gelukt, true);
  assert.match(resultaat.tekst, /UWV/);
  assert.match(resultaat.tekst, /uiterlijk 14 september 2026/);
  assert.match(resultaat.tekst, /123456789/);
});

test('iets dat geen pdf is, wordt als zodanig herkend', () => {
  const resultaat = pdfNaarTekst(Buffer.from('gewoon wat tekst'));
  assert.equal(resultaat.gelukt, false);
  assert.match(resultaat.reden, /geen pdf/i);
});

test('de UWV-ontvangstbevestiging levert alles op wat de funnel nodig heeft', () => {
  const h = herkenBrief(tekstVan('uwv-wia-ontvangstbevestiging.txt'));
  assert.equal(h.soortBrief, 'ontvangstbevestiging');
  assert.equal(h.bestuursorgaan, 'uwv');
  assert.equal(h.zaaktype, 'uwv-wia');
  assert.equal(h.beslisdatum, '2026-09-14');
  assert.equal(h.aanvraagdatum, '2026-07-10');
  assert.equal(h.naam, 'S. Javaid');
  assert.equal(h.adres, 'Straatnaam 12');
  assert.equal(h.postcode, '1234 AB');
  assert.equal(h.woonplaats, 'Amsterdam');
  assert.match(h.kenmerk, /123456789/);
  assert.deepEqual(herkendeVelden(h).ontbreekt, []);
});

test('een gemeentebrief levert de gemeentenaam en de datum uit de zin ervoor', () => {
  const h = herkenBrief(tekstVan('gemeente-bijstand-ontvangstbevestiging.txt'));
  assert.equal(h.bestuursorgaan, 'gemeente');
  assert.equal(h.organisatienaam, 'Gemeente Zwolle');
  assert.equal(h.zaaktype, 'gem-bijstand');
  assert.equal(h.beslisdatum, '2026-06-29');
  assert.equal(h.aanvraagdatum, '2026-05-04', 'de datum staat vóór het kernwoord');
});

test('DUO wordt herkend, inclusief het burgerservicenummer uit de brief', () => {
  const h = herkenBrief(tekstVan('duo-studiefinanciering-ontvangstbevestiging.txt'));
  assert.equal(h.bestuursorgaan, 'duo');
  assert.equal(h.zaaktype, 'duo-studiefinanciering');
  assert.equal(h.beslisdatum, '2026-04-06');
  assert.equal(h.bsn, '111222333');
});

test('bij een verlengingsbrief telt de nieuwe datum, niet de oude', () => {
  const h = herkenBrief(tekstVan('uwv-verlenging-beslistermijn.txt'));
  assert.equal(h.soortBrief, 'verlenging');
  assert.equal(h.beslisdatum, '2026-10-26', 'de brief noemt eerst 14 september als oude datum');

  const invoer = naarInvoer(h);
  assert.equal(invoer.verdaagd, true);
  assert.equal(invoer.termijnEinddatum, '2026-10-26');
});

test('"u kunt bezwaar maken" onderaan een beslissing maakt er geen bezwaarzaak van', () => {
  const h = herkenBrief(tekstVan('uwv-beslissing-genomen.txt'));
  assert.equal(h.soortBrief, 'beslissing');
  assert.equal(h.zaaktype, 'uwv-wia', 'niet uwv-bezwaar');

  const rapport = berekenDwangsom({ ...naarInvoer(h), basisdatum: '2026-07-10', peildatum: '2026-09-21' });
  assert.equal(rapport.uitkomst, UITKOMST.GEEN_RECHT, 'met een besluit stopt de procedure');
});

test('een lopend bezwaar wordt wel als bezwaarzaak herkend', () => {
  const h = herkenBrief(tekstVan('uwv-bezwaar-ontvangstbevestiging.txt'));
  assert.equal(h.zaaktype, 'uwv-bezwaar');
  assert.equal(h.beslisdatum, '2026-06-03');
});

test('de herkende brief rekent door tot een uitkomst', () => {
  const h = herkenBrief(tekstVan('uwv-wia-ontvangstbevestiging.txt'));
  const rapport = berekenDwangsom({ ...naarInvoer(h), peildatum: '2026-09-21' });
  assert.equal(rapport.uitkomst, UITKOMST.INGEBREKESTELLING_NODIG);
  assert.equal(rapport.beslistermijn.einddatum, '2026-09-14');
  assert.equal(rapport.beslistermijn.bron, 'opgave-bestuursorgaan');
});

test('een foto wordt geweigerd met uitleg in plaats van een leeg dossier', () => {
  const resultaat = leesBrief({
    bestandsnaam: 'brief.jpg', mediaType: 'image/jpeg', data: Buffer.from('nep').toString('base64'),
  });
  assert.equal(resultaat.gelukt, false);
  assert.equal(resultaat.soort, 'afbeelding');
  assert.match(resultaat.hint, /pdf|overtypen|typ/i);
});

test('een pdf zonder tekstlaag wordt herkend als scan', () => {
  const nep = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('geen streams hier')]);
  const resultaat = leesBrief({ bestandsnaam: 'scan.pdf', mediaType: 'application/pdf', data: nep.toString('base64') });
  assert.equal(resultaat.gelukt, false);
  assert.equal(resultaat.soort, 'pdf-zonder-tekst');
});

test('geplakte tekst en tekstbestanden komen er gewoon doorheen', () => {
  const geplakt = leesBrief({ tekst: tekstVan('uwv-wia-ontvangstbevestiging.txt') });
  assert.equal(geplakt.gelukt, true);
  assert.equal(geplakt.bron, 'geplakt');

  const bestand = leesBrief({
    bestandsnaam: 'brief.txt', mediaType: 'text/plain',
    data: lees('uwv-wia-ontvangstbevestiging.txt').toString('base64'),
  });
  assert.equal(bestand.gelukt, true);
  assert.equal(bestand.bron, 'tekst');
});

test('de pdf-versies van alle voorbeeldbrieven leveren dezelfde herkenning op', () => {
  for (const naam of fs.readdirSync(MAP).filter((n) => n.endsWith('.pdf'))) {
    const uitPdf = herkenBrief(pdfNaarTekst(lees(naam)).tekst);
    const uitTekst = herkenBrief(tekstVan(naam.replace('.pdf', '.txt')));
    for (const veld of ['bestuursorgaan', 'zaaktype', 'beslisdatum', 'soortBrief', 'naam']) {
      assert.equal(uitPdf[veld], uitTekst[veld], `${naam}: ${veld} verschilt tussen pdf en tekst`);
    }
  }
});

test('te weinig tekst levert geen gokwerk op', () => {
  assert.equal(herkenBrief('hallo').leesbaar, false);
  assert.equal(leesBrief({}).gelukt, false);
});
