/**
 * De controles die geen aanvraag werden.
 *
 * Dit is meetgegeven én persoonsgegeven tegelijk, en dat maakt de toetsen
 * hier scherp: er moet genoeg in staan om te zien waar mensen afhaken, en te
 * weinig om er iemand mee te benaderen. Wat hier per ongeluk in zou glippen -
 * een e-mailadres, een burgerservicenummer - staat dan in een verzameling van
 * mensen die ons nooit iets hebben gevraagd.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { maakControle, werkControleBij, zonderBsn, verlopen, controleOverzicht, bewaardagen } from '../src/controles.js';
import { Store } from '../src/store.js';

const LADING = {
  sleutel: 'proef-1',
  stap: 'uitslag',
  bron: 'meta',
  van: 'uwv-te-laat',
  invoer: { bestuursorgaan: 'gemeente', organisatienaam: 'Gemeente Zwolle', zaaktype: 'gem-bijstand',
    termijnEinddatum: '2026-08-24', verdaagd: true, ingebrekeGesteld: true },
  rapport: { uitkomst: 'recht', berekening: { totaal: 462 } },
  brieven: [{ bestandsnaam: 'brief.pdf', bron: 'pdf', soort: 'ontvangstbevestiging',
    tekst: 'Burgerservicenummer: 111222333. M. el Amrani, Vechtstraat 45.' }],
};

test('er wordt bewaard wat de zaak is, niet wie de persoon is', () => {
  const rij = maakControle({
    ...LADING,
    // Dit stuurt de funnel niet mee, maar als dat ooit gebeurt hoort het hier
    // te stranden en niet stilletjes in de opslag te belanden.
    contact: { naam: 'M. el Amrani', email: 'm@example.nl', telefoon: '0612345678', iban: 'NL91ABNA0417164300' },
    invoer: { ...LADING.invoer, bsn: '111222333', iban: 'NL91ABNA0417164300' },
  });

  const alsTekst = JSON.stringify(rij);
  assert.ok(!alsTekst.includes('example.nl'), 'geen e-mailadres');
  assert.ok(!alsTekst.includes('0612345678'), 'geen telefoonnummer');
  assert.ok(!alsTekst.includes('NL91ABNA0417164300'), 'geen rekeningnummer');
  assert.ok(!alsTekst.includes('111222333'), 'geen burgerservicenummer, ook niet uit de brieftekst');
  assert.equal(rij.contact, undefined);

  // Maar de zaak staat er wel in: zonder dat heeft bewaren geen zin.
  assert.equal(rij.zaak.bestuursorgaan, 'gemeente');
  assert.equal(rij.uitkomst, 'recht');
  assert.equal(rij.bedrag, 462);
  assert.equal(rij.aantalBrieven, 1);
});

test('een burgerservicenummer gaat uit de brieftekst, een gewoon kenmerk blijft', () => {
  // 111222333 komt door de elfproef, 123456789 niet.
  const uit = zonderBsn('BSN 111222333 en kenmerk 123456789 en bedrag 100000000');
  assert.ok(!uit.includes('111222333'));
  assert.ok(uit.includes('123456789'), 'een nummer dat geen bsn kan zijn hoort te blijven staan');
});

test('een latere stap overschrijft de eerdere, maar nooit terug', () => {
  const eerst = maakControle(LADING, { nu: '2026-09-28T10:00:00.000Z' });
  const verder = werkControleBij(eerst, { ...LADING, stap: 'gegevens', brieven: [] },
    { nu: '2026-09-28T10:05:00.000Z' });
  assert.equal(verder.stap, 'gegevens');
  assert.equal(verder.gestartOp, '2026-09-28T10:00:00.000Z');
  assert.equal(verder.brieven.length, 1, 'brieven blijven staan als er geen nieuwe meekomen');

  const terug = werkControleBij(verder, { ...LADING, stap: 'uitslag' });
  assert.equal(terug.stap, 'gegevens', 'terugklikken maakt iemand niet minder ver');
});

test('alleen bekende stappen komen erin', () => {
  assert.equal(maakControle({ ...LADING, stap: 'van-alles' }).stap, 'uitslag');
});

test('wat te oud is, is verlopen', () => {
  const rij = maakControle(LADING, { nu: '2026-08-01T10:00:00.000Z' });
  assert.equal(verlopen(rij, { dagen: 30, nu: new Date('2026-08-20T10:00:00.000Z') }), false);
  assert.equal(verlopen(rij, { dagen: 30, nu: new Date('2026-09-28T10:00:00.000Z') }), true);
  assert.equal(verlopen(rij, { dagen: 0 }), false, 'nul dagen betekent: niet opruimen');
});

test('de bewaartermijn komt uit de omgeving, met een grens', () => {
  assert.equal(bewaardagen({}), 30);
  assert.equal(bewaardagen({ CONTROLE_BEWAARDAGEN: '7' }), 7);
  assert.equal(bewaardagen({ CONTROLE_BEWAARDAGEN: '9999' }), 30, 'een onzinwaarde valt terug op de standaard');
});

test('het overzicht laat zien waar het geld blijft liggen', () => {
  const o = controleOverzicht([
    { stap: 'uitslag', uitkomst: 'recht', bedrag: 462, zaak: { bestuursorgaan: 'gemeente' }, aanvraagId: '' },
    { stap: 'gegevens', uitkomst: 'recht', bedrag: 1000, zaak: { bestuursorgaan: 'uwv' }, aanvraagId: '' },
    { stap: 'ingediend', uitkomst: 'recht', bedrag: 500, zaak: { bestuursorgaan: 'uwv' }, aanvraagId: 'AV-1' },
    { stap: 'uitslag', uitkomst: 'geen-recht', bedrag: 0, zaak: { bestuursorgaan: 'duo' }, aanvraagId: '' },
  ]);
  assert.equal(o.totaal, 4);
  assert.equal(o.zonderAanvraag, 3);
  assert.equal(o.afgerond, 1);
  assert.equal(o.gemistBedrag, 1462, 'alleen wat er bij recht blijft liggen telt mee');
  assert.equal(o.perUitkomst.recht, 2);
  assert.equal(o.perInstantie.uwv, 1);
});

test('de opslag bewaart, werkt bij, koppelt en ruimt op', async () => {
  const map = await fs.mkdtemp(path.join(os.tmpdir(), 'nubeslist-controles-'));
  const store = await new Store({ dataDir: map }).init();

  await store.bewaarControle(LADING);
  await store.bewaarControle({ ...LADING, stap: 'gegevens' });
  assert.equal((await store.controles()).length, 1, 'dezelfde sleutel is dezelfde controle');
  assert.equal((await store.controles())[0].stap, 'gegevens');

  await store.koppelControleAanAanvraag('proef-1', 'AV-2026-1');
  const gekoppeld = (await store.controles())[0];
  assert.equal(gekoppeld.aanvraagId, 'AV-2026-1');
  assert.equal(gekoppeld.stap, 'ingediend');

  // Zonder sleutel gebeurt er niets; anders kan een lege melding rijen maken.
  assert.equal(await store.bewaarControle({ stap: 'uitslag' }), null);

  const weg = await store.snoeiControles({ dagen: 30, nu: new Date('2027-01-01T00:00:00.000Z') });
  assert.equal(weg, 1);
  assert.equal((await store.controles()).length, 0);
  await fs.rm(map, { recursive: true, force: true });
});
