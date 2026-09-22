/**
 * Uitgaande e-mail.
 *
 * Er zijn drie manieren waarop dit kan lopen, en de applicatie kiest zelf:
 *
 *   1. Een verzenddienst met een REST-API (Resend of Postmark). Alleen een
 *      sleutel in de omgeving zetten; versturen gaat daarna met `fetch`, dus
 *      zonder bibliotheek en zonder SMTP-verbinding. Dat laatste is belangrijk
 *      op een serverloos platform, waar een SMTP-sessie vaak niet eens lukt.
 *   2. Niets ingesteld: dan wordt de mail in het logboek gezet en verder
 *      niets. Lokaal is dat precies goed, want je ziet de magic link gewoon
 *      in je terminal staan.
 *
 * Wat er nooit in een e-mail komt: burgerservicenummer, IBAN, geboortedatum.
 * E-mail is geen beveiligd kanaal; wie de inhoud wil zien, logt in.
 */

const AFZENDER = () => process.env.MAIL_AFZENDER || 'nubeslist.nl <geen-antwoord@nubeslist.nl>';
const ANTWOORD_AAN = () => process.env.MAIL_ANTWOORD_AAN || '';

/** Welke verzender is er ingesteld? */
export function mailInstellingen(env = process.env) {
  if (env.RESEND_API_KEY) return { soort: 'resend', sleutel: env.RESEND_API_KEY };
  if (env.POSTMARK_API_KEY) return { soort: 'postmark', sleutel: env.POSTMARK_API_KEY };
  return { soort: 'logboek', sleutel: '' };
}

