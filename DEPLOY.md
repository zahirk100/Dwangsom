# Live zetten op Vercel

Ongeveer tien minuten werk. Je hebt een Vercel-account nodig dat aan GitHub is
gekoppeld.

## 1. Zet de juiste branch klaar

De code staat op branch `claude/dwangsom-aanvraag-app-25bcb1`. Vercel bouwt
standaard de **production branch** van de repository (meestal `main`). Kies één
van deze twee:

- merge de branch naar `main` en deploy `main`; of
- laat de branch staan en zet hem in Vercel onder
  *Settings → Git → Production Branch* als productiebranch.

Zolang dat niet klopt, deployt Vercel een lege of oude repository.

## 2. Project aanmaken

1. Ga naar [vercel.com/new](https://vercel.com/new) en importeer de repository
   `zahirk100/Dwangsom`.
2. Framework preset: **Other**. Build command, output directory en install
   command hoef je niet in te vullen: die staan al in `vercel.json`.
3. Klik nog **niet** op Deploy — eerst de twee stappen hieronder.

## 3. Database koppelen (verplicht)

Vercel draait serverloos: er is geen schijf die blijft bestaan. Zonder database
verdwijnt elke ingediende aanvraag zodra de functie afkoelt. De beheeromgeving
toont dan een rode waarschuwing, en die moet weg zijn voordat je klanten
doorstuurt.

1. Open in Vercel het tabblad **Storage → Create Database**.
2. Kies **Upstash for Redis** (marketplace, gratis instapniveau is ruim genoeg
   voor een aanvraagformulier).
3. Koppel de database aan dit project. Vercel zet dan automatisch
   `KV_REST_API_URL` en `KV_REST_API_TOKEN` in de omgeving.

De applicatie herkent ook `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
als je de database rechtstreeks bij Upstash aanmaakt.

## 4. Omgevingsvariabelen instellen

Onder *Settings → Environment Variables*:

| Naam | Waarde | Nodig |
| --- | --- | --- |
| `BEHEER_WACHTWOORD` | een sterk, uniek wachtwoord | ja — anders krijgt elke deploy een nieuw, willekeurig wachtwoord dat alleen in het buildlog staat |
| `SESSIE_GEHEIM` | een willekeurige reeks van 32+ tekens | aanbevolen — dan blijven beheerders ingelogd als je het wachtwoord wijzigt |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | door de database-koppeling gezet | ja |

Zet ze voor **Production** (en desgewenst Preview). Een goed geheim maak je met:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## 5. Deployen en controleren

Klik op **Deploy**. Je krijgt een URL als `https://dwangsom.vercel.app`.
Loop daarna dit lijstje langs:

- [ ] `/` — de landingspagina laadt
- [ ] `/aanvraag` — de wizard rekent mee en toont een bedrag
- [ ] een testaanvraag indienen geeft een referentienummer
- [ ] `/beheer` — inloggen met `BEHEER_WACHTWOORD` lukt
- [ ] de testaanvraag staat in het overzicht
- [ ] er staat **geen** rode waarschuwing over opslag boven het overzicht
- [ ] opnieuw deployen en dan `/beheer` verversen: de aanvraag staat er nog

Die laatste twee punten zijn de echte test: ze bewijzen dat de database werkt.

## Wat er nog geregeld moet worden vóór echte klanten

Dit is een complete, werkende applicatie, maar een paar dingen zitten er
bewust nog niet in:

- **Geen e-mailnotificatie.** Een nieuwe aanvraag verschijnt in `/beheer`, maar
  er gaat geen mail uit — naar jullie niet en naar de aanvrager niet. Dat is
  losjes toe te voegen met een maildienst.
- **Eén gedeeld beheerwachtwoord.** Voor meerdere medewerkers wil je aparte
  accounts met tweefactorauthenticatie.
- **Privacy.** Er worden persoonsgegevens verwerkt. Regel een privacyverklaring,
  een verwerkersovereenkomst met Vercel en Upstash, een bewaartermijn en een
  back-up. Kies bij het aanmaken van de database een regio in de EU.
- **Eigen domein.** In te stellen onder *Settings → Domains*.
- **De standaardtermijnen** in `shared/catalogus.js` juridisch laten toetsen;
  zie het voorbehoud in README.md.

## Lokaal draaien zoals Vercel het doet

```bash
npx vercel dev
```

Of gewoon zonder Vercel, dan gebruikt de applicatie een JSON-bestand op schijf:

```bash
BEHEER_WACHTWOORD=geheim node server.js
```

## Zonder Vercel hosten

Op een server met een eigen schijf (Railway, Render, een VPS, Docker) werkt het
zonder database: `node server.js` met `DATA_DIR` op een map die blijft bestaan.
De applicatie kiest zelf de juiste opslag — is er een Redis geconfigureerd, dan
gebruikt hij die; anders het bestand.
