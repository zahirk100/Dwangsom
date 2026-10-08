/**
 * De rekenmachine op /dwangsom-berekenen.
 *
 * Iemand die "dwangsom berekenen" intypt, wil rekenen. Tot nu toe kreeg hij een
 * uitlegpagina met een tabel, en moest hij zelf met een kalender gaan schuiven -
 * terwijl wij de rekenmotor al hebben draaien in de funnel. Die motor staat in
 * /shared/dwangsom.js en wordt hier letterlijk hergebruikt, zodat het bedrag op
 * deze pagina niet kan afwijken van het bedrag dat een dossier later oplevert.
 *
 * Wat er daarna gebeurt is het punt van de hele pagina: wie ziet dat er iets te
 * halen valt, kan met drie velden zeggen dat wij het mogen regelen. Geen
 * burgerservicenummer, geen machtiging, geen upload - die komen later via een
 * aanmeldlink, als wij hem gesproken hebben.
 *
 * Twee dingen die hier met opzet niet gebeuren. Er wordt geen bedrag beloofd:
 * de uitslag zegt "mogelijk recht" en noemt waar de berekening op steunt. En het
 * bedrag dat de bezoeker ziet gaat niet mee naar de server - die rekent zelf
 * opnieuw, want een bedrag dat je zelf kunt meesturen is geen bedrag.
 */

import { berekenDwangsom, euro } from '/shared/dwangsom.js';
import { BESTUURSORGANEN, zaaktypenVoor, zoekZaaktype } from '/shared/catalogus.js';
import { parseDatum, toonDatum } from '/shared/datum.js';
import { meet } from '/assets/meting.js';

const bij = (id) => document.getElementById(id);

const orgaan = bij('r-orgaan');
const zaak = bij('r-zaak');
const datum = bij('r-datum');
const einddatum = bij('r-einddatum');
const igsDatum = bij('r-igs-datum');
const uitslagvak = bij('r-uitslag');
const leadvak = bij('r-lead');
const klaarvak = bij('r-klaar');

let laatsteUitkomst = null;
let gemeld = false;

// ------------------------------------------------------------- de lijsten ---

function vulLijst(lijst, leegtekst, opties) {
  const gekozen = lijst.value;
  lijst.textContent = '';
  const leeg = document.createElement('option');
  leeg.value = '';
  leeg.textContent = leegtekst;
  lijst.append(leeg);
  for (const { id, label } of opties) {
    const optie = document.createElement('option');
    optie.value = id;
    optie.textContent = label;
    lijst.append(optie);
  }
  if (gekozen && opties.some((o) => o.id === gekozen)) lijst.value = gekozen;
}

vulLijst(orgaan, 'Kies een instantie…', BESTUURSORGANEN);

function vulZaken() {
  vulLijst(zaak, orgaan.value ? 'Kies waar het over gaat…' : 'Kies eerst een instantie',
    zaaktypenVoor(orgaan.value));
  zetDatumlabel();
}

/*
 * Bij een bezwaar loopt de termijn niet vanaf de aanvraag maar vanaf het besluit
 * waartegen bezwaar is gemaakt. Dezelfde vraag stellen levert een datum op
 * waarmee de berekening de verkeerde kant op gaat.
 */
function zetDatumlabel() {
  const soort = zoekZaaktype(zaak.value);
  const bezwaar = soort && soort.termijnVanaf === 'bezwaartermijn';
  bij('r-datum-label').childNodes[0].nodeValue = bezwaar
    ? 'Wanneer is het besluit genomen waartegen je bezwaar maakte? '
    : 'Wanneer heb je de aanvraag gedaan? ';
}

vulZaken();

// ------------------------------------------------------------- het rekenen --

function huidigeInvoer() {
  const soort = zoekZaaktype(zaak.value);
  const igs = document.querySelector('input[name="r-igs"]:checked');
  const invoer = {
    bestuursorgaan: orgaan.value || (soort ? soort.bestuursorgaan : ''),
    zaaktype: zaak.value,
    basisdatum: datum.value,
    termijnBekend: Boolean(einddatum.value),
    termijnEinddatum: einddatum.value,
  };
  if (igs && igs.value === 'ja' && igsDatum.value) {
    invoer.ingebrekeGesteld = true;
    invoer.ingebrekestellingDatum = igsDatum.value;
    invoer.ingebrekestellingDoorOns = false;
  }
  return invoer;
}

