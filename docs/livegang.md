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
- **De stukken die de klant zelf aanlevert, gaan als base64 in het dossier**,
  met een grens van 3 MB per bestand. Dat werkt, en het werkt zonder één
  dependency, maar het is geen opslag: elk dossier wordt er groter van en de
  opslaglimiet van Redis is niet oneindig. Dit hoort over naar Vercel Blob of
  Supabase Storage zodra het domein er staat; zie stap 7.
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

### Kopen: waar, en wat "onder één dak" hier kan betekenen

**Bij Vercel zelf kan niet.** Vercel verkoopt domeinen, maar heeft de meeste
landextensies uit zijn aanbod gehaald, `.nl` daarbij. Dat is bevestigd in hun
eigen changelog en in hun helpforum, waar iemand met precies deze vraag te horen
kreeg: koop hem bij een Nederlandse partij en koppel hem. Alles bij één
leverancier kopen is voor een `.nl` dus geen optie.

Wat wél kan, en in de praktijk op hetzelfde neerkomt: **koop het domein bij een
Nederlandse registrar en verhuis het DNS-beheer naar Vercel.** De registratie
staat dan bij de registrar (één factuur per jaar, verder kijk je er nooit naar
om), en alles wat je dagelijks aanraakt — het certificaat, de records voor de
site, de records voor de mail — beheer je op één plek in Vercel. Dat is het
dichtst bij "één dak" dat je voor een `.nl` kunt krijgen.

### Kan alles bij TransIP?

Voor het **domein**: ja, prima keuze. Nederlandse partij, Nederlandse support,
en dat is precies waar je een registrar voor nodig hebt.

Voor de **hosting van deze applicatie**: nee, en dat is geen detail.

- **Hun webhostingpakketten draaien PHP en MySQL.** Deze applicatie is
  JavaScript op Node. Op gedeelde hosting kun je Node hooguit als achtergrond-
  proces via SSH draaien; de webserver op poort 80 vervangen kan er niet. De
  site zou er dus niet op werken.
- **Hun VPS is een kale virtuele machine.** Geen beheerde database, geen
  objectopslag, geen serverloze functies. Je krijgt een Linux-server met een
  netwerkkaart en een schijf. Dat betekent dat jij degene bent die het
  besturingssysteem bijwerkt, de firewall inricht, het TLS-certificaat
  vernieuwt, de back-ups maakt én test, en 's nachts kijkt als het stilvalt.
  Dat is een baan, geen instelling.
- **Beheerde database hebben ze niet.** Onze `db/`-map is Postgres. Op een
  TransIP-VPS zou je die zelf installeren, beveiligen en back-uppen.

Wat je met "alles onder één dak" wint is één factuur. Wat je verliest is dat
Vercel nu het certificaat, de schaal, de deploys en het terugrollen voor je
doet, en dat een fout deployment één klik terug is. Voor een dienst die
burgerservicenummers verwerkt, is zelf een server beheren een risico dat je
alleen moet nemen als je het ook echt wilt beheren.

**Advies: domein bij TransIP, hosting op Vercel, database bij Vercel of
Supabase.** Verhuis de nameservers naar Vercel (zie hieronder), dan staat alles
wat je dagelijks aanraakt toch op één plek. De enige keer dat je bij TransIP
inlogt is voor de jaarlijkse verlenging.

Wil je later tóch alles op eigen ijzer, dan kan dat: de applicatie heeft geen
enkele afhankelijkheid en draait met `node server.js` overal waar Node staat.
Maar doe dat als bewuste stap, niet als bijvangst van een domeinregistratie.

**Welke registrar.** `.nl` loopt altijd via SIDN, welke verkoper je ook kiest;
het verschil zit in prijs, support en hoeveel er standaard aanstaat dat je niet
wilt. Nederlandse partijen als TransIP, Versio, Antagonist of Hostnet zijn voor
`.nl` meestal goedkoper dan GoDaddy en hebben Nederlandse support, wat scheelt
als er iets met SIDN moet gebeuren. GoDaddy werkt op zich prima, maar staat erom
bekend dat het eerste jaar goedkoop is en de verlenging fors duurder. Controleer
de verlengprijs, niet de eerstejaarsprijs.

