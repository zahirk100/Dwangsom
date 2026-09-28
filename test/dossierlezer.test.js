/**
 * Meer dan één brief.
 *
 * Dit is de toets die het echte probleem vastlegt: iemand weet niet welke
 * brief de goede is, stuurt ze alle drie, en het antwoord moet kloppen. Een
 * fout hier is duur in beide richtingen - een gemiste verlenging maakt van
 * "nog niet te laat" onterecht "recht op geld", en een gemiste
 * ingebrekestelling laat iemand een brief sturen die hij al had gestuurd.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { herkenBrief } from '../src/briefherkenning.js';
import { leesDossier } from '../public/shared/dossierlezer.js';
import { berekenDwangsom, UITKOMST } from '../public/shared/dwangsom.js';

const MAP = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'voorbeelden');
const lees = (naam) => herkenBrief(fs.readFileSync(path.join(MAP, `${naam}.txt`), 'utf8'));
const dossier = (namen) => leesDossier(namen.map((n) => ({ bestandsnaam: `${n}.pdf`, herkenning: lees(n) })));
const PEIL = '2026-09-28';

test('de eigen ingebrekestelling wordt als zodanig herkend', () => {
  const h = lees('eigen-ingebrekestelling-gemeente');
  assert.equal(h.soortBrief, 'ingebrekestelling');
  assert.equal(h.briefdatum, '2026-08-27');

  // Een brief van de instantie die het woord noemt, is er géén.
  assert.notEqual(lees('gemeente-verlenging-beslistermijn').soortBrief, 'ingebrekestelling');
});

test('de laatste brief die een datum noemt, bepaalt de beslistermijn', () => {
  const alleen = dossier(['uwv-wia-ontvangstbevestiging']);
  assert.equal(alleen.invoer.termijnEinddatum, '2026-09-14');

  const beide = dossier(['uwv-wia-ontvangstbevestiging', 'uwv-verlenging-beslistermijn']);
  assert.equal(beide.invoer.termijnEinddatum, '2026-10-26', 'de verlenging schuift de datum op');
  assert.equal(beide.invoer.verdaagd, true);
  // En de aanvraagdatum blijft uit de eerste brief komen.
  assert.equal(beide.invoer.basisdatum, '2026-07-10');
});

test('de volgorde waarin de brieven worden aangeleverd maakt niet uit', () => {
  const vooruit = dossier(['uwv-wia-ontvangstbevestiging', 'uwv-verlenging-beslistermijn']);
  const achteruit = dossier(['uwv-verlenging-beslistermijn', 'uwv-wia-ontvangstbevestiging']);
  assert.deepEqual(achteruit.invoer, vooruit.invoer);
});

test('één brief erbij verandert de uitslag, en dat is de hele bedoeling', () => {
  const een = berekenDwangsom({ ...dossier(['gemeente-bijstand-ontvangstbevestiging']).invoer, peildatum: PEIL });
  assert.equal(een.uitkomst, UITKOMST.INGEBREKESTELLING_NODIG);

  const drie = berekenDwangsom({
    ...dossier(['gemeente-bijstand-ontvangstbevestiging', 'gemeente-verlenging-beslistermijn',
      'eigen-ingebrekestelling-gemeente']).invoer,
    peildatum: PEIL,
  });
  assert.equal(drie.uitkomst, UITKOMST.RECHT, 'met de eigen ingebrekestelling loopt de dwangsom al');
  assert.ok(drie.berekening.totaal > 0);
});

test('een beslissing in de stapel sluit de zaak', () => {
  const uit = dossier(['uwv-wia-ontvangstbevestiging', 'uwv-verlenging-beslistermijn',
    'uwv-beslissing-genomen']);
  assert.equal(uit.invoer.besluitGenomen, true);
  assert.equal(uit.invoer.besluitDatum, '2026-09-11');
  const rapport = berekenDwangsom({ ...uit.invoer, peildatum: PEIL });
  assert.equal(rapport.uitkomst, UITKOMST.GEEN_RECHT);
});

test('per brief is te zien wat hij oplevert', () => {
  const uit = dossier(['gemeente-bijstand-ontvangstbevestiging', 'gemeente-verlenging-beslistermijn',
    'eigen-ingebrekestelling-gemeente']);
  const perSoort = Object.fromEntries(uit.brieven.map((b) => [b.soort, b]));

  assert.deepEqual(perSoort.ontvangstbevestiging.bepaalt, ['aanvraagdatum']);
  assert.ok(perSoort.verlenging.bepaalt.includes('beslisdatum'),
    'de datum hoort bij de brief van de instantie te staan, niet bij de eigen brief');
  assert.deepEqual(perSoort.ingebrekestelling.bepaalt, ['ingebrekestelling']);
  for (const brief of uit.brieven) assert.ok(brief.rol.length > 10, 'elke brief krijgt uitleg');
});

test('brieven over verschillende zaken leveren een waarschuwing op', () => {
  const uit = dossier(['uwv-wia-ontvangstbevestiging', 'gemeente-bijstand-ontvangstbevestiging']);
  assert.ok(uit.opmerkingen.some((o) => /verschillende instanties/.test(o)),
    `verwachtte een waarschuwing, kreeg: ${uit.opmerkingen.join(' | ')}`);
});

test('een lege stapel levert geen halve invoer op', () => {
  const uit = leesDossier([]);
  assert.deepEqual(uit.brieven, []);
  assert.deepEqual(uit.invoer, {});
  assert.equal(uit.hoofdbrief, null);
});
