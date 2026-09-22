/**
 * Draait de volledige dossierstroom tegen een nagebootste Upstash/Vercel KV
 * REST-server. Dat is de opstelling die op Vercel in productie wordt gebruikt,
 * dus die moet aantoonbaar werken - inclusief het overleven van een koude
 * start, waarbij de applicatie niets in het geheugen heeft.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { RedisOpslag } from '../src/opslag.js';
import { Store } from '../src/store.js';

/** Minimale Redis met alleen de commando's die de applicatie gebruikt. */
function maakNepRedis() {
  const sleutels = new Map();
  const lijsten = new Map();
  // Sessies, gebruikers en inloglinks staan niet in een lijst maar in een set
  // met losse rijen; zonder deze commando's testte dat pad helemaal niet mee.
  const verzamelingen = new Map();

  const voerUit = ([naam, ...args]) => {
    switch (String(naam).toUpperCase()) {
      case 'PING': return 'PONG';
      case 'SET': sleutels.set(args[0], args[1]); return 'OK';
      case 'GET': return sleutels.has(args[0]) ? sleutels.get(args[0]) : null;
      case 'MGET': return args.map((k) => (sleutels.has(k) ? sleutels.get(k) : null));
      case 'LPUSH': {
        const lijst = lijsten.get(args[0]) || [];
        lijst.unshift(...args.slice(1));
        lijsten.set(args[0], lijst);
        return lijst.length;
      }
      case 'LRANGE': {
        const lijst = lijsten.get(args[0]) || [];
        const eind = Number(args[2]) === -1 ? lijst.length : Number(args[2]) + 1;
        return lijst.slice(Number(args[1]), eind);
      }
      case 'INCR': {
        const nieuw = Number(sleutels.get(args[0]) || 0) + 1;
        sleutels.set(args[0], String(nieuw));
        return nieuw;
      }
      case 'DEL': {
        const had = sleutels.delete(args[0]);
        return had ? 1 : 0;
      }
      case 'SADD': {
        const set = verzamelingen.get(args[0]) || new Set();
        for (const lid of args.slice(1)) set.add(String(lid));
        verzamelingen.set(args[0], set);
        return set.size;
      }
      case 'SREM': {
        const set = verzamelingen.get(args[0]);
        if (!set) return 0;
        let weg = 0;
        for (const lid of args.slice(1)) if (set.delete(String(lid))) weg++;
        return weg;
      }
      case 'SMEMBERS': return [...(verzamelingen.get(args[0]) || [])];
      default: return { error: `onbekend commando ${naam}` };
    }
  };

  return http.createServer(async (req, res) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.writeHead(401).end('unauthorized');
      return;
    }
    const stukken = [];
    for await (const stuk of req) stukken.push(stuk);
    const commandos = JSON.parse(Buffer.concat(stukken).toString('utf8'));
    const resultaten = commandos.map((commando) => {
      const uitkomst = voerUit(commando);
      return uitkomst && uitkomst.error ? uitkomst : { result: uitkomst };
    });
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(resultaten));
  });
}

const nepRedis = maakNepRedis();
await new Promise((resolve) => nepRedis.listen(0, resolve));
const instellingen = { url: `http://127.0.0.1:${nepRedis.address().port}`, token: 'test-token' };

test.after(() => nepRedis.close());

function verseStore() {
  return new Store({ opslag: new RedisOpslag(instellingen) });
}

