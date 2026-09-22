# Livegang: van testopstelling naar echte klanten

Dit document is het draaiboek. Het beschrijft wat er nu staat, wat er nog moet
gebeuren, en in welke volgorde. Achteraan staat een afvinklijst die je van boven
naar beneden kunt aflopen.

De ontwerpkeuzes voor de database en de loginopbouw staan in
[ontwerp-database.md](ontwerp-database.md).

---

## 1. Wat er nu al werkt

Sinds deze ronde zit het volgende erin, en het werkt zonder database, zonder
externe dienst en zonder één npm-pakket:

| | |
| --- | --- |
| **Accounts per medewerker** | Geen gedeeld wachtwoord meer. De eerste beheerder maakt zichzelf aan op `/beheer`; daarna gaat het op uitnodiging. |
| **Tweestapsverificatie** | Verplicht. Zonder tweede factor kom je niet voorbij het instelscherm. Met herstelcodes voor als de telefoon kwijt is. |
| **Rollen** | Beheerder (alles plus accounts), behandelaar (dossiers behandelen), meekijker (alleen lezen, bijvoorbeeld de boekhouder). |
| **Klantportaal** | `/mijn`, met een inloglink per e-mail. Geen wachtwoord. De klant ziet zijn tijdlijn, zijn gegevens, en vult aan wat ontbreekt. |
| **E-mail** | Welkomstmail met inloglink, nieuwe inloglink op verzoek, uitnodiging voor een medewerker, melding naar kantoor bij een nieuw dossier. |
| **Sessies in de opslag** | Uitloggen werkt echt, en een geblokkeerd account verliest zijn lopende sessies meteen. |

200 tests dekken dit af, waaronder de vraag waar het bij een portaal om draait:
kan iemand iets van een ander zien? (`test/portaal.test.js`)

### Wat bewust nog niet erin zit

- **Het originele bestand van de brief wordt niet bewaard**, alleen de
  uitgelezen tekst. Daar is bestandsopslag voor nodig; zie stap 7.
- **Geen OCR.** Een foto of gescande pdf zonder tekstlaag kan niet gelezen
  worden; de funnel vraagt dan om de gegevens met de hand.
- **Het BSN staat onversleuteld in de opslag.** Zie stap 6.

---

## 2. Eerst een keuze: waar gaat het draaien?

Er zijn twee wegen, en ze verschillen in wat je zelf moet onderhouden.

### Weg A: Vercel (aanbevolen)

Wat er nu staat is hierop gebouwd. TLS, schaling en deploys zijn geregeld; jij
zet een domein aan en klaar. Kosten: Vercel Pro, want **het Hobby-plan is
alleen voor niet-commercieel gebruik**.

### Weg B: een eigen server

Een VPS bij Hetzner, TransIP of een andere aanbieder, vanaf ongeveer € 5 per
maand. De applicatie is één `node server.js` zonder afhankelijkheden, dus dit
werkt prima. Je regelt dan zelf: TLS-certificaat (Caddy doet dat automatisch),
een service die herstart na een reboot, back-ups, en updates van het
besturingssysteem.

> **Let op bij "hosting" van een domeinverkoper.** Het standaard webhosting-pakket
> van GoDaddy (en van de meeste .nl-verkopers) draait alleen PHP en statische
> bestanden. **Daar draait deze applicatie niet op.** Koop bij zo'n partij dus
> alleen het domein, niet het hostingpakket. Heb je al hosting gekocht: dat is
> niet weggegooid, je kunt er e-mail bij afnemen, maar de site zelf hoort op
> Vercel of op een VPS.

---

## 3. Moet GitHub eruit?

Dat kan, en het maakt voor de applicatie niets uit. Drie varianten:

**Variant 1: GitHub blijven gebruiken, maar privé.** Je pusht, Vercel bouwt
automatisch. Dit is verreweg het makkelijkst: je hebt versiegeschiedenis, je
kunt terug naar gisteren als er iets stuk gaat, en samenwerken kan later.