Twee dingen die mensen achteraf verrassen:

- **Whois werkt anders bij .nl.** Als privépersoon verbergt SIDN je gegevens
  standaard. Registreer je op de KvK-inschrijving, dan zijn bedrijfsnaam en
  adres openbaar. Staat je bedrijf op je huisadres ingeschreven, dan staat dat
  huisadres dus openbaar in het register.
- **Zet automatische verlenging aan.** Een vergeten verlenging haalt je site en
  je e-mail tegelijk offline, en een vrijgevallen `.nl` is binnen een dag door
  iemand anders geregistreerd.

Koop meteen ook `nubeslist.com` of een veelgemaakte typefout als je dat wilt
afschermen; dat is een paar euro per jaar en later duurder.

### Welke vergoeding: percentage of vast bedrag?

Dit is een bedrijfsbeslissing, geen code. Maar de wet bepaalt hier de vorm van
het antwoord, dus hier de cijfers waarop je hem kunt nemen.

De dwangsom loopt op in drie tranches: 14 dagen &euro; 23, dan 14 dagen &euro; 35,
dan 14 dagen &euro; 45, met een maximum van &euro; 1.442 na 42 dagen. Het bedrag
is dus niet één bedrag maar een reeks die een factor 60 overbrugt:

| Dagen te laat | Dwangsom | 20% | 25% | 30% | Vast &euro; 129 |
| --- | --- | --- | --- | --- | --- |
| 1 | &euro; 23 | &euro; 5 | &euro; 6 | &euro; 7 | **&euro; 23** (alles) |
| 3 | &euro; 69 | &euro; 14 | &euro; 17 | &euro; 21 | **&euro; 69** (alles) |
| 7 | &euro; 161 | &euro; 32 | &euro; 40 | &euro; 48 | &euro; 129 (80%) |
| 14 | &euro; 322 | &euro; 64 | &euro; 81 | &euro; 97 | &euro; 129 (40%) |
| 28 | &euro; 812 | &euro; 162 | &euro; 203 | &euro; 244 | &euro; 129 (16%) |
| 42 | &euro; 1.442 | &euro; 288 | &euro; 361 | &euro; 433 | &euro; 129 (9%) |

**Een vast bedrag valt af.** Bij een zaak van een paar dagen is het meer dan de
hele dwangsom: je zou iemand een rekening sturen die hoger is dan wat hij heeft
gekregen. Dat is niet uit te leggen en het is het soort verhaal waarmee je in
de krant komt. En aan de bovenkant laat je het grootste deel liggen: bij een
volle zaak vang je &euro; 129 waar 25% &euro; 361 zou zijn. Een vast bedrag
werkt alleen als de opbrengst per zaak ongeveer gelijk is, en dat is hier juist
niet zo.

**Een percentage past bij de zaak.** Het schaalt mee, het kan per definitie
nooit hoger zijn dan wat de klant ontvangt, en het is in één zin uit te leggen:
"jij houdt 75%". Bij kleine zaken verdien je er niet aan — die kosten ongeveer
evenveel werk als grote — maar dat is een reden om een ondergrens te hanteren
in wélke zaken je aanneemt, niet om de prijs anders te bouwen.

Drie dingen om vóór het kiezen uit te zoeken:

- **Btw.** Voor consumenten moet de prijs die je toont de prijs zijn die zij
  betalen, dus inclusief btw. Zet je `TARIEF_PERCENTAGE=25`, dan is dat 25%
  inclusief, niet 25% plus 21%. Bespreek met je boekhouder of deze dienst
  btw-plichtig is (waarschijnlijk 21%) en reken terug.
- **Hoe je aan je geld komt.** Het bestuursorgaan betaalt de dwangsom
  rechtstreeks aan de klant, niet aan ons — UWV zegt dat met zoveel woorden.
  Jij stuurt dus achteraf een factuur aan iemand die het geld al binnen heeft.
  Dat is een incassorisico dat groeit met het bedrag, en het is het sterkste
  argument om niet te hoog te gaan zitten: 25% van &euro; 1.442 is
  &euro; 361, en dat is een bedrag waar mensen over gaan nadenken. Regel dit in
  de voorwaarden en overweeg een incassomachtiging bij het tekenen.