test('de volledige dossierstroom werkt op een REST-database', async () => {
  const store = await verseStore().init();

  const eerste = await store.nieuweAanvraag({
    invoer: { bestuursorgaan: 'uwv', zaaktype: 'uwv-wia', basisdatum: '2025-01-06' },
    contact: { naam: 'R. Redis', email: 'r@voorbeeld.nl' },
    rapport: { uitkomst: 'recht', berekening: { totaal: 1442 } },
  });
  assert.match(eerste.referentie, /-0001$/);

  const tweede = await store.nieuweAanvraag({
    invoer: { bestuursorgaan: 'gemeente', zaaktype: 'gem-bijstand', basisdatum: '2025-02-01' },
    contact: { naam: 'B. Bijstand', email: 'b@voorbeeld.nl' },
    rapport: { uitkomst: 'termijn-loopt' },
  });
  assert.match(tweede.referentie, /-0002$/, 'de teller loopt door via INCR');

  const lijst = await store.lijst();
  assert.equal(lijst.length, 2);
  assert.equal(lijst[0].referentie, tweede.referentie, 'nieuwste bovenaan');

  assert.equal((await store.lijst({ bestuursorgaan: 'uwv' })).length, 1);
  assert.equal((await store.lijst({ zoek: 'redis' })).length, 1);
  assert.equal((await store.lijst({ status: 'toegekend' })).length, 0);

  const stats = await store.statistieken();
  assert.equal(stats.totaal, 2);
  assert.equal(stats.totaalBedrag, 1442);
});

test('wijzigingen zijn zichtbaar voor een volgende, koude instantie', async () => {
  const eerste = await verseStore().init();
  const aanvraag = (await eerste.lijst())[0];

  await eerste.wijzigStatus(aanvraag.id, 'in-behandeling', 'beheerder');
  await eerste.voegNotitieToe(aanvraag.id, 'Dossier opgevraagd.', 'beheerder');

  // Een andere serverloze instantie: niets gedeeld behalve de database.
  const tweede = await verseStore().init();
  const opnieuw = await tweede.vind(aanvraag.id);
  assert.equal(opnieuw.status, 'in-behandeling');
  assert.equal(opnieuw.notities.length, 1);
  assert.equal(opnieuw.historie.length, 2);
  assert.equal((await tweede.vind(aanvraag.referentie)).id, aanvraag.id);
});

test('een verkeerde sleutel geeft een duidelijke fout', async () => {
  const store = new Store({ opslag: new RedisOpslag({ ...instellingen, token: 'fout' }) });
  await assert.rejects(() => store.init(), /401/);
});

test('inloggen met een e-maillink werkt op een REST-database', async () => {
  // Dit pad draaide alleen ooit tegen bestandsopslag. Op Vercel staat er
  // Redis achter, en sessies, gebruikers en koppelingen gaan daar via een
  // heel andere route naar binnen (losse rijen met een set als index) dan de
  // dossiers. Precies hier kwam de klant niet binnen met zijn link.
  const { Gebruikers, ROL_KLANT } = await import('../src/gebruikers.js');
  const opslag = await new RedisOpslag(instellingen).init();
  const sleutel = Buffer.alloc(32, 7);

  const gebruikers = new Gebruikers({ opslag, sleutel });
  const klant = await gebruikers.maakOfVindKlant
    ? await gebruikers.maakOfVindKlant({ email: 'klant@voorbeeld.nl', naam: 'K' })
    : await gebruikers.maakEersteBeheerder({
      email: 'klant@voorbeeld.nl', naam: 'K', wachtwoord: 'een-lang-wachtwoord',
    });

  const token = await gebruikers.maakKoppeling(klant.id, 'magic');
  assert.ok(token, 'er hoort een token uit te komen');

  // Een volgende, koude instantie wisselt hem in - zoals op serverloze hosting.
  const verseInstantie = new Gebruikers({ opslag: await new RedisOpslag(instellingen).init(), sleutel });
  const uitToken = await verseInstantie.verzilverKoppeling(token, 'magic');
  assert.ok(uitToken, 'de inloglink hoort herkend te worden');
  assert.equal(uitToken.email, 'klant@voorbeeld.nl');

  const cookie = await verseInstantie.maakSessie(uitToken);
  const nogEenInstantie = new Gebruikers({ opslag: await new RedisOpslag(instellingen).init(), sleutel });
  const sessie = await nogEenInstantie.uitCookie(cookie);
  assert.ok(sessie, 'en de sessie hoort door een volgende instantie herkend te worden');
  assert.equal(sessie.gebruiker.email, 'klant@voorbeeld.nl');
});