**Variant 2: deployen zonder GitHub.** Installeer de Vercel-CLI op je eigen
computer en deploy rechtstreeks:

```bash
npm i -g vercel
cd nubeslist
vercel --prod
```

Vercel vraagt één keer om in te loggen en koppelt de map aan een project. Geen
GitHub nodig. Nadeel: geen geschiedenis, dus bewaar zelf kopieën.

**Variant 3: helemaal weg bij GitHub.** De code is een gewone map met bestanden.
Zet hem op een eigen server, op GitLab, of in een bestandsopslag naar keuze. Er
zit geen enkele koppeling met GitHub in de applicatie.

**Advies:** houd variant 1 zolang er nog aan gebouwd wordt, en zet de repository
op privé. Versiegeschiedenis is het goedkoopste vangnet dat er bestaat: zonder
dat is één verkeerde bewerking genoeg om werk kwijt te zijn. Wil je er toch
vanaf, doe dat dan pas als het bouwen klaar is.

---

## 4. Het domein

### Kopen

`nubeslist.nl` kan bij GoDaddy, dat werkt gewoon. Twee dingen om te weten:

- **.nl loopt altijd via SIDN**, welke verkoper je ook kiest. Een Nederlandse
  partij (TransIP, Versio, Antagonist, Hostnet) is voor .nl meestal goedkoper
  en heeft minder opties die je niet wilt aanvinken. GoDaddy staat erom bekend
  dat het eerste jaar goedkoop is en de verlenging fors duurder.
- **Whois werkt anders bij .nl.** Als privépersoon verbergt SIDN je gegevens
  standaard. Registreer je op de KvK-inschrijving, dan zijn bedrijfsnaam en
  adres openbaar. Staat je bedrijf op je huisadres ingeschreven, dan staat dat
  adres dus openbaar in het register.

Zet **automatische verlenging aan**. Een vergeten verlenging haalt je site en je
e-mail tegelijk offline.

### DNS naar Vercel

Twee manieren, kies er één:

**A. Nameservers naar Vercel (makkelijkst).** In Vercel: *Settings → Domains →
Add*. Vercel geeft twee nameservers. Die zet je bij GoDaddy onder *Nameservers →
Change → I'll use my own*. Vanaf dan beheer je alle DNS in Vercel, inclusief de
records voor je e-mail.

**B. Records bij GoDaddy laten staan.** Voeg toe wat Vercel je opgeeft: een
`A`-record voor `nubeslist.nl` en een `CNAME` voor `www` naar
`cname.vercel-dns.com`. **Neem de exacte waarden over uit het Vercel-scherm**;
die kunnen wijzigen, schrijf ze niet over uit dit document.

Kies daarna in Vercel welke vorm de hoofdvorm is. Advies: `nubeslist.nl` als
hoofdvorm en `www` doorverwijzen. Het certificaat regelt Vercel zelf.

Zet daarna `SITE_URL=https://nubeslist.nl` in de omgevingsvariabelen. Dat is het
adres dat in de e-maillinks komt te staan.

### E-mail bij het domein

Een domein geeft je nog geen mailbox. Regel dit **voordat je gaat adverteren**,
want een nieuw domein dat ineens mail verstuurt komt zonder onderstaande records
in de spambox:

| Record | Waarvoor |
| --- | --- |
| `MX` | waar inkomende mail heen gaat |
| `SPF` (`TXT`) | welke servers namens `nubeslist.nl` mogen versturen |
| `DKIM` (`TXT`) | handtekening waarmee de ontvanger controleert dat de mail echt van jou komt |
| `DMARC` (`TXT`) | wat de ontvanger moet doen als SPF of DKIM niet klopt |

Je hebt **twee verzenders** die allebei in SPF en DKIM moeten staan: je gewone
mailbox (waar klanten naartoe antwoorden) en de verzenddienst die de automatische
mail stuurt. Begin DMARC op `p=none` met een rapportadres, kijk een paar weken
mee, en zet hem daarna pas op `p=quarantine`.

