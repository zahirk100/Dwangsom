/**
 * Controle op burgerservicenummer en IBAN.
 *
 * Beide worden gevraagd omdat het bestuursorgaan ze nodig heeft: het BSN om
 * de zaak aan de juiste persoon te koppelen, het IBAN om een toegekende
 * dwangsom te kunnen uitbetalen. Een typefout daarin kost weken, dus wordt
 * er meteen gerekend in plaats van later gebeld.
 */

/** Elfproef, zoals voorgeschreven voor het burgerservicenummer. */
export function bsnKlopt(waarde) {
  const cijfers = String(waarde || '').replace(/\D/g, '');
  if (cijfers.length !== 9 && cijfers.length !== 8) return false;
  const genormaliseerd = cijfers.padStart(9, '0');
  if (/^0{9}$/.test(genormaliseerd)) return false;

  let som = 0;
  for (let i = 0; i < 9; i += 1) {
    const cijfer = Number(genormaliseerd[i]);
    // Het laatste cijfer telt met -1 mee, de rest met hun positiegewicht.
    som += i === 8 ? -cijfer : cijfer * (9 - i);
  }
  return som % 11 === 0;
}

export function normaliseerBsn(waarde) {
  const cijfers = String(waarde || '').replace(/\D/g, '');
  return cijfers ? cijfers.padStart(9, '0') : '';
}

/** Toont alleen de laatste vier cijfers; de rest hoeft niemand in beeld te zien. */
export function maskeerBsn(waarde) {
  const cijfers = normaliseerBsn(waarde);
  return cijfers ? `•••••${cijfers.slice(-4)}` : '';
}

/** IBAN-controle met de mod-97-toets uit ISO 13616. */
export function ibanKlopt(waarde) {
  const iban = String(waarde || '').replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  if (iban.startsWith('NL') && iban.length !== 18) return false;

  const verplaatst = iban.slice(4) + iban.slice(0, 4);
  const cijferreeks = verplaatst.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));

  // Stuk voor stuk rekenen, want het getal past niet in een gewone number.
  let rest = 0;
  for (const cijfer of cijferreeks) {
    rest = (rest * 10 + Number(cijfer)) % 97;
  }
  return rest === 1;
}

export function normaliseerIban(waarde) {
  return String(waarde || '').replace(/\s/g, '').toUpperCase();
}

export function toonIban(waarde) {
  return normaliseerIban(waarde).replace(/(.{4})/g, '$1 ').trim();
}
