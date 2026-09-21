/**
 * De machtiging wordt met één klik opgemaakt uit wat al bekend is. Deze tests
 * bewaken twee dingen: dat de gegevens van de aanvrager erin terechtkomen, en
 * dat een ontbrekend gegeven zichtbaar blijft in plaats van stilletjes
 * verdwijnen op een document dat iemand ondertekent.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { machtigingContext, machtigingHtml } from '../src/machtiging.js';
import { organisatiegegevens, ontbrekendeOrganisatiegegevens } from '../src/organisatie.js';

const organisatie = organisatiegegevens({
  BEDRIJF_NAAM: 'nubeslist.nl B.V.',
  BEDRIJF_ADRES: 'Stationsweg 10',
  BEDRIJF_POSTCODE_PLAATS: '8011 AA  Zwolle',
  BEDRIJF_KVK: '12345678',
  BEDRIJF_EMAIL: 'post@voorbeeld.nl',
});

const dossier = {
  referentie: 'DWS-2026-0001',
  contact: {
    naam: 'M. de Vries', geboortedatum: '1980-05-04', adres: 'Dorpsstraat 1',
    postcode: '8000 AA', woonplaats: 'Zwolle', kenmerk: 'UWV-123',
    bsn: '111222333', iban: 'NL91ABNA0417164300',
  },
  invoer: { bestuursorgaan: 'uwv', zaaktype: 'uwv-wia', basisdatum: '2026-01-06' },
};

test('een compleet dossier levert een machtiging zonder gaten', () => {
  const c = machtigingContext(dossier, organisatie);
  assert.deepEqual(c.ontbreekt, []);
  assert.equal(c.gever.naam, 'M. de Vries');
  assert.equal(c.gever.geboortedatum, '4 mei 1980');
  assert.equal(c.gever.postcodePlaats, '8000 AA  Zwolle');
  assert.equal(c.zaak.bestuursorgaan, 'UWV');
  assert.equal(c.zaak.kenmerk, 'UWV-123');
  assert.equal(c.zaak.aanvraagdatum, '6 januari 2026');
});

test('ontbrekende gegevens worden gemeld in plaats van verzonnen', () => {
  const c = machtigingContext({ referentie: 'X', contact: { naam: 'A' }, invoer: {} }, organisatie);
  assert.ok(c.ontbreekt.includes('Geboortedatum'));
  assert.ok(c.ontbreekt.includes('Adres'));
  assert.ok(c.ontbreekt.includes('Postcode en woonplaats'));
  assert.equal(c.gever.naam, 'A');
});

test('instanties die om een BSN vragen, krijgen dat veld en missen het als het ontbreekt', () => {
  const metBsn = machtigingContext(dossier, organisatie);
  assert.equal(metBsn.gever.bsnNodig, true);
  assert.equal(metBsn.gever.bsn, '111222333');

  const zonder = machtigingContext(
    { ...dossier, contact: { ...dossier.contact, bsn: '' } }, organisatie,
  );
  assert.ok(zonder.ontbreekt.includes('Burgerservicenummer'));
});

test('een digitaal gezette handtekening komt in het document', () => {
  const punt = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
  const html = machtigingHtml(
    { ...dossier, handtekening: { afbeelding: punt, gezetOp: '2026-09-21T10:00:00.000Z' } },
    organisatie,
  );
  assert.ok(html.includes('class="gezet"'), 'de handtekening staat op de plek van de lijn');
  assert.ok(html.includes('Digitaal gezet op 21 september 2026'));
  assert.ok(html.includes('NL91 ABNA 0417 1643 00'), 'het rekeningnummer staat erbij');

  const zonder = machtigingHtml(dossier, organisatie);
  assert.ok(zonder.includes('class="lijn"'), 'zonder handtekening blijft er een lijn om te tekenen');
});

test('de gegevens staan in het document en ontbrekende velden worden invulregels', () => {
  const html = machtigingHtml(dossier, organisatie);
  for (const verwacht of ['M. de Vries', '4 mei 1980', 'Dorpsstraat 1', 'UWV', '12345678', 'DWS-2026-0001']) {
    assert.ok(html.includes(verwacht), `${verwacht} hoort in de machtiging te staan`);
  }
  assert.ok(html.includes('rechtstreeks aan ondergetekende'), 'betalingen lopen niet via ons');
  assert.ok(html.includes('tot ondergetekende haar schriftelijk intrekt'));

  const kaal = machtigingHtml({ referentie: 'X', contact: {}, invoer: {} }, organisatie);
  assert.ok(kaal.includes('invulregel'), 'lege velden krijgen een zichtbare invulregel');
  assert.ok(kaal.includes('Nog niet compleet'), 'en een waarschuwing bovenaan');
});

test('gegevens van de aanvrager worden veilig in de opmaak gezet', () => {
  const html = machtigingHtml({
    ...dossier,
    contact: { ...dossier.contact, naam: '<script>alert(1)</script>' },
  }, organisatie);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('de pagina is te printen en verraadt zichzelf niet aan zoekmachines', () => {
  const html = machtigingHtml(dossier, organisatie);
  assert.ok(html.includes('window.print()'));
  assert.ok(html.includes('@media print'));
  assert.ok(html.includes('@page { size: A4'));
});

test('ontbrekende bedrijfsgegevens worden benoemd met de variabelenaam', () => {
  assert.deepEqual(ontbrekendeOrganisatiegegevens({}), [
    'BEDRIJF_ADRES', 'BEDRIJF_POSTCODE_PLAATS', 'BEDRIJF_KVK', 'BEDRIJF_EMAIL',
  ]);
  assert.deepEqual(ontbrekendeOrganisatiegegevens({
    BEDRIJF_ADRES: 'a', BEDRIJF_POSTCODE_PLAATS: 'b', BEDRIJF_KVK: 'c', BEDRIJF_EMAIL: 'd',
  }), []);
});