---

## 5. De omgevingsvariabelen

Dit is de complete lijst. Alles met **verplicht** moet erin staan vóór de eerste
echte klant.

| Naam | Verplicht | Waarvoor |
| --- | --- | --- |
| `SESSIE_GEHEIM` | **ja** | Ondertekent de sessiecookies. Zonder dit wordt iedereen uitgelogd bij elke deploy. |
| `SITE_URL` | **ja** | `https://nubeslist.nl`. Het adres in de e-maillinks. |
| `KV_REST_API_URL` · `KV_REST_API_TOKEN` | **ja op Vercel** | De opslag. Zonder dit is alles weg bij de volgende deploy. |
| `RESEND_API_KEY` *of* `POSTMARK_API_KEY` | **ja** | Zonder verzenddienst komen de inloglinks alleen in het logboek. |
| `MAIL_AFZENDER` | **ja** | Bijvoorbeeld `nubeslist.nl <geen-antwoord@nubeslist.nl>`. |
| `MAIL_ANTWOORD_AAN` | aanbevolen | Waar een antwoord van een klant heen gaat. |
| `KANTOOR_EMAIL` | aanbevolen | Krijgt een melding bij elk nieuw dossier. |
| `BEDRIJF_NAAM` · `BEDRIJF_ADRES` · `BEDRIJF_POSTCODE_PLAATS` · `BEDRIJF_KVK` · `BEDRIJF_EMAIL` · `BEDRIJF_TELEFOON` | **ja** | Komen op de machtiging. Wat leeg blijft wordt een stippellijn. |
| `BEHEER_OPEN` | **moet weg** | Zet de beheeromgeving wagenwijd open. Alleen voor proefdraaien. |

Een geheim maak je zo:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

---

## 6. De eerste keer inrichten

1. Deploy, en open `https://nubeslist.nl/beheer`.
2. Er staat nog geen account, dus je krijgt **Maak de eerste beheerder**. Vul je
   naam, e-mailadres en een wachtwoord van minstens twaalf tekens in.
3. Je komt meteen op het scherm voor tweestapsverificatie. Voeg het toe in je
   authenticator-app en vul de code in.
4. **Bewaar de acht herstelcodes.** Je ziet ze één keer. Zonder je telefoon en
   zonder die codes kom je er niet meer in.
5. Nodig via **Accounts** je collega's uit. Is er nog geen mailkoppeling, dan
   toont het scherm de uitnodigingslink; die kun je zelf doorsturen.
6. Dien een testaanvraag in via `/aanvraag` en controleer:
   - [ ] het dossier staat in `/beheer`
   - [ ] er kwam een welkomstmail met een inloglink
   - [ ] die link opent `/mijn` en toont de zaak
   - [ ] je kunt het dossier behandelen en afhandelen
   - [ ] na **Redeploy** staat alles er nog (dat is het bewijs dat de opslag werkt)

---

## 7. Wat daarna nog moet

Op volgorde van belang.

**a. Het BSN versleutelen.** Nu staat het onversleuteld in de opslag. Versleutel
het in de applicatie vóór het opslaan, met een sleutel uit de omgeving. Dan is
een gelekte database nog geen gelekt BSN. De maskering in beeld (`•••••2333`)
staat er al.

**b. De originele brief bewaren.** Nu wordt alleen de uitgelezen tekst bewaard.
Voor een dossier dat standhoudt wil je het bestand zelf. Op Vercel gaat dat met
Vercel Blob of Supabase Storage; op een eigen server met een map.

**c. Een auditlog.** Wie opende wanneer welk dossier. Bij BSN-verwerking hoort
dat erbij, en het staat al in het schema klaar (`db/001-schema.sql`).

**d. Naar Postgres.** Pas nodig als er gezocht en gerapporteerd moet worden over
duizenden dossiers. Het schema en de rijbeveiliging liggen klaar in `db/`; zie
[ontwerp-database.md](ontwerp-database.md) voor de afweging en de volgorde.

