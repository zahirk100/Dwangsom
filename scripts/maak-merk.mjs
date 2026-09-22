/**
 * Tekent het merkteken van nubeslist.nl als png, zonder enige afhankelijkheid.
 *
 * Waarom niet gewoon de svg gebruiken? Een favicon en een linkvoorbeeld in
 * WhatsApp of LinkedIn willen een png. Er is geen rasterizer in Node, dus de
 * vormen worden hier met afstandsfuncties getekend en 3x oversampled voor
 * gladde randen. Uitvoeren met: node scripts/maak-merk.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const PUBLIEK = path.join(HIER, '..', 'public');

const BLAUW_LICHT = [59, 122, 212];
const BLAUW_DONKER = [28, 58, 110];
const WIT = [255, 255, 255];

// ------------------------------------------------------------- vormen ----

const mengen = (a, b, t) => a.map((w, i) => w + (b[i] - w) * t);

/** Afstand tot de rand van een afgeronde rechthoek; negatief is binnen. */
function afstandKader(x, y, breedte, hoogte, straal) {
  const dx = Math.abs(x - breedte / 2) - (breedte / 2 - straal);
  const dy = Math.abs(y - hoogte / 2) - (hoogte / 2 - straal);
  const buiten = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return buiten + Math.min(Math.max(dx, dy), 0) - straal;
}

/** Afstand tot een lijnstuk, zodat een streek met ronde uiteinden ontstaat. */
function afstandLijn(x, y, x1, y1, x2, y2) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const lengte = vx * vx + vy * vy;
  const t = lengte === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * vx + (y - y1) * vy) / lengte));
  return Math.hypot(x - (x1 + t * vx), y - (y1 + t * vy));
}

/**
 * Afstand tot een stuk cirkel. De hoeken lopen met de klok mee vanaf drie uur,
 * net als op het scherm, en buiten dat stuk gelden ronde uiteinden.
 */
function afstandBoog(x, y, cx, cy, r, van, tot) {
  let hoek = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
  if (hoek < 0) hoek += 360;
  if (hoek >= van && hoek <= tot) return Math.abs(Math.hypot(x - cx, y - cy) - r);
  const eind = (graden) => [
    cx + r * Math.cos((graden * Math.PI) / 180),
    cy + r * Math.sin((graden * Math.PI) / 180),
  ];
  const [ax, ay] = eind(van);
  const [bx, by] = eind(tot);
  return Math.min(Math.hypot(x - ax, y - ay), Math.hypot(x - bx, y - by));
}

/**
 * De kleur van één punt in het merkteken, in een vierkant van 64 bij 64.
 * Hetzelfde beeld als public/merk.svg: een klokring die rechtsboven openbreekt,
 * met daarin het vinkje dat er doorheen naar buiten loopt.
 * @returns {{kleur: number[], dekking: number}}
 */
function merkteken(x, y, { kader = true } = {}) {
  let kleur = kader ? mengen(BLAUW_LICHT, BLAUW_DONKER, (x + y) / 128) : [0, 0, 0];
  let dekking = kader ? Math.max(0, Math.min(1, 0.5 - afstandKader(x, y, 64, 64, 16))) : 0;

  // De ring: er loopt een termijn. Rechtsboven zit de opening.
  const ring = afstandBoog(x, y, 32, 32, 18, 5, 305) - 2.1;
  const ringDekking = Math.max(0, Math.min(1, 0.5 - ring)) * 0.48;

  // Het vinkje: de beslissing, die door de opening naar buiten loopt.
  const vink = Math.min(
    afstandLijn(x, y, 22.5, 33.2, 30.8, 41.5),
    afstandLijn(x, y, 30.8, 41.5, 51, 18.5),
  ) - 3.1;
  const vinkDekking = Math.max(0, Math.min(1, 0.5 - vink));

  const witDekking = Math.max(ringDekking, vinkDekking);
  if (witDekking > 0) {
    if (dekking === 0) { kleur = WIT; dekking = witDekking; }
    else { kleur = mengen(kleur, WIT, witDekking / Math.max(dekking, witDekking)); dekking = Math.max(dekking, witDekking); }
  }
  return { kleur, dekking };
}

// -------------------------------------------------------------- tekenen ----

const MONSTERS = 3; // 3x3 punten per pixel; genoeg voor gladde randen

/**
 * @param {number} breedte
 * @param {number} hoogte
 * @param {(x: number, y: number) => {kleur: number[], dekking: number}} verf
 * @returns {Buffer} rgba, rij voor rij
 */