/** Wat er nog niet is ingevuld. Zonder deze drie valt er niets te rekenen. */
function compleet(invoer) {
  return Boolean(invoer.zaaktype && invoer.basisdatum && parseDatum(invoer.basisdatum));
}

const KLEUR = {
  recht: 'goed',
  'hersteltermijn-loopt': 'info',
  'ingebrekestelling-nodig': 'info',
  'termijn-loopt': 'info',
  'geen-recht': 'niets',
};

function toon(rapport) {
  const vervolg = rapport.vervolg || {};
  const b = rapport.berekening;
  uitslagvak.className = `uitslag uitslag--${KLEUR[rapport.uitkomst] || 'info'}`;
  uitslagvak.textContent = '';

  const kop = document.createElement('strong');
  // Staat het bedrag er zo dadelijk groot onder, dan hoeft het niet ook nog in
  // de kop: dan staat hetzelfde getal drie keer op een half scherm.
  kop.textContent = b && b.totaal > 0 ? 'Mogelijk recht op' : (rapport.kop || 'Uitkomst');
  uitslagvak.append(kop);

  if (b && b.totaal > 0) {
    const bedrag = document.createElement('span');
    bedrag.className = 'bedrag';
    bedrag.textContent = euro(b.totaal);
    uitslagvak.append(bedrag);
  }

  const zin = document.createElement('p');
  zin.textContent = rapport.samenvatting || '';
  uitslagvak.append(zin);

  // Waar de uitkomst op steunt. Een bedrag zonder die regels is een getal
  // waar niemand iets mee kan.
  const punten = [];
  if (rapport.beslistermijn && rapport.beslistermijn.einddatum) {
    // "liep" klopt niet als de termijn nog loopt; dit staat ook onder een
    // uitkomst waarbij de instantie nog tijd heeft.
    punten.push(`Beslistermijn: tot en met ${toonDatum(parseDatum(rapport.beslistermijn.einddatum))}.`);
  }
  if (b && b.eersteDag) {
    punten.push(`De teller loopt vanaf ${toonDatum(parseDatum(b.eersteDag))}.`);
  }
  if (b && b.doorlopend && b.maximumOp) {
    punten.push(`Het bedrag loopt nog op tot ${toonDatum(parseDatum(b.maximumOp))}.`);
  }
  if (vervolg.actieLabel && vervolg.actiedatum) {
    punten.push(`${vervolg.actieLabel}: ${toonDatum(parseDatum(vervolg.actiedatum))}.`);
  }
  if (vervolg.actieUitleg) punten.push(vervolg.actieUitleg);
  if (punten.length) {
    const lijst = document.createElement('ul');
    for (const p of punten) {
      const li = document.createElement('li');
      li.textContent = p;
      lijst.append(li);
    }
    uitslagvak.append(lijst);
  }

  // Alleen vragen of wij mogen helpen als er ook echt iets te doen is.
  const ietsTeDoen = rapport.uitkomst !== 'geen-recht';
  leadvak.classList.toggle('verborgen', !ietsTeDoen || !klaarvak.classList.contains('verborgen'));
}

function herbereken() {
  const invoer = huidigeInvoer();
  if (!compleet(invoer)) {
    uitslagvak.className = 'uitslag uitslag--wacht';
    uitslagvak.textContent = '';
    const p = document.createElement('p');
    p.textContent = 'Vul hierboven je zaak in, dan rekenen wij meteen uit waar je staat.';
    uitslagvak.append(p);
    leadvak.classList.add('verborgen');
    laatsteUitkomst = null;
    return;
  }
  const rapport = berekenDwangsom(invoer);
  laatsteUitkomst = { invoer, rapport };
  toon(rapport);

  // Eén keer per bezoek tellen dat de rekenmachine iets opleverde; niet bij elk
  // toetsaanslagje, want dan telt één bezoeker twintig keer mee.
  if (!gemeld) {
    gemeld = true;
    meet('reken-uitslag');
  }
}

