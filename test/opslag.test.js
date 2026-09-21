import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { BestandsOpslag, GeheugenOpslag, RedisOpslag, kiesOpslag, redisInstellingen } from '../src/opslag.js';
import { Store } from '../src/store.js';

test('de juiste driver wordt gekozen op basis van de omgeving', () => {
  const opSchijf = kiesOpslag({ dataDir: '/tmp/x', env: {} });
  assert.equal(opSchijf.soort, 'bestand');

  const opVercelZonderDatabase = kiesOpslag({ dataDir: '/tmp/x', env: { VERCEL: '1' } });
  assert.equal(opVercelZonderDatabase.soort, 'geheugen');
  assert.equal(opVercelZonderDatabase.duurzaam, false);

  const metKv = kiesOpslag({
    dataDir: '/tmp/x',
    env: { VERCEL: '1', KV_REST_API_URL: 'https://voorbeeld.upstash.io', KV_REST_API_TOKEN: 'geheim' },
  });
  assert.equal(metKv.soort, 'redis');
  assert.equal(metKv.duurzaam, true);
});

test('zowel Vercel KV als Upstash-namen worden herkend', () => {
  assert.equal(redisInstellingen({}), null);
  assert.equal(redisInstellingen({ KV_REST_API_URL: 'https://a/', KV_REST_API_TOKEN: 't' }).url, 'https://a');
  assert.equal(redisInstellingen({ UPSTASH_REDIS_REST_URL: 'https://b', UPSTASH_REDIS_REST_TOKEN: 't' }).url, 'https://b');
  assert.equal(redisInstellingen({ KV_REST_API_URL: 'https://a' }), null, 'zonder token geen redis');
});

test('de bestandsopslag bewaart tussen twee starts door', async () => {
  const map = await fs.mkdtemp(path.join(os.tmpdir(), 'dws-opslag-'));
  try {
    const eerste = new Store({ opslag: await new BestandsOpslag(map).init() });
    const aanvraag = await eerste.nieuweAanvraag({ invoer: {}, contact: { naam: 'A' }, rapport: {} });
    assert.equal(aanvraag.referentie.endsWith('-0001'), true);
    await new Promise((r) => setTimeout(r, 30));

    const tweede = new Store({ opslag: await new BestandsOpslag(map).init() });
    assert.equal((await tweede.lijst()).length, 1);
    const volgende = await tweede.nieuweAanvraag({ invoer: {}, contact: { naam: 'B' }, rapport: {} });
    assert.equal(volgende.referentie.endsWith('-0002'), true, 'referentienummers tellen door');
  } finally {
    await fs.rm(map, { recursive: true, force: true });
  }
});

test('de geheugenopslag werkt, maar zegt dat hij niet duurzaam is', async () => {
  const store = new Store({ opslag: new GeheugenOpslag() });
  await store.init();
  assert.equal(store.duurzaam, false);
  await store.nieuweAanvraag({ invoer: {}, contact: { naam: 'C' }, rapport: {} });
  assert.equal((await store.lijst()).length, 1);
});

test('status, notities en herberekening blijven behouden in elke driver', async () => {
  for (const opslag of [new GeheugenOpslag(), new BestandsOpslag(await fs.mkdtemp(path.join(os.tmpdir(), 'dws-drv-')))]) {
    const store = new Store({ opslag });
    await store.init();
    const aanvraag = await store.nieuweAanvraag({
      invoer: { zaaktype: 'gem-bijstand', basisdatum: '2025-01-06' },
      contact: { naam: 'D' },
      rapport: { uitkomst: 'recht', berekening: { totaal: 1442 } },
    });

    await store.wijzigStatus(aanvraag.id, 'in-behandeling', 'tester');
    await store.voegNotitieToe(aanvraag.id, 'Gebeld.', 'tester');
    const opnieuw = await store.vind(aanvraag.id);
    assert.equal(opnieuw.status, 'in-behandeling');
    assert.equal(opnieuw.notities.length, 1);
    assert.equal(opnieuw.historie.length, 2);

    const stats = await store.statistieken();
    assert.equal(stats.totaal, 1);
    assert.equal(stats.open, 1);
    assert.equal(stats.totaalBedrag, 1442);

    assert.equal((await store.vind(aanvraag.referentie)).id, aanvraag.id, 'ook op referentie te vinden');
  }
});

test('de redisdriver praat via de REST-API en verwerkt fouten', async () => {
  const verzoeken = [];
  const echteFetch = globalThis.fetch;
  globalThis.fetch = async (url, opties) => {
    verzoeken.push({ url, body: JSON.parse(opties.body) });
    const commandos = JSON.parse(opties.body);
    return new Response(JSON.stringify(commandos.map(([naam]) => {
      if (naam === 'INCR') return { result: 7 };
      if (naam === 'LRANGE') return { result: ['abc'] };
      if (naam === 'MGET') return { result: [JSON.stringify({ id: 'abc', referentie: 'DWS-2026-0007' })] };
      return { result: 'OK' };
    })), { status: 200 });
  };
  try {
    const opslag = new RedisOpslag({ url: 'https://voorbeeld.upstash.io', token: 'geheim' });
    await opslag.init();
    assert.equal(verzoeken[0].body[0][0], 'PING');
    assert.match(verzoeken[0].url, /\/pipeline$/);

    assert.equal(await opslag.volgendNummer(2026), 7);
    await opslag.voegToe({ id: 'abc' });
    assert.deepEqual(verzoeken.at(-1).body.map(([naam]) => naam), ['SET', 'LPUSH']);
    assert.equal((await opslag.haalAlle())[0].referentie, 'DWS-2026-0007');

    globalThis.fetch = async () => new Response('geen toegang', { status: 401 });
    await assert.rejects(() => opslag.haalAlle(), /401/);
  } finally {
    globalThis.fetch = echteFetch;
  }
});
