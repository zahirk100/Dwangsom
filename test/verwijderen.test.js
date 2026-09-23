/**
 * Een dossier weggooien.
 *
 * Dit is de enige onomkeerbare handeling in de applicatie. Een verkeerd
 * gezette status draai je terug; een verwijderd dossier niet. Daarom staan er
 * drie sloten op, en die worden hier alle drie getoetst:
 *
 *   - alleen een beheerder mag het;
 *   - het referentienummer moet meegestuurd worden en kloppen;
 *   - de bijlagen gaan mee, zodat er geen persoonsgegevens achterblijven in
 *     rijen waar niemand meer naar kijkt.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tijdelijk = await fs.mkdtemp(path.join(os.tmpdir(), 'nubeslist-verwijderen-'));
process.env.DATA_DIR = tijdelijk;
process.env.SESSIE_GEHEIM = 'testgeheim-voor-verwijderen';
process.env.PORT = '0';
delete process.env.BEHEER_OPEN;

const { start, server, store, opslag } = await import('../server.js');
await start(0);
const basisUrl = `http://127.0.0.1:${server.address().port}`;

const { logInAlsBeheerder } = await import('./hulp-inloggen.mjs');
const { cookie } = await logInAlsBeheerder(basisUrl, { email: 'weg@nubeslist.nl' });

test.after(async () => {
  server.close();
  await fs.rm(tijdelijk, { recursive: true, force: true });
});

const haal = (pad, opties = {}) => fetch(basisUrl + pad, {
  headers: { 'Content-Type': 'application/json', cookie, ...(opties.headers || {}) }, ...opties,
});

const dag = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

async function dienIn(email = 'weg@voorbeeld.nl') {
  const antwoord = await fetch(`${basisUrl}/api/aanvragen`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      invoer: { bestuursorgaan: 'uwv', zaaktype: 'uwv-wia', basisdatum: dag(200),
        ingebrekeGesteld: true, ingebrekestellingDatum: dag(40) },
      contact: { naam: 'T. Weg', email, adres: 'Weg 1', postcode: '1000 AA',
        woonplaats: 'Amsterdam', geboortedatum: '1980-01-01', bsn: '111222333',
        iban: 'NL91ABNA0417164300', machtiging: true, akkoordVoorwaarden: true },
      herkomst: 'funnel',
    }),
  });
  const tekst = await antwoord.text();
  assert.equal(antwoord.status, 201, tekst);
  const { referentie } = JSON.parse(tekst);
  const lijst = await (await haal(`/api/beheer/aanvragen?zoek=${referentie}`)).json();
  return lijst.aanvragen[0];
}

const bestaatNog = async (ref) => Boolean(await store.vind(ref));

// ------------------------------------------------------------ bevestiging ---

test('zonder referentienummer gebeurt er niets', async () => {
  const dossier = await dienIn();
  const antwoord = await haal(`/api/beheer/aanvragen/${dossier.id}`, {
    method: 'DELETE', body: JSON.stringify({}),
  });
  assert.equal(antwoord.status, 400);
  assert.ok(await bestaatNog(dossier.referentie), 'het dossier hoort er nog te staan');
});

test('met het verkeerde referentienummer gebeurt er niets', async () => {
  const dossier = await dienIn();
  const antwoord = await haal(`/api/beheer/aanvragen/${dossier.id}`, {
    method: 'DELETE', body: JSON.stringify({ referentie: 'DWS-2026-9999' }),
  });
  assert.equal(antwoord.status, 400);
  assert.ok(await bestaatNog(dossier.referentie));
});

test('met het juiste referentienummer is het dossier weg', async () => {
  const dossier = await dienIn();
  const antwoord = await haal(`/api/beheer/aanvragen/${dossier.id}`, {
    method: 'DELETE', body: JSON.stringify({ referentie: dossier.referentie }),
  });
  assert.equal(antwoord.status, 200);
  const uitslag = await antwoord.json();
  assert.equal(uitslag.verwijderd, true);
  assert.equal(uitslag.referentie, dossier.referentie);
  assert.ok(!(await bestaatNog(dossier.referentie)), 'het dossier staat er nog');
});

test('het dossier verdwijnt ook uit de lijst', async () => {
  const dossier = await dienIn();
  await haal(`/api/beheer/aanvragen/${dossier.id}`, {
    method: 'DELETE', body: JSON.stringify({ referentie: dossier.referentie }),
  });
  const lijst = await (await haal('/api/beheer/aanvragen')).json();
  assert.ok(!lijst.aanvragen.some((a) => a.id === dossier.id), 'staat nog in de lijst');
});

// -------------------------------------------------------------- bijlagen ---

test('de bijlagen gaan mee, zodat er geen persoonsgegevens achterblijven', async () => {
  const dossier = await dienIn();
  const gezet = await haal(`/api/beheer/aanvragen/${dossier.id}/bestanden`, {
    method: 'POST',
    body: JSON.stringify({
      stukId: 'machtiging', bestandsnaam: 'bewijs.txt', mediaType: 'text/plain',
      data: Buffer.from('gevoelige inhoud').toString('base64'),
    }),
  });
  assert.equal(gezet.status, 200, await gezet.text());
  const met = await store.vind(dossier.id);
  const bestandId = met.bestanden[0].id;
  assert.ok(await opslag.rij('bestanden', bestandId), 'de bijlage hoort er te staan');

  const antwoord = await haal(`/api/beheer/aanvragen/${dossier.id}`, {
    method: 'DELETE', body: JSON.stringify({ referentie: dossier.referentie }),
  });
  assert.equal((await antwoord.json()).bestanden, 1);
  assert.equal(await opslag.rij('bestanden', bestandId), null,
    'de bijlage staat nog in de opslag terwijl het dossier weg is');
});

// ----------------------------------------------------------------- rollen ---

test('een behandelaar mag niet verwijderen', async () => {
  const dossier = await dienIn();
  const { codeVoor } = await import('../src/totp.js');

  // Een behandelaar uitnodigen en zijn account instellen.
  const uitnodiging = await (await haal('/api/beheer/medewerkers', {
    method: 'POST',
    body: JSON.stringify({ email: 'hand@nubeslist.nl', naam: 'B. Handelaar', rol: 'behandelaar' }),
  })).json();
  // De route geeft een volledige link terug, niet het kale token: zonder
  // mailkoppeling moet de beheerder hem zelf kunnen doorsturen.
  assert.ok(uitnodiging.uitnodigingslink, 'verwacht een uitnodigingslink');
  const token = new URL(uitnodiging.uitnodigingslink).searchParams.get('uitnodiging');
  const ingesteld = await fetch(`${basisUrl}/api/beheer/uitnodiging`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, wachtwoord: 'een-heel-lang-testwachtwoord' }),
  });
  assert.ok(ingesteld.ok, await ingesteld.text());
  const hunCookie = ingesteld.headers.getSetCookie()[0].split(';')[0];
  const start2 = await (await fetch(`${basisUrl}/api/beheer/tweefactor/start`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: hunCookie }, body: '{}',
  })).json();
  await fetch(`${basisUrl}/api/beheer/tweefactor/bevestig`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: hunCookie },
    body: JSON.stringify({ code: codeVoor(start2.geheim) }),
  });

  const poging = await fetch(`${basisUrl}/api/beheer/aanvragen/${dossier.id}`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json', cookie: hunCookie },
    body: JSON.stringify({ referentie: dossier.referentie }),
  });
  assert.equal(poging.status, 403, 'een behandelaar hoort dit niet te mogen');
  assert.ok(await bestaatNog(dossier.referentie), 'het dossier is toch weg');
});

test('zonder inloggen mag het al helemaal niet', async () => {
  const dossier = await dienIn();
  const poging = await fetch(`${basisUrl}/api/beheer/aanvragen/${dossier.id}`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ referentie: dossier.referentie }),
  });
  assert.equal(poging.status, 401);
  assert.ok(await bestaatNog(dossier.referentie));
});

// ---------------------------------------------------------------- account ---

test('het account van de aanvrager blijft bestaan', async () => {
  // Bij proefdraaien is dat vaak hetzelfde account als waarmee jij inlogt.
  // Een dossier opruimen hoort nooit iemands toegang te kosten.
  const dossier = await dienIn('blijft@voorbeeld.nl');
  const { Gebruikers } = await import('../src/gebruikers.js');
  const gebruikers = new Gebruikers({ opslag, sleutel: Buffer.alloc(32, 3) });

  await haal(`/api/beheer/aanvragen/${dossier.id}`, {
    method: 'DELETE', body: JSON.stringify({ referentie: dossier.referentie }),
  });
  const nog = await gebruikers.vindOpEmail('blijft@voorbeeld.nl');
  assert.ok(nog, 'het account van de aanvrager is meeverdwenen');
});

test('een dossier dat niet bestaat geeft geen 500', async () => {
  const antwoord = await haal('/api/beheer/aanvragen/bestaat-niet', {
    method: 'DELETE', body: JSON.stringify({ referentie: 'DWS-2026-0001' }),
  });
  assert.equal(antwoord.status, 404);
});