**e. Statusmails bij elke stap.** De sjablonen staan in `src/mail.js`
(`meldingVerstuurd`, `toegekend`); ze worden nog niet automatisch verstuurd als
een behandelaar een stap vastlegt.

---

## 8. Kosten per maand

| Post | Wat | Indicatie |
| --- | --- | --- |
| Domein | `nubeslist.nl` | € 1 (ca. € 10 per jaar) |
| Hosting | Vercel Pro (of een VPS vanaf € 5) | € 19 |
| Opslag | Upstash Redis, gratis niveau volstaat lang | € 0 |
| Mailbox | Google Workspace of Microsoft 365, per gebruiker | € 6 |
| Verzenddienst | Resend of Postmark, instapniveau | € 14 |
| **Totaal** | | **ongeveer € 40** |

Ga je later naar Supabase, reken dan € 24 per maand extra.

---

## 9. Vóór de eerste echte klant

Dit is geen bijzaak: jullie verwerken BSN, IBAN, adresgegevens en een
handtekening van mensen die vaak in een kwetsbare positie zitten.

- [ ] **Grondslag voor het BSN.** Een particuliere partij mag een BSN alleen
      gebruiken als daar een wettelijke basis voor is. De route loopt
      waarschijnlijk via de machtiging, maar **laat dit toetsen door een jurist**
      voordat er één BSN in de database staat. Dit is het punt waarop ik geen
      zekerheid kan geven.
- [ ] **DPIA.** Bij stelselmatige verwerking van BSN op enige schaal is een
      gegevensbeschermingseffectbeoordeling al snel verplicht.
- [ ] **Verwerkingsregister** (AVG art. 30) en een **privacyverklaring** op de site.
- [ ] **Verwerkersovereenkomsten** met de hostingpartij, de opslagpartij en de
      mailprovider.
- [ ] **Bewaartermijnen** vastleggen en uitvoeren. Voorstel: het BSN wissen zodra
      de zaak is afgehandeld, het dossier zelf zeven jaar bewaren voor de
      administratie.
- [ ] **Back-up en herstel getest.** Niet "er is een back-up", maar: er is er
      één teruggezet en het werkte.
- [ ] **Algemene voorwaarden**, met de no-cure-no-pay-afspraak erin.
- [ ] **KvK-inschrijving** en de `BEDRIJF_*`-variabelen invullen.
- [ ] **Bevestiging van UWV** dat een digitaal gezette handtekening op de
      machtiging wordt geaccepteerd. Dit staat al langer open en is het enige punt
      dat de hele funnel kan laten omvallen: krijg het schriftelijk.
- [ ] **`BEHEER_OPEN` weg** uit de omgevingsvariabelen.
- [ ] **Tweestapsverificatie** staat aan bij elke medewerker (zichtbaar onder
      Accounts).

---

## 10. De volgorde

**Week 1: het fundament.**
Domein kopen, DNS naar Vercel, mailbox inrichten, SPF/DKIM/DMARC zetten, Vercel
naar Pro, opslag koppelen, omgevingsvariabelen invullen. Daarna staat de site op
`nubeslist.nl` en werkt alles wat er nu is.

**Week 2: inrichten en proefdraaien.**
Eerste beheerder, collega's uitnodigen, verzenddienst koppelen, een paar
testdossiers helemaal doorlopen, van upload tot afhandeling.

**Week 3: het juridische deel.**
Privacyverklaring, algemene voorwaarden, verwerkersovereenkomsten, de BSN-vraag
bij een jurist, en de bevestiging van UWV aanvragen.

**Daarna pas adverteren.** De campagnepagina's staan klaar (`/uwv-wia`,
`/bijstand`, `/wmo` en veertien andere), maar zet er geen budget op voordat
bovenstaande lijst af is. Eén klacht bij de Autoriteit Persoonsgegevens over een
BSN zonder grondslag kost meer dan de hele bouw.
