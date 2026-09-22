# Live zetten op Vercel

Twee fasen: eerst een **testdeploy** om alles te bekijken (vijf minuten, één
instelling), later de **database en het eigen domein** voor echt gebruik.

---

## Nu: testdeploy

### 1. Project aanmaken

1. Ga naar [vercel.com/new](https://vercel.com/new) en importeer de repository
   `zahirk100/Dwangsom`.
2. Framework preset: **Other**. Build command, output directory en install
   command laat je leeg — die staan al in `vercel.json`.
3. Vouw **Environment Variables** open en voeg toe:

   | Name | Value |
   | --- | --- |
   | `SESSIE_GEHEIM` | een willekeurige reeks van 32 tekens |

   Wil je tijdens het testen helemaal niet inloggen, zet dan in plaats daarvan
   `BEHEER_OPEN` op `1`. De beheeromgeving is dan met één klik bereikbaar en
   waarschuwt bovenin dat ze niet is afgeschermd. **Haal die variabele weg
   voordat er echte aanvragen binnenkomen**; dan geldt het wachtwoord weer.

   Dit is de enige instelling die je nu nodig hebt. Zonder die variabele kun
   je niet inloggen op `/beheer`; de pagina legt dan zelf uit wat er moet
   gebeuren, maar je kunt hem dus net zo goed meteen invullen.

4. Klik op **Deploy**. Je krijgt een URL als `https://dwangsom-xxx.vercel.app`.

### Zie je de repository niet in de lijst?

Dat is bijna altijd de toegangsinstelling van de Vercel-app op GitHub: bij het
koppelen kun je kiezen tussen *All repositories* en *Only select repositories*,
en bij die tweede keuze staat `Dwangsom` er niet bij. De repository zelf is in
orde en publiek. Loop dit af:

1. **Zoek eerst gewoon.** De lijst op vercel.com/new toont maar een handvol
   repositories. Typ `Dwangsom` in het zoekveld erboven.
2. **Klopt het account?** Links bovenin staat onder welk account of team je
   werkt. De repository hoort bij het GitHub-account **zahirk100**; kies dat
   account, niet een team.
3. **Geef de Vercel-app toegang.** Onder de lijst staat een link als
   *Adjust GitHub App Permissions* of *Configure GitHub App*. Kan je die niet
   vinden, ga dan op GitHub naar
   **Settings → Applications → Installed GitHub Apps → Vercel → Configure**.
   Kies daar bij *Repository access* voor **All repositories**, of voor
   *Only select repositories* met `Dwangsom` erbij, en sla op. Terug in Vercel
   staat hij er meteen tussen (eventueel na verversen).
4. **Nog steeds niet?** Dan is GitHub waarschijnlijk niet gekoppeld aan je
   Vercel-account: *Account Settings → Authentication → GitHub → Connect*.

### Plan B: deployen vanaf je eigen computer

Werkt de koppeling niet, dan kun je er helemaal omheen. Je hebt alleen Node
nodig:

```bash
git clone https://github.com/zahirk100/Dwangsom.git
cd Dwangsom
npx vercel login
npx vercel --prod
```

De CLI stelt een paar vragen (project aanmaken, naam bevestigen) en geeft daarna
de URL. Omgevingsvariabelen zet je erbij met:

```bash
npx vercel env add SESSIE_GEHEIM production
```

Deze route heeft geen GitHub-koppeling nodig, maar deployt ook niet
automatisch bij een nieuwe commit; je draait dan zelf `npx vercel --prod`.

### 2. Controleer welke branch Vercel bouwt

De code staat op twee branches met exact dezelfde inhoud: `main` en de
werkbranch `claude/dwangsom-aanvraag-app-25bcb1`. Je hoeft dus niets te mergen,
maar Vercel bouwt standaard de *default branch* van de repository, en die staat
op GitHub nog op de werkbranch. Kies één van beide:

- **In Vercel** (snelst): *Settings → Git → Production Branch* op `main` zetten
  en opnieuw deployen; of
- **Op GitHub**: *Settings → General → Default branch* omzetten naar `main`.

Doe je geen van beide, dan werkt de site ook gewoon — hij wordt dan alleen
vanaf de werkbranch gebouwd.

### "Invalid export found in module server.mjs"

Vercel laadt `server.js` zelf en haalt de applicatie uit de **default export**.
Ontbreekt die, dan weigert de runtime de hele module en faalt elk verzoek — ook
dat naar de startpagina, met `500 FUNCTION_INVOCATION_FAILED`. `server.js`
exporteert daarom onderaan een handler als default. Een test bewaakt dat.

### Krijg je "500 FUNCTION_INVOCATION_FAILED"?

Dat betekent dat de serverloze functie niet opstartte. Het project gebruikt nu
de standaardopzet van Vercel zonder bouwstap: `public/` is de statische map,
`api/` bevat de functies, en `vercel.json` regelt alleen `cleanUrls` en de
rewrite van `/api/*`. Blijft de fout staan, zoek dan gericht:

1. **Controleer de projectinstellingen.** *Settings → Build and Deployment*:
   Build Command, Output Directory en Install Command horen allemaal op de
   standaardwaarde te staan, zonder override. Er is geen bouwstap nodig.
2. **Open `/statisch.txt`.** Zie je tekst, dan werkt de statische hosting.
   Krijg je een fout of 404, dan wordt `public/` niet als statische map
   gebruikt en zit het in de Output Directory.
3. **Open `/api/ping`.** Dat bestand heeft geen enkele import en kan dus niet
   falen door de applicatie. Het toont de Node-versie, de omgevingsvariabelen
   en laadt daarna elke module los van elkaar, met per module `ok` of `FOUT`.
   Faalt ook `/api/ping`, dan start geen enkele functie op en ligt het aan het
   project, niet aan de code.
4. De volledige stacktrace staat in Vercel onder het tabblad **Logs** van de
   deployment (of *Observability → Runtime Logs*).

`api/ping.js` en `public/statisch.txt` mogen weg zodra de site draait.

### 3. Uitproberen

Download eerst een paar voorbeeldbrieven uit de map `voorbeelden/` in de
repository; daarmee loop je de funnel in een minuut door. `uwv-wia-...pdf`
geeft "UWV lijkt te laat", `uwv-verlenging-...pdf` schuift de datum op en
`uwv-beslissing-genomen.pdf` laat zien dat de procedure stopt.

- `/` — de landingspagina
- `/aanvraag` — de wizard; vul bijvoorbeeld een WIA-aanvraag van acht maanden
  geleden in met een ingebrekestelling, en je ziet € 1.442 uitgerekend worden
- `/beheer` — de eerste keer maak je hier je beheerdersaccount aan

### Wat in deze testfase nog niet werkt

**Ingediende aanvragen worden niet bewaard.** Vercel draait serverloos: er is
geen schijf die blijft bestaan. Zonder database staat een testaanvraag in het
werkgeheugen van één instantie. Gevolg:

- een zojuist ingediende aanvraag verschijnt meestal wél in `/beheer`, maar
  soms niet — dan heeft een andere instantie het verzoek afgehandeld;
- na een nieuwe deploy of na een tijdje niets doen is alles weg.

De beheeromgeving toont daarom een rode waarschuwing. Voor rondkijken en
uitproberen is dat prima. **Zet geen echte klanten op deze URL** tot stap 4
hieronder is gedaan.

Alles wat vóór het indienen gebeurt — de wizard, de berekening, de tijdlijn,
de conceptbrief — werkt in de testfase volledig, want daar komt geen opslag
aan te pas.

---

## Later: klaar voor echte klanten

> **Let op:** onderstaande stappen brengen de testopstelling verder. Het
> volledige draaiboek voor de livegang staat in
> [docs/livegang.md](docs/livegang.md): domein en DNS, alle
> omgevingsvariabelen, hoe je de eerste beheerder aanmaakt, en de AVG-punten die
> af moeten. Ga je echte klanten binnenhalen, lees dan dat document eerst.

### 4. Database koppelen

1. Open in Vercel het tabblad **Storage → Create Database**.
2. Kies **Upstash for Redis**; het gratis instapniveau is ruim voldoende voor
   een aanvraagformulier. Kies een regio in de EU.
3. Koppel de database aan dit project. Vercel zet dan automatisch
   `KV_REST_API_URL` en `KV_REST_API_TOKEN` in de omgeving.
4. Deploy opnieuw (**Deployments → Redeploy**).

De applicatie herkent ook `UPSTASH_REDIS_REST_URL` en
`UPSTASH_REDIS_REST_TOKEN` als je de database rechtstreeks bij Upstash
aanmaakt. Verder hoef je niets te wijzigen: de juiste opslag wordt automatisch
gekozen.

Controleer daarna dit lijstje:

- [ ] dien een testaanvraag in
- [ ] de aanvraag staat in `/beheer`
- [ ] er staat **geen** rode waarschuwing meer boven het overzicht
- [ ] klik op **Redeploy** en ververs `/beheer`: de aanvraag staat er nog

Dat laatste punt is het echte bewijs dat de opslag werkt.

### 5. Nog aan te bevelen instellingen

| Naam | Waarde | Waarom |
| --- | --- | --- |
| `SESSIE_GEHEIM` | willekeurige reeks van 32+ tekens | dan blijven beheerders ingelogd als je het beheerwachtwoord wijzigt |
| `BEDRIJF_NAAM` | je bedrijfsnaam | komt op de machtiging te staan |
| `BEDRIJF_ADRES` · `BEDRIJF_POSTCODE_PLAATS` | je vestigingsadres | idem |
| `BEDRIJF_KVK` · `BEDRIJF_EMAIL` · `BEDRIJF_TELEFOON` | je KvK-nummer en contactgegevens | idem; wat leeg blijft wordt een invulregel |
| `FUNNEL` | `klassiek` | alleen nodig als je terug wilt naar de oude vragenwizard op `/aanvraag` |

Zo'n geheim maak je met:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### 6. Eigen domein

*Settings → Domains* in Vercel, daarna de DNS-records bij je domeinprovider
zetten. Verder niets nodig: de applicatie gebruikt geen vaste URL's.

### 7. Wat er nog niet in zit

- **Geen e-mailnotificatie.** Een nieuwe aanvraag verschijnt in `/beheer`, maar
  er gaat geen mail uit — naar jullie niet en naar de aanvrager niet. Iemand
  moet dus in de beheeromgeving kijken.
- **Eén gedeeld beheerwachtwoord.** Voor meerdere medewerkers wil je aparte
  accounts met tweefactorauthenticatie. Controleer ook dat `BEHEER_OPEN` weg is.
- **Privacy.** Er worden persoonsgegevens verwerkt: regel een
  privacyverklaring, verwerkersovereenkomsten met Vercel en Upstash, een
  bewaartermijn en een back-up.
- **De standaardtermijnen** in `shared/catalogus.js` juridisch laten toetsen;
  zie het voorbehoud in README.md.

---

## Lokaal draaien

Zoals Vercel het doet:

```bash
npx vercel dev
```

Of gewoon als server, dan gebruikt de applicatie een JSON-bestand op schijf en
is er geen database nodig:

```bash
SESSIE_GEHEIM=een-lang-geheim node server.js
```

## Zonder Vercel hosten

Op een server met een eigen schijf (Railway, Render, een VPS, Docker) werkt het
zonder database: `node server.js` met `DATA_DIR` op een map die blijft bestaan.