- **Mag no-cure-no-pay hier?** Voor advocaten gelden beperkingen. Wij treden op
  als gemachtigde in een bestuursrechtelijke procedure, wat een ander regime
  is, maar laat dit bevestigen voordat je het groot op de homepage zet.

**Advies: een percentage, ergens tussen 20% en 25%.** Lager dan 20% en de
kleine zaken kosten je geld; hoger dan 25% en je maakt het jezelf moeilijk bij
het innen én bij de eerste journalist die belt. Zet het daarna met
`TARIEF_PERCENTAGE` in de omgeving; de site zet het vanzelf op de homepage, in
de funnel vlak voor de handtekening, en in de voorwaarden.

### Vercel moet naar Pro

Dit hoort bij het domein omdat het op hetzelfde moment speelt. Het gratis
**Hobby**-plan van Vercel is uitdrukkelijk voor niet-commercieel gebruik.
nubeslist.nl vraagt geld voor een dienst, dus dat is commercieel. Voor de eerste
echte klant moet het project op een betaald plan staan. Reken op ongeveer
$20 per gebruiker per maand; controleer de actuele prijs bij het overzetten.

### DNS: laat hem bij TransIP staan

Twee manieren, en welke de beste is hangt af van waar je mailbox staat.

**Neem je een mailbox bij TransIP — het advies hierboven — laat de DNS dan
ook bij TransIP.** Voeg daar toe wat Vercel je opgeeft: een `A`-record voor
`nubeslist.nl` en een `CNAME` voor `www` naar `cname.vercel-dns.com`. **Neem
de exacte waarden over uit het Vercel-scherm**; die kunnen wijzigen, schrijf ze
niet over uit dit document.

Waarom niet de nameservers naar Vercel, wat "alles op één plek" zou opleveren?
Omdat TransIP dan de regie over je DNS kwijt is, en de `MX`-records voor je
mailbox niet meer vanzelf goed staan. Die moet je dan met de hand overnemen.
Het risico zit in de faalmodus: gaat er iets mis met een `MX`-record, dan
verdwijnt inkomende post zonder foutmelding — je merkt het pas als een klant
belt dat hij geen antwoord krijgt. Gaat er iets mis met het `A`-record van de
site, dan laadt de site niet en zie je dat binnen een minuut.

Zes regels met de hand plakken bij TransIP (twee voor Vercel, drie DKIM van je
verzenddienst, één SPF, plus DMARC) is die stille faalmodus niet waard.

**Verhuis je de nameservers tóch naar Vercel** — bijvoorbeeld omdat je je
mailbox ergens anders neemt en je die records sowieso met de hand zet — dan
beheer je vanaf dat moment álle DNS in Vercel, inclusief `MX`, `SPF`, `DKIM` en
`DMARC`. Controleer na de verhuizing of je nog mail ontvangt; dat is de test
die mensen overslaan.

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
| `TARIEF_PERCENTAGE` *of* `TARIEF_VAST` | **ja** | Onze vergoeding: `25` (procent van de toegekende dwangsom) of `129` (vast bedrag). Staat er niets, dan noemt de site nergens een bedrag en zegt hij dat je het vooraf hoort. Dat is eerlijk, maar het kost conversie: zet het erin. |
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

**b. Echte bestandsopslag.** Twee dingen komen hier samen. De originele brief
wordt niet bewaard, alleen de uitgelezen tekst, en voor een dossier dat
standhoudt wil je het bestand zelf. En de stukken die de klant via `/mijn`
aanlevert, gaan nu als base64 in het dossier — werkend, maar het laat de
dossiers groeien en de opslag is er niet voor gemaakt. Beide horen naar Vercel
Blob of Supabase Storage (op een eigen server: een map). In het dossier blijft
dan alleen de verwijzing staan.