function teken(breedte, hoogte, verf) {
  const pixels = Buffer.alloc(breedte * hoogte * 4);
  for (let py = 0; py < hoogte; py += 1) {
    for (let px = 0; px < breedte; px += 1) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let sy = 0; sy < MONSTERS; sy += 1) {
        for (let sx = 0; sx < MONSTERS; sx += 1) {
          const { kleur, dekking } = verf(px + (sx + 0.5) / MONSTERS, py + (sy + 0.5) / MONSTERS);
          r += kleur[0] * dekking; g += kleur[1] * dekking; b += kleur[2] * dekking; a += dekking;
        }
      }
      const n = MONSTERS * MONSTERS;
      const i = (py * breedte + px) * 4;
      // Kleuren zijn al met hun dekking vermenigvuldigd, dus weer terugdelen.
      pixels[i] = a > 0 ? Math.round(r / a) : 0;
      pixels[i + 1] = a > 0 ? Math.round(g / a) : 0;
      pixels[i + 2] = a > 0 ? Math.round(b / a) : 0;
      pixels[i + 3] = Math.round((a / n) * 255);
    }
  }
  return pixels;
}

// ------------------------------------------------------------------ png ----

const CRC = (() => {
  const tabel = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabel[n] = c;
  }
  return tabel;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function brok(soort, inhoud) {
  const lengte = Buffer.alloc(4);
  lengte.writeUInt32BE(inhoud.length);
  const lijf = Buffer.concat([Buffer.from(soort, 'latin1'), inhoud]);
  const controle = Buffer.alloc(4);
  controle.writeUInt32BE(crc32(lijf));
  return Buffer.concat([lengte, lijf, controle]);
}

/** Zet rgba-pixels om in een png; filtertype 0 per rij, verder ongefilterd. */
function naarPng(breedte, hoogte, pixels) {
  const rijen = Buffer.alloc(hoogte * (breedte * 4 + 1));
  for (let y = 0; y < hoogte; y += 1) {
    rijen[y * (breedte * 4 + 1)] = 0;
    pixels.copy(rijen, y * (breedte * 4 + 1) + 1, y * breedte * 4, (y + 1) * breedte * 4);
  }
  const kop = Buffer.alloc(13);
  kop.writeUInt32BE(breedte, 0);
  kop.writeUInt32BE(hoogte, 4);
  kop[8] = 8;   // bits per kanaal
  kop[9] = 6;   // rgba
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    brok('IHDR', kop),
    brok('IDAT', deflateSync(rijen, { level: 9 })),
    brok('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- maken ----

function icoon(maat) {
  const schaal = 64 / maat;
  return teken(maat, maat, (x, y) => merkteken(x * schaal, y * schaal));
}

/**
 * Het plaatje dat in WhatsApp of LinkedIn onder een gedeelde link komt. De
 * naam en de belofte staan in de og-tags; dit beeld hoeft alleen het merk te
 * dragen. Licht, zoals de site zelf, met een zachtblauwe ondergrond.
 */
function deelkaart(breedte, hoogte) {
  const maat = 340;
  const links = (breedte - maat) / 2;
  const boven = (hoogte - maat) / 2;
  return teken(breedte, hoogte, (x, y) => {
    // Zachtblauwe gloed vanuit linksboven op wit, net als de banner.
    const afstand = Math.hypot(x / breedte - 0.2, y / hoogte + 0.1);
    const ondergrond = mengen([225, 237, 252], [255, 255, 255], Math.min(1, afstand * 1.25));
    const binnen = x >= links && x < links + maat && y >= boven && y < boven + maat;
    if (!binnen) return { kleur: ondergrond, dekking: 1 };
    const punt = merkteken(((x - links) / maat) * 64, ((y - boven) / maat) * 64);
    return { kleur: mengen(ondergrond, punt.kleur, punt.dekking), dekking: 1 };
  });
}

const bestanden = [
  ['icoon-180.png', 180, 180, icoon(180)],
  ['icoon-512.png', 512, 512, icoon(512)],
  ['deelkaart.png', 1200, 630, deelkaart(1200, 630)],
];

for (const [naam, breedte, hoogte, pixels] of bestanden) {
  const doel = path.join(PUBLIEK, naam);
  writeFileSync(doel, naarPng(breedte, hoogte, pixels));
  console.log(`  ${naam}  ${breedte}x${hoogte}`);
}