/** Tekst veilig in html zetten. */
function veilig(tekst) {
  return String(tekst ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Eén opmaak voor alle berichten: wit met blauw, net als de site, en zonder
 * afbeeldingen. Afbeeldingen worden in veel mailprogramma's geblokkeerd, dus
 * het merkteken is hier een gekleurd vierkantje met een vinkje in tekst.
 */
function omhulsel({ kop, regels, knop, slot }) {
  const lijf = regels.map((r) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#57657f">${r}</p>`).join('');
  const knopHtml = knop
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0">
         <tr><td style="border-radius:10px;background:#24509a">
           <a href="${veilig(knop.url)}" style="display:inline-block;padding:13px 24px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">${veilig(knop.tekst)}</a>
         </td></tr>
       </table>`
    : '';
  return `<!doctype html><html lang="nl"><body style="margin:0;padding:0;background:#f5f8fd">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8fd;padding:28px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e9f4;border-radius:16px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif">
      <tr><td style="padding:26px 28px 0">
        <span style="display:inline-block;width:30px;height:30px;line-height:30px;text-align:center;border-radius:9px;background:#24509a;color:#ffffff;font-size:16px;font-weight:700">&#10003;</span>
        <span style="margin-left:9px;font-size:16px;font-weight:700;color:#14213a;vertical-align:middle">nubeslist<span style="color:#24509a">.nl</span></span>
      </td></tr>
      <tr><td style="padding:18px 28px 28px">
        <h1 style="margin:0 0 14px;font-size:21px;line-height:1.25;color:#14213a">${veilig(kop)}</h1>
        ${lijf}${knopHtml}
        ${slot ? `<p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#8a95a8">${slot}</p>` : ''}
      </td></tr>
    </table>
    <p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:1.6;color:#8a95a8;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
      nubeslist.nl is een particuliere dienstverlener en geen overheidsinstantie.
    </p>
  </td></tr>
</table></body></html>`;
}

/** De platte tekst, voor programma's die geen html tonen. */
function alsTekst({ kop, regels, knop, slot }) {
  const strepen = (t) => String(t).replace(/<[^>]+>/g, '');
  return [kop, '', ...regels.map(strepen), knop ? `\n${knop.tekst}: ${knop.url}` : '', slot ? `\n${strepen(slot)}` : '']
    .filter((r) => r !== '').join('\n');
}

// ------------------------------------------------------------- sjablonen ---

export const SJABLONEN = {
  /** De klant heeft net zijn zaak ingediend en kan hem nu volgen. */
  welkom: ({ naam, referentie, url, uitkomst }) => ({
    onderwerp: `Je zaak staat klaar (${referentie})`,
    kop: 'Je zaak staat klaar',
    regels: [
      `Hallo${naam ? ` ${veilig(naam)}` : ''}, wij hebben je zaak in behandeling genomen.`,
      uitkomst ? `<strong>${veilig(uitkomst)}</strong>` : '',
      'Via de knop hieronder zie je altijd waar je zaak staat en wat wij op dit moment doen. '
        + 'Je hoeft niets te onthouden: elke mail van ons bevat opnieuw zo\'n knop.',
      `Je referentienummer is <strong>${veilig(referentie)}</strong>.`,
    ].filter(Boolean),
    knop: { tekst: 'Bekijk mijn zaak', url },
    slot: 'Deze link is een uur geldig en werkt één keer. Vraag daarna gewoon een nieuwe aan.',
  }),

  /** Opnieuw inloggen zonder wachtwoord. */
  inloglink: ({ url }) => ({
    onderwerp: 'Je inloglink voor nubeslist.nl',
    kop: 'Hier is je inloglink',
    regels: ['Klik op de knop hieronder om je zaak te bekijken. Je hoeft geen wachtwoord te onthouden.'],
    knop: { tekst: 'Naar mijn zaak', url },
    slot: 'Heb je deze link niet aangevraagd? Dan kun je deze mail negeren; er gebeurt niets.',
  }),

  /** Een medewerker is uitgenodigd en moet zijn account instellen. */
  uitnodiging: ({ naam, rol, url, door }) => ({
    onderwerp: 'Je account voor de beheeromgeving van nubeslist.nl',
    kop: 'Stel je account in',
    regels: [
      `Hallo${naam ? ` ${veilig(naam)}` : ''}, ${veilig(door || 'een beheerder')} heeft een account voor je aangemaakt als <strong>${veilig(rol)}</strong>.`,
      'Via de knop hieronder kies je een wachtwoord en stel je tweestapsverificatie in. Dat laatste is verplicht: in de beheeromgeving staan persoonsgegevens van aanvragers.',
    ],
    knop: { tekst: 'Account instellen', url },
    slot: 'Deze uitnodiging is zeven dagen geldig.',
  }),

  /** De melding is de deur uit. */
  meldingVerstuurd: ({ naam, instantie, referentie, url }) => ({
    onderwerp: `Wij hebben ${instantie} gemeld dat de termijn voorbij is (${referentie})`,
    kop: 'De melding is verstuurd',
    regels: [
      `Hallo${naam ? ` ${veilig(naam)}` : ''}, wij hebben ${veilig(instantie)} laten weten dat de beslistermijn voorbij is en dat je alsnog een besluit wilt.`,
      `${veilig(instantie)} heeft nu twee weken om te beslissen. Komt er niets, dan gaat er een dwangsom lopen en vorderen wij die voor je.`,
      'Je hoeft zelf niets te doen. Wij houden de datums in de gaten.',
    ],
    knop: { tekst: 'Bekijk mijn zaak', url },
  }),

  /** De beslistermijn is verstreken terwijl wij hem bewaakten. */
  termijnVerlopen: ({ naam, instantie, referentie, url }) => ({
    onderwerp: `De beslistermijn van ${instantie} is voorbij (${referentie})`,
    kop: 'De termijn is voorbij',
    regels: [
      `Hallo${naam ? ` ${veilig(naam)}` : ''}, de termijn waarbinnen ${veilig(instantie)} had moeten beslissen is verstreken.`,
      'Wij stellen hen nu namens jou in gebreke. Dat is de stap die de wet vereist voordat er een dwangsom kan gaan lopen.',
      `Daarna heeft ${veilig(instantie)} nog twee weken. Komt er dan nog geen besluit, dan gaat de dwangsom lopen en vorderen wij die voor je.`,
      'Je hoeft zelf niets te doen.',
    ],
    knop: { tekst: 'Bekijk mijn zaak', url },
  }),

  /** De hersteltermijn is om: vanaf nu telt de dwangsom. */
  dwangsomLoopt: ({ naam, instantie, referentie, url }) => ({
    onderwerp: `Er loopt nu een dwangsom voor je (${referentie})`,
    kop: 'De dwangsom loopt',
    regels: [
      `Hallo${naam ? ` ${veilig(naam)}` : ''}, de twee weken na onze melding zijn voorbij en ${veilig(instantie)} heeft nog steeds niet beslist.`,
      'Vanaf vandaag loopt er een dwangsom op, voor elke dag dat het besluit uitblijft. Dat loopt door tot maximaal 42 dagen.',
      'Wij houden het bedrag bij en vorderen het zodra er een besluit is of het maximum is bereikt. Een toegekende vergoeding wordt rechtstreeks aan jou overgemaakt.',
    ],
    knop: { tekst: 'Bekijk mijn zaak', url },
  }),

  /** Er ontbreken nog stukken, en het is stil gebleven. */
  stukkenHerinnering: ({ naam, referentie, stukken = [], url }) => ({
    onderwerp: `Wij missen nog een paar stukken (${referentie})`,
    kop: 'Wij missen nog iets van jou',
    regels: [
      `Hallo${naam ? ` ${veilig(naam)}` : ''}, je zaak staat klaar, maar wij kunnen hem nog niet onderbouwen. Dit hebben wij nog nodig:`,
      stukken.length
        ? `<ul style="margin:0 0 14px;padding-left:20px">${stukken.map((s) => `<li style="margin-bottom:5px">${veilig(s)}</li>`).join('')}</ul>`
        : 'Een of meer stukken bij je zaak.',
      'Je kunt ze toevoegen via de knop hieronder. Een foto van het papier met je telefoon is ook goed.',
    ],
    knop: { tekst: 'Stukken toevoegen', url },
    slot: 'Heb je ze al opgestuurd? Dan heeft deze mail elkaar gekruist en hoef je niets te doen.',
  }),

  /** Er is toegekend. */
  toegekend: ({ naam, bedrag, referentie, url }) => ({
    onderwerp: `Goed nieuws over je zaak (${referentie})`,
    kop: 'Er is een dwangsom toegekend',
    regels: [
      `Hallo${naam ? ` ${veilig(naam)}` : ''}, er is een dwangsom toegekend van <strong>${veilig(bedrag)}</strong>.`,
      'Het bedrag wordt rechtstreeks op je eigen rekening gestort door de instantie.',
    ],
    knop: { tekst: 'Bekijk mijn zaak', url },
  }),

  /** Naar kantoor: er staat werk klaar. */
  nieuwDossier: ({ referentie, instantie, uitkomst, url }) => ({
    onderwerp: `Nieuw dossier ${referentie} (${instantie})`,
    kop: 'Er is een nieuw dossier binnen',
    regels: [
      `<strong>${veilig(referentie)}</strong> bij ${veilig(instantie)}.`,
      `Uitkomst van de automatische toets: ${veilig(uitkomst)}.`,
    ],
    knop: { tekst: 'Openen in de beheeromgeving', url },
  }),
};

// ------------------------------------------------------------- versturen ---

/**
 * Verstuurt één bericht.
 *
 * Gooit nooit: een mislukte mail mag een aanvraag niet laten mislukken. Wat er
 * misging komt in het logboek en in het antwoord te staan, zodat de beller kan
 * besluiten het later nog eens te proberen.
 *
 * @returns {Promise<{gelukt: boolean, soort: string, fout?: string, id?: string}>}
 */
export async function verstuur({ aan, sjabloon, gegevens = {} }) {
  const maker = SJABLONEN[sjabloon];
  if (!maker) return { gelukt: false, soort: 'onbekend', fout: `Onbekend sjabloon: ${sjabloon}` };

  const inhoud = maker(gegevens);
  const html = omhulsel(inhoud);
  const tekst = alsTekst(inhoud);
  const { soort, sleutel } = mailInstellingen();

  if (soort === 'logboek') {
    // Lokaal: de link moet zichtbaar zijn, anders kun je niet testen.
    console.log(`\n  [mail → ${aan}] ${inhoud.onderwerp}`);
    if (inhoud.knop) console.log(`  ${inhoud.knop.tekst}: ${inhoud.knop.url}\n`);
    return { gelukt: true, soort: 'logboek' };
  }

  try {
    if (soort === 'resend') {
      const antwoord = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sleutel}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: AFZENDER(),
          to: [aan],
          subject: inhoud.onderwerp,
          html,
          text: tekst,
          ...(ANTWOORD_AAN() ? { reply_to: ANTWOORD_AAN() } : {}),
        }),
      });
      const data = await antwoord.json().catch(() => ({}));
      if (!antwoord.ok) throw new Error(data.message || `status ${antwoord.status}`);
      return { gelukt: true, soort, id: data.id };
    }

    // Postmark
    const antwoord = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'X-Postmark-Server-Token': sleutel,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        From: AFZENDER(),
        To: aan,
        Subject: inhoud.onderwerp,
        HtmlBody: html,
        TextBody: tekst,
        MessageStream: 'outbound',
        ...(ANTWOORD_AAN() ? { ReplyTo: ANTWOORD_AAN() } : {}),
      }),
    });
    const data = await antwoord.json().catch(() => ({}));
    if (!antwoord.ok) throw new Error(data.Message || `status ${antwoord.status}`);
    return { gelukt: true, soort, id: data.MessageID };
  } catch (err) {
    console.error(`[mail] versturen naar ${aan} mislukt: ${err.message}`);
    return { gelukt: false, soort, fout: err.message };
  }
}