Houd bij die verhuizing twee dingen overeind die er nu al in zitten: downloaden
kan alleen ingelogd, en een bestand gaat altijd als `attachment` met `no-store`
de deur uit. Een link die rechtstreeks naar de opslag wijst en voor iedereen
werkt, is een datalek met een net randje.

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
- [ ] **Algemene voorwaarden**, met de no-cure-no-pay-afspraak erin. Er staat nu
      een pagina op `/voorwaarden` waar het vinkje boven de handtekening naar
      linkt. Die beschrijft in gewone taal wat het systeem werkelijk doet — wat
      wij overnemen, dat de dwangsom rechtstreeks aan de klant wordt betaald,
      dat de machtiging alleen voor deze ene procedure geldt en in te trekken
      is. Het is **geen door een jurist opgestelde set voorwaarden**, en de
      pagina zegt dat zelf ook. Laat hem nakijken en vul aan wat een jurist
      mist (opzegtermijn, aansprakelijkheid, geschillenregeling).
- [ ] **KvK-inschrijving** en de `BEDRIJF_*`-variabelen invullen.
- [ ] **Bevestiging van UWV** dat een digitaal gezette handtekening op de
      machtiging wordt geaccepteerd. Dit staat al langer open en is het enige punt
      dat de hele funnel kan laten omvallen: krijg het schriftelijk.
- [ ] **Het tarief gekozen en ingesteld** (`TARIEF_PERCENTAGE` of
      `TARIEF_VAST`). Zolang dit leeg is, staat er op de homepage, in de funnel
      en in de voorwaarden geen bedrag. De code verzint er bewust geen: een
      percentage dat niemand heeft besloten, op het scherm waar iemand tekent,
      is erger dan geen percentage.
- [ ] **`BEHEER_OPEN` weg** uit de omgevingsvariabelen.
- [ ] **Tweestapsverificatie** staat aan bij elke medewerker (zichtbaar onder
      Accounts).

---

## 10. Het plan, in vier blokken

Vier blokken, en ze moeten in deze volgorde. Elk blok eindigt met iets dat je
kunt controleren; is dat er niet, dan is het blok niet af.

### Blok 1 — Het domein en het adres (een halve dag, plus wachttijd)

1. Koop `nubeslist.nl` bij een Nederlandse registrar (zie stap 4). Zet
   automatische verlenging aan.
2. Zet Vercel op een betaald plan. Hobby mag niet voor een betaalde dienst.
3. In Vercel: *Settings → Domains → Add* → `nubeslist.nl`. Neem de nameservers
   over bij je registrar.
4. Wacht tot Vercel het domein als *Valid* toont. Dat duurt meestal minuten,
   soms uren. Het certificaat regelt Vercel zelf.
5. Zet `SITE_URL=https://nubeslist.nl` in de omgevingsvariabelen.

**Af als:** `https://nubeslist.nl` de site toont met een geldig slotje, en
`www.nubeslist.nl` daarheen doorverwijst.

### Blok 2 — De techniek erachter (een dag)

6. Koppel de opslag. **Dit is de belangrijkste stap van allemaal**: zonder
   opslag is elk dossier weg bij de volgende deploy.

   In Vercel: *Storage → Create Database → Upstash for Redis* (Vercel KV
   bestaat niet meer als eigen product; het loopt sinds eind 2024 via Upstash
   in de Marketplace). Koppel hem aan het project. De integratie zet
   `KV_REST_API_URL` en `KV_REST_API_TOKEN` vanzelf in de omgeving, en dat is
   precies wat deze applicatie leest — je hoeft niets over te typen.

   **Kies een Europese regio** (Frankfurt of Amsterdam). Hier komen
   burgerservicenummers in te staan; die laat je niet zonder reden buiten de
   EU opslaan. Dit is achteraf niet te wijzigen zonder de database opnieuw aan
   te maken.

   **Kies Redis, geen Postgres.** In dezelfde lijst staan Neon, Supabase en
   andere Postgres-aanbieders. Die spreekt deze applicatie niet; er is alleen
   een Redis-driver. Het schema in `db/` ligt klaar voor een latere overstap,
   maar de code die het gebruikt is nog niet geschreven.

   Het gratis niveau is ruim voldoende om te beginnen. Zet wel meteen de
   back-up aan die Upstash biedt: dit is vanaf dat moment je enige kopie van
   alle dossiers.