for (const veld of [orgaan, zaak, datum, einddatum, igsDatum]) {
  veld.addEventListener('change', herbereken);
}
orgaan.addEventListener('change', () => { zaak.value = ''; vulZaken(); herbereken(); });
zaak.addEventListener('change', zetDatumlabel);

for (const knop of document.querySelectorAll('input[name="r-igs"]')) {
  knop.addEventListener('change', () => {
    const ja = knop.value === 'ja' && knop.checked;
    igsDatum.disabled = !ja;
    if (!ja) igsDatum.value = '';
    herbereken();
  });
}

// ------------------------------------------------------------- de aanmelding -

function zetFout(veld, tekst) {
  const regel = bij(`fout-${veld}`);
  if (!regel) return;
  regel.textContent = tekst || '';
  regel.classList.toggle('verborgen', !tekst);
}

function wisFouten() {
  for (const veld of ['naam', 'telefoon', 'email', 'basisdatum', 'termijnEinddatum',
    'ingebrekestellingDatum', 'zaaktype', 'bestuursorgaan']) zetFout(veld, '');
  bij('r-fout').classList.add('verborgen');
}

bij('r-verstuur').addEventListener('click', async () => {
  wisFouten();
  if (!laatsteUitkomst) return;

  const knop = bij('r-verstuur');
  knop.disabled = true;
  const oudeTekst = knop.textContent;
  knop.textContent = 'Bezig met versturen…';

  const igs = document.querySelector('input[name="r-igs"]:checked');
  const lading = {
    zaak: {
      bestuursorgaan: laatsteUitkomst.invoer.bestuursorgaan,
      zaaktype: laatsteUitkomst.invoer.zaaktype,
      basisdatum: laatsteUitkomst.invoer.basisdatum,
      termijnEinddatum: laatsteUitkomst.invoer.termijnEinddatum || '',
    },
    naam: bij('r-naam').value,
    telefoon: bij('r-telefoon').value,
    email: bij('r-email').value,
    ingebrekeGesteld: Boolean(igs && igs.value === 'ja'),
    ingebrekestellingDatum: igsDatum.value,
    bron: new URLSearchParams(location.search).get('bron') || '',
  };

  try {
    const antwoord = await fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lading),
    });
    const data = await antwoord.json().catch(() => ({}));

    if (antwoord.status === 201) {
      leadvak.classList.add('verborgen');
      klaarvak.textContent = '';
      const kop = document.createElement('strong');
      kop.textContent = 'Gelukt, wij nemen contact met je op';
      const p = document.createElement('p');
      p.textContent = `Je kenmerk is ${data.referentie}. Wij bellen of appen je; `
        + 'daarna regelen wij de rest. Je hoeft nu niets meer te doen.';
      klaarvak.append(kop, p);
      if (data.email) {
        const mail = document.createElement('p');
        mail.textContent = 'Je krijgt ook een e-mail met een link naar je eigen dossier.';
        klaarvak.append(mail);
      }
      klaarvak.classList.remove('verborgen');
      klaarvak.scrollIntoView({ behavior: 'smooth', block: 'center' });
      meet('reken-lead');
      // Meta mag dit weten, maar alleen als er toestemming is; die module
      // bewaakt dat zelf en doet niets zonder.
      if (window.nbMeta) window.nbMeta('Lead');
      return;
    }

    if (data.velden) {
      for (const [veld, tekst] of Object.entries(data.velden)) zetFout(veld, tekst);
      bij('r-fout').textContent = 'Er ontbreekt nog iets. Kijk waar het rood staat.';
      bij('r-fout').classList.remove('verborgen');
      return;
    }
    bij('r-fout').textContent = data.fout || 'Versturen is niet gelukt. Probeer het nog een keer.';
    bij('r-fout').classList.remove('verborgen');
  } catch {
    bij('r-fout').textContent = 'Wij konden je gegevens niet versturen. Controleer je verbinding '
      + 'en probeer het nog een keer.';
    bij('r-fout').classList.remove('verborgen');
  } finally {
    knop.disabled = false;
    knop.textContent = oudeTekst;
  }
});
