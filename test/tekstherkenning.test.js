/**
 * Tekstherkenning: van foto naar tekst.
 *
 * Er gaat hier een bestand naar een dienst buiten de applicatie, dus deze
 * tests leggen drie dingen vast: zonder sleutel gebeurt er niets, met sleutel
 * komt de tekst binnen en gaat hij door de gewone herkenning, en als de dienst
 * hapert krijgt de aanvrager een bruikbaar antwoord in plaats van een fout.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beeldsoort, herkenningInstellingen, herkenTekst } from '../src/tekstherkenning.js';
import { leesBrief } from '../src/brieflezer.js';
import { herkenBrief } from '../src/briefherkenning.js';

const MAP = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'voorbeelden');
const brieftekst = fs.readFileSync(path.join(MAP, 'uwv-wia-ontvangstbevestiging.txt'), 'utf8');

/** Een geldige, minimale png (1x1). */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
const HEIC = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic'), Buffer.alloc(8)]);

/** Een nepdienst die teruggeeft wat de test wil, en onthoudt wat er heen ging. */
function nepdienst(antwoord, verstuurd = {}) {
  return async (adres, opties) => {
    verstuurd.adres = adres;
    verstuurd.kop = opties.headers;
    verstuurd.lijf = JSON.parse(opties.body);
    return {
      ok: antwoord.ok !== false,
      status: antwoord.status || 200,
      json: async () => antwoord.lijf ?? { content: [{ type: 'text', text: antwoord.tekst || '' }] },
    };
  };
}

test('het mediatype komt uit de bytes, niet uit wat de browser beweert', () => {
  assert.equal(beeldsoort(PNG), 'image/png');
  assert.equal(beeldsoort(JPEG), 'image/jpeg');
  assert.equal(beeldsoort(HEIC), 'image/heic');
  assert.equal(beeldsoort(Buffer.from('%PDF-1.4 en verder')), 'application/pdf');
  assert.equal(beeldsoort(Buffer.from('gewoon tekst hier zonder kenmerk')), '');
});

test('zonder sleutel staat tekstherkenning uit', async () => {
  assert.equal(herkenningInstellingen({}).aan, false);
  const uit = await herkenTekst(PNG, { env: {}, haal: () => { throw new Error('niet aanroepen'); } });
  assert.equal(uit.gelukt, false);
  assert.equal(uit.soort, 'uit');
});

test('een foto gaat als base64-afbeelding naar de dienst en de tekst komt terug', async () => {
  const verstuurd = {};
  const uit = await herkenTekst(PNG, {
    env: { OCR_API_SLEUTEL: 'sleutel-abc' },
    haal: nepdienst({ tekst: brieftekst }, verstuurd),
  });

  assert.equal(uit.gelukt, true);
  assert.equal(uit.bron, 'foto');
  assert.match(uit.tekst, /UWV/);

  assert.equal(verstuurd.kop['x-api-key'], 'sleutel-abc');
  assert.ok(verstuurd.kop['anthropic-version'], 'de API-versie hoort mee te gaan');
  const blok = verstuurd.lijf.messages[0].content[0];
  assert.equal(blok.type, 'image');
  assert.equal(blok.source.media_type, 'image/png');
  assert.equal(blok.source.data, PNG.toString('base64'));
});

test('een gescande pdf gaat als document mee, niet als afbeelding', async () => {
  const verstuurd = {};
  const scan = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('geen tekstlaag')]);
  const uit = await herkenTekst(scan, {
    env: { OCR_API_SLEUTEL: 'x' },
    haal: nepdienst({ tekst: brieftekst }, verstuurd),
  });

  assert.equal(uit.gelukt, true);
  assert.equal(uit.bron, 'scan');
  assert.equal(verstuurd.lijf.messages[0].content[0].type, 'document');
});

test('een iPhone-foto krijgt een eigen uitleg en gaat niet de deur uit', async () => {
  const uit = await herkenTekst(HEIC, {
    env: { OCR_API_SLEUTEL: 'x' },
    haal: () => { throw new Error('HEIC hoort niet verstuurd te worden'); },
  });
  assert.equal(uit.gelukt, false);
  assert.equal(uit.soort, 'heic');
  assert.match(uit.hint, /schermafbeelding|compatibel/i);
});

test('een onleesbare foto levert een uitleg op, geen lege brief', async () => {
  const uit = await herkenTekst(PNG, {
    env: { OCR_API_SLEUTEL: 'x' },
    haal: nepdienst({ tekst: 'GEEN_BRIEF' }),
  });
  assert.equal(uit.gelukt, false);
  assert.equal(uit.soort, 'onleesbaar-beeld');
  assert.match(uit.hint, /licht|recht/i);
});

test('een storing bij de dienst breekt de upload niet', async () => {
  const stuk = await herkenTekst(PNG, {
    env: { OCR_API_SLEUTEL: 'x' },
    haal: nepdienst({ ok: false, status: 500, lijf: { error: { message: 'kapot' } } }),
  });
  assert.equal(stuk.gelukt, false);
  assert.equal(stuk.soort, 'storing');

  const weg = await herkenTekst(PNG, {
    env: { OCR_API_SLEUTEL: 'x' },
    haal: async () => { throw new Error('geen verbinding'); },
  });
  assert.equal(weg.gelukt, false);
  assert.equal(weg.soort, 'storing');
});

test('met tekstherkenning levert een foto van de brief dezelfde herkenning op als de tekst', async () => {
  const gelezen = await leesBrief(
    { bestandsnaam: 'brief.jpg', mediaType: 'image/jpeg', data: PNG.toString('base64') },
    { env: { OCR_API_SLEUTEL: 'x' }, haal: nepdienst({ tekst: brieftekst }) },
  );

  assert.equal(gelezen.gelukt, true);
  assert.equal(gelezen.bron, 'foto');

  const uitFoto = herkenBrief(gelezen.tekst);
  const uitTekst = herkenBrief(brieftekst);
  for (const veld of ['bestuursorgaan', 'zaaktype', 'beslisdatum', 'naam']) {
    assert.equal(uitFoto[veld], uitTekst[veld], `${veld} verschilt tussen foto en tekst`);
  }
});

test('een pdf zonder tekstlaag wordt alsnog gelezen als tekstherkenning aanstaat', async () => {
  const scan = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('geen streams hier')]);
  const gelezen = await leesBrief(
    { bestandsnaam: 'scan.pdf', mediaType: 'application/pdf', data: scan.toString('base64') },
    { env: { ANTHROPIC_API_KEY: 'x' }, haal: nepdienst({ tekst: brieftekst }) },
  );
  assert.equal(gelezen.gelukt, true);
  assert.equal(gelezen.bron, 'scan');
});

test('een pdf met tekstlaag gaat nooit naar de dienst', async () => {
  const pdf = fs.readFileSync(path.join(MAP, 'uwv-wia-ontvangstbevestiging.pdf'));
  const gelezen = await leesBrief(
    { bestandsnaam: 'brief.pdf', mediaType: 'application/pdf', data: pdf.toString('base64') },
    { env: { OCR_API_SLEUTEL: 'x' }, haal: () => { throw new Error('hier hoort niets heen te gaan'); } },
  );
  assert.equal(gelezen.gelukt, true);
  assert.equal(gelezen.bron, 'pdf');
});

test('geplakte tekst gaat nooit naar de dienst', async () => {
  const gelezen = await leesBrief(
    { tekst: brieftekst },
    { env: { OCR_API_SLEUTEL: 'x' }, haal: () => { throw new Error('hier hoort niets heen te gaan'); } },
  );
  assert.equal(gelezen.bron, 'geplakt');
});