7b. **Maak meteen de eerste beheerder aan.** Zolang er nog geen enkel account
   is, kan iedereen die `/beheer` opent er een aanmaken — dat is met opzet zo,
   want anders kom je er zelf nooit in, maar het betekent wel dat er een
   kort venster openstaat. Doe dit dus direct nadat de database werkt, en zet
   de tweede factor meteen op.
7. Zet `SESSIE_GEHEIM` op een lange willekeurige reeks.
8. Kies je tarief en zet `TARIEF_PERCENTAGE` of `TARIEF_VAST`. Zolang dit leeg
   is, noemt de site nergens een bedrag.
9. Vul de `BEDRIJF_*`-variabelen in. Die komen op de machtiging én in het blok
   "Achter nubeslist.nl" op elke campagnepagina. Let op: die pagina's worden
   bij de **build** geschreven, dus na het wijzigen van zo'n variabele moet je
   opnieuw deployen — anders staat de oude (lege) waarde er nog.
10. Richt de mailbox in en zet SPF, DKIM en DMARC (zie stap 4). Koppel de
    verzenddienst (`RESEND_API_KEY` of `POSTMARK_API_KEY`) en `MAIL_AFZENDER`.
11. **Haal `BEHEER_OPEN` weg.**

**Af als:** je een testdossier indient, het na een *Redeploy* nog steeds in
`/beheer` staat, en de inloglink in je echte mailbox aankomt — niet in de
spambox.

### Blok 3 — Inrichten en proefdraaien (een dag)

12. Maak de eerste beheerder aan op `/beheer` en zet tweestapsverificatie op.
    Bewaar de acht herstelcodes ergens buiten je telefoon.
13. Nodig je collega's uit met de rol die bij hun werk past.
14. Loop drie testdossiers van begin tot eind door: één waarbij de termijn nog
    loopt, één waarbij hij net verstreken is, en één bezwaarzaak. Upload bij
    elk de stukken, stel de brief op, bewaar hem in het dossier en handel af.
15. Controleer het klantportaal: link aanvragen, inloggen, stuk uploaden,
    nieuwe post uploaden.

**Af als:** je een dossier van upload tot uitbetaling hebt doorlopen zonder
ergens iets in de database met de hand te moeten aanpassen.

### Blok 4 — Het juridische deel (loopt parallel, duurt het langst)

16. De BSN-vraag bij een jurist. **Dit is de blokkade.** Mag een particuliere
    partij dit burgerservicenummer verwerken, en op welke grondslag? Begin
    hiermee in blok 1, niet in blok 4, want hier zit de doorlooptijd.
17. Privacyverklaring en algemene voorwaarden laten nakijken. Er staan concepten
    op `/privacy` en `/voorwaarden` die zeggen wat het systeem echt doet; die
    zijn een startpunt voor een jurist, geen eindproduct.
18. Verwerkersovereenkomsten met Vercel, de opslagpartij en de verzenddienst.
19. Verwerkingsregister (AVG art. 30) en bewaartermijnen.
20. KvK-inschrijving rond, en de bevestiging van UWV over de digitale
    handtekening aanvragen.

**Af als:** de lijst in stap 9 van dit document helemaal afgevinkt is.

### En dan pas adverteren

De campagnepagina's staan klaar (`/uwv-wia`, `/bijstand`, `/wmo` en vijftien
andere), maar zet er geen budget op voordat blok 4 af is. Eén klacht bij de
Autoriteit Persoonsgegevens over een burgerservicenummer zonder grondslag kost
meer dan de hele bouw.

Begin daarna klein: één campagnepagina, een klein budget, en kijk of de
dossiers die binnenkomen ook echt afgehandeld kunnen worden. Tien zaken goed
afhandelen leert je meer dan honderd die blijven liggen.
