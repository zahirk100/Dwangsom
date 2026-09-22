# Livegang: domein, database, portaal en accounts

Dit is het ontwerp voor de stap van testomgeving naar een applicatie waar echte
klanten met echte persoonsgegevens in zitten. Het beschrijft vier dingen:

1. het domein en de hosting
2. de keuze van de database, met de afwegingen erbij
3. de volledige databasestructuur
4. de loginopbouw voor twee doelgroepen: de aanvrager en de medewerker

Aan het eind staat een volgorde van aanpak en wat er juridisch geregeld moet zijn
vóórdat de eerste echte klant binnenkomt.

---

## 1. Waar we nu staan

Wat er staat werkt, maar is gebouwd voor een testomgeving:

| Nu | Straks |
| --- | --- |
| Dossiers als JSON-blobs in een bestand of in Redis | Relationele tabellen in Postgres |
| Eén gedeeld beheerwachtwoord | Accounts per medewerker, met tweefactor |
| Geen klantomgeving; de klant ziet zijn dossier nooit meer terug | Portaal met tijdlijn en eigen gegevens |
| Alleen de uitgelezen tekst van de brief wordt bewaard | Het originele bestand blijft bewaard |
| Geen e-mail | Magic link, statusberichten, interne meldingen |
| Geen logboek van wie wat inzag | Auditlog, nodig omdat er BSN in zit |

De opslaglaag (`src/opslag.js`) is al verwisselbaar, maar slaat hele dossiers op
als één document. Dat is precies het verschil met wat nu nodig is: een werklijst
op datum, filteren op behandelaar, rapportage over toegekende bedragen en een
klant die alleen zijn eigen dossier mag zien. Dat zijn allemaal zoekvragen over
rijen, geen documenten ophalen op sleutel. **De stap naar Postgres is daarom een
herschrijving van `src/store.js`, niet het toevoegen van nog een driver.**

---

## 2. Domeinnaam

### Waar kopen

`nubeslist.nl` kan bij GoDaddy, dat werkt gewoon. Twee dingen om te weten:

- **.nl loopt altijd via SIDN**, welke registrar je ook kiest. De registrar is
  alleen de verkoper. Een Nederlandse registrar (TransIP, Versio, Antagonist,
  Hostnet, Realtime Register) is voor .nl meestal goedkoper en heeft minder
  opties die je niet wilt aanvinken. GoDaddy staat erom bekend dat het eerste
  jaar goedkoop is en de verlenging fors duurder.
- **Whois-privacy werkt anders bij .nl.** Registreer je als privépersoon, dan
  verbergt SIDN je gegevens standaard. Registreer je op de KvK-inschrijving, dan
  zijn bedrijfsnaam en adres openbaar. Dat laatste hoort ook zo voor een
  dienstverlener, maar weet dat je thuisadres erin komt als je bedrijf daar staat
  ingeschreven.

Advies: waar je koopt maakt technisch niets uit. Koop hem waar je hem makkelijk
beheert en let op de verlengprijs. Zet **auto-renew aan**; een vergeten
verlenging haalt je site en je e-mail tegelijk offline.

### DNS naar Vercel

Twee manieren, kies er één:

**A. Nameservers naar Vercel (makkelijkst).** In Vercel: *Settings → Domains →
Add*. Vercel geeft twee nameservers. Die zet je bij GoDaddy onder *Nameservers →
Change → I'll use my own*. Vanaf dan beheer je alle DNS in Vercel, inclusief de
records voor je e-mail.

**B. Records bij GoDaddy laten staan.** Dan voeg je bij GoDaddy toe wat Vercel je
opgeeft: een `A`-record voor de apex (`nubeslist.nl`) en een `CNAME` voor `www`
naar `cname.vercel-dns.com`. **Neem de exacte waarden over uit het
Vercel-scherm**, want die kunnen wijzigen; schrijf ze niet uit dit document over.

Kies daarna in Vercel welke variant de hoofdvorm is. Advies: `nubeslist.nl` als
hoofdvorm en `www.nubeslist.nl` doorverwijzen. Dat is korter in advertenties en
het scheelt gedoe met cookies. Vercel regelt het TLS-certificaat zelf.

### E-mail bij het domein

Een domein kopen geeft je nog geen mailbox. Regel dit apart, en doe het **voordat
je gaat adverteren**, want een nieuw domein dat ineens mail gaat versturen komt
zonder onderstaande records in de spambox:

| Record | Waarvoor |
| --- | --- |
| `MX` | waar inkomende mail heen gaat (Google Workspace, Microsoft 365, of een Nederlandse aanbieder) |
| `SPF` (`TXT`) | welke servers namens `nubeslist.nl` mogen versturen |
| `DKIM` (`TXT`) | handtekening waarmee de ontvanger controleert dat de mail echt van jou komt |
| `DMARC` (`TXT`) | wat de ontvanger moet doen als SPF of DKIM niet klopt |

Let op: je hebt **twee** verzenders die allebei in SPF en DKIM moeten staan: je
gewone mailbox (waar klanten naartoe antwoorden) en de dienst die de
automatische mail verstuurt (magic links, statusberichten). Zie §9.

Begin DMARC op `p=none` met een rapportadres, kijk een paar weken mee, en zet hem
daarna pas op `p=quarantine` of `p=reject`.

---

## 3. Hosting

Blijf op Vercel, maar met één belangrijke aantekening:

> **Het Hobby-plan van Vercel is alleen voor niet-commercieel gebruik.** Zodra
> nubeslist.nl geld verdient, moet je naar Pro. Dat is geen technische maar een
> voorwaardelijke kwestie; Vercel kan een commercieel project op Hobby stopzetten.

Pro geeft bovendien wat je hier toch nodig hebt: langere functieduur, meer
bandbreedte, en logboeken die verder teruggaan dan een uur.

---

## 4. Welke database?

### De eisen

1. **Relationeel.** Werklijst op datum, filters, rapportage over bedragen.
2. **Rijbeveiliging.** De aanvrager mag precies één dossier zien: het zijne. Dat
   wil je afdwingen in de database, niet alleen in je eigen code, want één
   vergeten `where`-clausule lekt andermans BSN.
3. **Authenticatie.** Twee doelgroepen, magic links, wachtwoorden, tweefactor.
4. **Bestandsopslag.** De originele brief, de getekende machtiging, de
   verstuurde brieven.
5. **EU-regio en een verwerkersovereenkomst.** Er zit BSN in.
6. **Werkt vanuit een serverloze functie**, dus over HTTP of via een pooler; een
   klassieke verbindingspool per proces kan niet.

### De opties

| | Postgres | Auth erbij | Bestandsopslag | Rijbeveiliging | EU-regio |
| --- | --- | --- | --- | --- | --- |
| **Supabase** | ja | ja (GoTrue) | ja | ja (RLS) | ja |
| **Neon** | ja | nee | nee | ja (RLS, zelf regelen) | ja |
| **Vercel Postgres** | ja (Neon eronder) | nee | Vercel Blob apart | ja (RLS, zelf regelen) | ja |
| **PlanetScale** | nee (MySQL) | nee | nee | nee | ja |
| **Firebase** | nee (documenten) | ja | ja | ja (eigen regels) | beperkt |
| **Eigen Postgres** (Hetzner e.d.) | ja | nee | nee | ja | ja |

### Advies: Supabase

**Ja, Supabase is hier geschikt**, en om meer dan één reden:

- Het is gewoon Postgres. Geen eigenaardig datamodel, geen vendor-dialect. Loop
  je er ooit uit, dan is het een `pg_dump` naar een andere Postgres.
- **Row Level Security** is precies het gereedschap voor "de klant ziet alleen
  zijn eigen dossier". Het staat in de database, dus ook een fout in je eigen
  code lekt niets.
- **Auth zit erin.** Magic links, wachtwoorden, TOTP-tweefactor, uitnodigingen,
  wachtwoordherstel, snelheidsbegrenzing. Dat zelf bouwen is weken werk op de
  plek waar een fout het duurst is.
- **Storage zit erin**, met dezelfde rijbeveiliging eroverheen. Daarmee is
  eindelijk op te lossen dat we nu alleen de uitgelezen tekst bewaren en niet het
  originele bestand.
- **EU-regio** (bijvoorbeeld Frankfurt) en een verwerkersovereenkomst zijn
  beschikbaar.

### Wat je erbij moet weten

- **Kies de regio bij het aanmaken.** Een project verhuizen naar een andere regio
  kan later niet zomaar. Kies EU.
- **Dit kost je de nul-afhankelijkhedenregel, deels.** De data-laag kan over
  PostgREST met gewone `fetch`, precies zoals de Upstash-driver nu werkt. Maar
  voor auth adviseer ik `@supabase/supabase-js` te gebruiken en niet zelf
  JWT's te gaan verifiëren. Authenticatiecrypto is niet de plek om een
  afhankelijkheid uit te sparen.
- **De service-role-sleutel is een hoofdsleutel.** Die omzeilt alle RLS. Hij mag
  uitsluitend server-side staan, nooit in iets wat de browser kan zien, en nooit
  in de repository.
- **Zet publieke registratie uit.** Anders maakt iedereen een account aan.
  Medewerkers komen er alleen in op uitnodiging.

### Wanneer je iets anders zou kiezen

- Wil je écht geen enkele afhankelijkheid en geen kant-en-klare auth: **Neon of
  Vercel Postgres**, en zelf sessies bouwen op wat er al staat in
  `src/sessie.js`. Reken op aanzienlijk meer werk en meer risico.
- Heb je straks tienduizenden dossiers en wordt Supabase een kostenpost: dan is
  **eigen Postgres** goedkoper, maar dan doe je back-ups, updates en
  beschikbaarheid zelf. Dat is een probleem voor later, niet voor nu.

---

## 5. De databasestructuur

Onderstaand schema is compleet: alles wat de applicatie nu doet plus het
portaal, de accounts en het auditspoor. Het is Postgres-DDL en draait zoals het
er staat in de SQL-editor van Supabase.

### Opsommingen

```sql
create type medewerkerrol as enum ('beheerder', 'behandelaar', 'lezer');

create type dossiersoort as enum ('aanvraag', 'vooraanmelding', 'beoordeling');

create type dossierstatus as enum (
  'nieuw', 'in-behandeling', 'stukken-opgevraagd', 'ingebrekestelling-verstuurd',
  'dwangsom-geclaimd', 'toegekend', 'afgewezen', 'afgesloten'
);

create type documentsoort as enum (
  'brief-aanvrager', 'verlengbrief', 'machtiging', 'ingebrekestelling',
  'claim', 'besluit', 'beschikking', 'overig'
);

create type gebeurtenissoort as enum (
  'aangemaakt', 'gegevens-bijgewerkt', 'stap-vastgelegd', 'status-gewijzigd',
  'document-toegevoegd', 'bericht-verstuurd', 'afgehandeld'
);
```

### Mensen

`auth.users` is van Supabase zelf; daar raak je niets aan. Daarnaast:

```sql
-- Eén rij per ingelogde gebruiker, of dat nu een klant of een medewerker is.
create table profielen (
  id           uuid primary key references auth.users on delete cascade,
  email        text not null,
  naam         text,
  telefoon     text,
  aangemaakt_op timestamptz not null default now()
);

-- Alleen wie hierin staat is medewerker. Niet in deze tabel = klant.
create table medewerkers (
  profiel_id   uuid primary key references profielen on delete cascade,
  rol          medewerkerrol not null default 'behandelaar',
  actief       boolean not null default true,
  aangemaakt_op timestamptz not null default now()
);
```

De rollen:

| Rol | Mag |
| --- | --- |
| `beheerder` | alles, plus medewerkers uitnodigen en verwijderen |
| `behandelaar` | dossiers behandelen, brieven maken, afhandelen |
| `lezer` | meekijken en exporteren, niets wijzigen (boekhouder, stagiair) |

### De aanvrager

Bewust los van `profielen`: de funnel maakt een dossier aan **voordat** iemand
een account heeft. Dat is precies de lage drempel die we willen houden.

```sql
create table aanvragers (
  id             uuid primary key default gen_random_uuid(),
  -- Pas gevuld zodra de klant op de magic link klikt.
  profiel_id     uuid unique references profielen on delete set null,
  naam           text not null,
  email          text not null,
  telefoon       text,
  adres          text,
  postcode       text,
  woonplaats     text,
  geboortedatum  date,
  bsn            text,     -- zie de opmerking over versleuteling hieronder
  iban           text,
  aangemaakt_op  timestamptz not null default now(),
  gewijzigd_op   timestamptz not null default now()
);

create index on aanvragers (lower(email));
```

### Het dossier

```sql
create table dossiers (
  id             uuid primary key default gen_random_uuid(),
  referentie     text not null unique,          -- DWS-2026-0001
  aanvrager_id   uuid not null references aanvragers on delete restrict,
  behandelaar_id uuid references medewerkers (profiel_id) on delete set null,

  soort          dossiersoort not null default 'beoordeling',
  status         dossierstatus not null default 'nieuw',

  -- De zaak zelf. Dit is één op één de huidige `invoer`.
  bestuursorgaan          text not null,
  zaaktype                text not null,
  organisatienaam         text,
  kenmerk                 text,
  basisdatum              date not null,
  termijn_bekend          boolean not null default false,
  termijn_einddatum       date,
  verdaagd                boolean not null default false,
  verdaging_einddatum     date,
  opschorting_dagen       integer not null default 0,
  ingebreke_gesteld       boolean not null default false,
  ingebrekestelling_datum date,
  ingebrekestelling_door_ons boolean not null default false,
  besluit_genomen         boolean not null default false,
  besluit_datum           date,
  bijzonder               text,                 -- woo, asiel, geen-belanghebbende

  -- De uitkomst van de rekenkern. Afgeleid, dus jsonb is hier prima: er wordt
  -- nooit op gezocht, alleen op getoond. De waarheid staat in de kolommen
  -- hierboven en wordt bij elke wijziging opnieuw doorgerekend.
  rapport        jsonb,

  -- Waar de werklijst op draait.
  actiedatum     date,
  actie_label    text,

  aangemaakt_op  timestamptz not null default now(),
  gewijzigd_op   timestamptz not null default now()
);

-- De werklijst: openstaande dossiers waarvan de datum is bereikt, oudste eerst.
create index dossiers_werklijst
  on dossiers (actiedatum)
  where status not in ('toegekend', 'afgewezen', 'afgesloten');

create index on dossiers (aanvrager_id);
create index on dossiers (status);
create index on dossiers (behandelaar_id);
```

### Documenten

```sql
create table documenten (
  id            uuid primary key default gen_random_uuid(),
  dossier_id    uuid not null references dossiers on delete cascade,
  soort         documentsoort not null,
  bestandsnaam  text not null,
  opslagpad     text not null,     -- pad in de Supabase-bucket 'dossiers'
  mimetype      text,
  bytes         integer,
  tekst         text,              -- de uitgelezen tekst, voor de herkenning
  -- Interne stukken hoeft de klant niet te zien; zijn eigen brief wel.
  zichtbaar_voor_klant boolean not null default false,
  toegevoegd_door uuid references profielen on delete set null,
  aangemaakt_op timestamptz not null default now()
);

create index on documenten (dossier_id, soort);
```

De bestanden zelf gaan naar Supabase Storage, in een **private** bucket
`dossiers`, met het pad `<dossier_id>/<document_id>-<bestandsnaam>`. Downloaden
gaat via een ondertekende URL met een korte geldigheid, nooit via een publieke
link.

### De tijdlijn

Eén tabel voor twee doelen. De klant ziet de regels met
`zichtbaar_voor_klant = true`, de behandelaar ziet alles. Dat voorkomt dat je
twee logboeken uit elkaar laat lopen.

```sql
create table gebeurtenissen (
  id            bigint generated always as identity primary key,
  dossier_id    uuid not null references dossiers on delete cascade,
  soort         gebeurtenissoort not null,
  tekst         text not null,
  door_profiel_id uuid references profielen on delete set null,
  door_systeem  boolean not null default false,
  zichtbaar_voor_klant boolean not null default false,
  aangemaakt_op timestamptz not null default now()
);

create index on gebeurtenissen (dossier_id, aangemaakt_op desc);
```

### Interne notities

Apart van de tijdlijn, want hier staat wat de klant **nooit** mag lezen.

```sql
create table notities (
  id            bigint generated always as identity primary key,
  dossier_id    uuid not null references dossiers on delete cascade,
  tekst         text not null,
  door_profiel_id uuid references profielen on delete set null,
  aangemaakt_op timestamptz not null default now()
);
```

### Machtiging en afhandeling

```sql
create table machtigingen (
  dossier_id      uuid primary key references dossiers on delete cascade,
  digitaal        boolean not null default false,
  ondertekend_op  timestamptz,
  handtekening_pad text,           -- de afbeelding in Storage
  -- Bewijs dat de handtekening bij deze persoon hoort.
  ip              inet,
  user_agent      text,
  verstuurd_op    timestamptz,
  ontvangen_op    timestamptz
);

create table afhandelingen (
  dossier_id      uuid primary key references dossiers on delete cascade,
  bedrag_toegekend numeric(10,2),
  beschikking_op  date,
  uitbetaald_op   date,
  toelichting     text,
  vastgelegd_door uuid references profielen on delete set null,
  vastgelegd_op   timestamptz not null default now()
);
```

### Auditspoor en verstuurde mail

```sql
-- Verplicht zodra er BSN in de database staat: wie keek wanneer waarnaar.
create table auditlog (
  id            bigint generated always as identity primary key,
  profiel_id    uuid references profielen on delete set null,
  actie         text not null,          -- 'dossier-geopend', 'bsn-getoond', ...
  dossier_id    uuid,
  ip            inet,
  aangemaakt_op timestamptz not null default now()
);

create index on auditlog (dossier_id, aangemaakt_op desc);
create index on auditlog (profiel_id, aangemaakt_op desc);

create table berichten (
  id            bigint generated always as identity primary key,
  dossier_id    uuid references dossiers on delete cascade,
  aan           text not null,
  sjabloon      text not null,
  onderwerp     text,
  verzonden_op  timestamptz,
  provider_id   text,
  status        text,                   -- verzonden, gebounced, geopend
  aangemaakt_op timestamptz not null default now()
);
```

### Over het BSN

Het BSN is geen bijzonder persoonsgegeven in de zin van artikel 9 AVG, maar het
is wél een nationaal identificatienummer met een eigen regime. Behandel het
strenger dan de rest:

- **Versleutel het in de kolom**, met een sleutel die in de omgeving staat en
  niet in de database. Dan is een gelekte databasedump nog geen gelekt BSN.
  Versleutel in de applicatie, vóór het opslaan: dan staat de sleutel nergens
  waar de database bij kan.
- **Toon het gemaskeerd**, zoals nu al gebeurt (`•••••2333`). Volledig tonen is
  een aparte handeling die in `auditlog` terechtkomt.
- **Nooit in het klantportaal**, niet in e-mail, niet in de CSV-export.
- Zet in de bewaartermijn dat het BSN eerder wordt gewist dan de rest van het
  dossier: zodra de zaak is afgehandeld, is het niet meer nodig.

Of jullie het BSN mogen verwerken, is een juridische vraag die vóór livegang
beantwoord moet zijn. Zie §11.

---

## 6. Rijbeveiliging: wie ziet wat

Dit is het hart van de beveiliging. Zet RLS aan op **elke** tabel; een tabel
zonder policies is daarna dicht, en dat is de veilige kant om op te vallen.

```sql
alter table profielen      enable row level security;
alter table medewerkers    enable row level security;
alter table aanvragers     enable row level security;
alter table dossiers       enable row level security;
alter table documenten     enable row level security;
alter table gebeurtenissen enable row level security;
alter table notities       enable row level security;
alter table machtigingen   enable row level security;
alter table afhandelingen  enable row level security;
alter table auditlog       enable row level security;
alter table berichten      enable row level security;
```

### Twee hulpfuncties

```sql
-- Is de ingelogde gebruiker een actieve medewerker, mét tweefactor?
-- De aal2-eis staat hier bewust in: zonder tweede factor geen dossiers.
create or replace function public.is_medewerker()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and exists (
      select 1 from medewerkers m
      where m.profiel_id = auth.uid() and m.actief
    );
$$;

-- Welke aanvrager hoort bij de ingelogde klant?
create or replace function public.mijn_aanvrager_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.id from aanvragers a where a.profiel_id = auth.uid();
$$;
```

`set search_path = public` hoort er bij `security definer` altijd bij; zonder dat
kan iemand met rechten op zijn eigen schema de functie laten omvallen naar zijn
eigen tabellen.

### De policies

```sql
-- Dossiers: de klant precies één, de medewerker alles.
create policy "klant ziet eigen dossier" on dossiers for select
  using (aanvrager_id = public.mijn_aanvrager_id());

create policy "medewerker ziet alle dossiers" on dossiers for select
  using (public.is_medewerker());

-- Wijzigen doet alleen een medewerker, en een lezer niet.
create policy "behandelaar wijzigt dossiers" on dossiers for update
  using (
    public.is_medewerker()
    and exists (select 1 from medewerkers m
                where m.profiel_id = auth.uid() and m.rol <> 'lezer')
  );

-- Aanmaken gebeurt door de funnel, server-side met de service-sleutel.
-- Daarom staat hier bewust geen insert-policy: niemand met een gewone sessie
-- kan een dossier aanmaken.

-- Documenten: de klant alleen wat voor hem bestemd is.
create policy "klant ziet eigen documenten" on documenten for select
  using (
    zichtbaar_voor_klant
    and exists (select 1 from dossiers d
                where d.id = documenten.dossier_id
                  and d.aanvrager_id = public.mijn_aanvrager_id())
  );

create policy "medewerker ziet alle documenten" on documenten for all
  using (public.is_medewerker()) with check (public.is_medewerker());

-- Tijdlijn: dezelfde splitsing.
create policy "klant ziet eigen tijdlijn" on gebeurtenissen for select
  using (
    zichtbaar_voor_klant
    and exists (select 1 from dossiers d
                where d.id = gebeurtenissen.dossier_id
                  and d.aanvrager_id = public.mijn_aanvrager_id())
  );

create policy "medewerker ziet alle gebeurtenissen" on gebeurtenissen for all
  using (public.is_medewerker()) with check (public.is_medewerker());

-- Notities: uitsluitend intern. Geen klantpolicy, in geen enkele vorm.
create policy "alleen medewerkers bij notities" on notities for all
  using (public.is_medewerker()) with check (public.is_medewerker());

-- Aanvragers: de klant zijn eigen rij, en hij mag zijn contactgegevens
-- bijwerken. Niet zijn BSN of IBAN: die corrigeert een behandelaar.
create policy "klant ziet eigen gegevens" on aanvragers for select
  using (profiel_id = auth.uid());

create policy "medewerker ziet alle aanvragers" on aanvragers for all
  using (public.is_medewerker()) with check (public.is_medewerker());

-- Auditlog: alleen schrijven, en alleen een beheerder mag terugkijken.
create policy "beheerder leest auditlog" on auditlog for select
  using (exists (select 1 from medewerkers m
                 where m.profiel_id = auth.uid()
                   and m.rol = 'beheerder' and m.actief));
```

Voor de bucket `dossiers` in Storage geldt hetzelfde principe, met een policy op
`storage.objects` die het eerste paddeel (`<dossier_id>`) vergelijkt met wat de
gebruiker mag zien.

### De service-sleutel

De funnel blijft anoniem: iemand die zijn brief uploadt, heeft nog geen account.
Dat betekent dat het aanmaken van een dossier **server-side** gebeurt, in onze
eigen API-route, met de service-role-sleutel. Die sleutel:

- staat alleen in de omgevingsvariabelen van Vercel, nooit in de repository
- wordt alleen gebruikt in code die op de server draait
- wordt nooit teruggegeven in een antwoord aan de browser

Alles wat een ingelogde gebruiker doet, loopt juist **wel** via RLS, met zijn
eigen sessie. Dat is het verschil tussen "wij maken dit dossier aan" en "deze
persoon bekijkt dit dossier".

---

## 7. Loginopbouw

Twee doelgroepen met tegengestelde eisen. De klant wil zo min mogelijk drempel,
de medewerker moet juist door een streng hek.

### De aanvrager: magic link

Geen wachtwoord. De klant komt één keer per paar weken terug om te kijken hoe het
staat; een wachtwoord dat hij dan kwijt is, is alleen maar een obstakel.

```
Funnel afgerond
  → server maakt dossier aan (service-sleutel)
  → server maakt of vindt de auth-gebruiker op e-mailadres
  → server koppelt aanvragers.profiel_id
  → e-mail: "Je zaak staat klaar. Bekijk je dossier."  (magic link)
  → klik  → sessie  → /mijn
```

In het portaal op `/mijn`:

- de tijdlijn van zijn zaak (de regels met `zichtbaar_voor_klant`)
- wat wij nu doen en wat de volgende stap is
- welke gegevens nog ontbreken, met een veld om ze aan te vullen
- zijn eigen documenten downloaden
- contactgegevens wijzigen

Elke statusmail bevat opnieuw een magic link, zodat inloggen nooit een
handeling op zich wordt. Voor wie liever een wachtwoord instelt: dat kan, maar
het is niet verplicht.

> **DigiD kan niet.** Dat is voorbehouden aan organisaties met een publieke taak;
> een particuliere dienstverlener komt er niet op. De machtiging die de klant
> tekent is juist de route die dat vervangt.

### De medewerker: wachtwoord plus tweefactor

- **Alleen op uitnodiging.** Publieke registratie staat uit in Supabase. Een
  beheerder nodigt uit met `auth.admin.inviteUserByEmail`, waarna er een rij in
  `medewerkers` komt.
- **Tweefactor is verplicht**, niet optioneel. Dat is afgedwongen in
  `is_medewerker()`: zonder `aal2` in het token geeft elke policy nul rijen
  terug. Iemand die zijn tweede factor nog niet heeft ingesteld, komt dus wel
  binnen maar ziet een leeg scherm plus de instelwizard. Dat is precies de
  bedoeling: de beveiliging zit in de database, niet in een schermpje.
- **Sessies kort houden**, en na inactiviteit uitloggen. De beheeromgeving staat
  vol persoonsgegevens.
- **Elke geopende dossierpagina gaat het auditlog in.**

Dit vervangt `BEHEER_WACHTWOORD` en `BEHEER_OPEN`. Beide moeten weg zijn voordat
er echte klanten in zitten; `BEHEER_OPEN` zet de hele omgeving open.

### Sessies technisch

Supabase geeft een JWT plus een refresh-token. Zet die in **httpOnly-cookies**
(`@supabase/ssr` doet dit), niet in `localStorage`: een cookie die javascript
niet kan lezen, kan een cross-site-scriptfout ook niet stelen.

De bestaande HMAC-cookie uit `src/sessie.js` vervalt daarmee. Die was precies
goed voor één gedeeld wachtwoord, en precies ontoereikend voor accounts.

---

## 8. Wat dit betekent voor de huidige code

| Bestand | Wat ermee gebeurt |
| --- | --- |
| `public/shared/dwangsom.js` | **blijft**, ongewijzigd. De rekenkern is de kroonjuwelen en staat los van opslag. |
| `public/shared/catalogus.js`, `dossier.js`, `campagnes.js` | **blijven** |
| `public/assets/funnel.js` | blijft; alleen het slotscherm krijgt "bekijk je dossier" erbij |
| `src/store.js` | **herschrijven** naar queries op de tabellen hierboven |
| `src/opslag.js` | vervalt, of houdt alleen `GeheugenOpslag` voor de tests |
| `src/sessie.js` | vervalt, vervangen door Supabase-sessies |
| `server.js` | routes blijven, autorisatie per route erbij |
| `public/beheer.html` + `beheer.js` | blijven qua schermen, krijgen inlog met accounts |
| **nieuw** | `public/mijn.html` + `mijn.js`: het klantportaal |
| **nieuw** | `src/db.js`: de queries op één plek |
| **nieuw** | `src/mail.js`: de sjablonen en het versturen |

De tests zijn hierbij je vangnet: 168 stuks, waarvan de rekenkern en de
dossierregels geen database nodig hebben. Die blijven gewoon draaien. Voor de
tests die nu tegen `BestandsOpslag` aanlopen, is de nette route een Supabase-
project voor test naast dat voor productie.

---

## 9. E-mail

Twee soorten, en ze horen niet door dezelfde brievenbus:

**Transactioneel** (magic links, statusberichten) gaat via een verzenddienst:
Postmark, Resend, Mailgun of een Nederlandse partij. Let op de EU-regio en de
verwerkersovereenkomst.

> De ingebouwde mail van Supabase is er om te ontwikkelen, niet om mee te
> draaien: hij is zwaar begrensd en verstuurt vanaf een gedeeld domein. Zet
> **custom SMTP** aan voordat de eerste klant binnenkomt, anders komen je magic
> links niet aan.

**Gewone mail** (klant mailt terug) gaat naar je mailbox bij Google Workspace,
Microsoft 365 of een Nederlandse aanbieder.

Beide verzenders in SPF en DKIM zetten. Zie §2.

De berichten die je minimaal nodig hebt:

| Wanneer | Aan | Inhoud |
| --- | --- | --- |
| dossier aangemaakt | klant | bevestiging plus magic link |
| ingebrekestelling verstuurd | klant | wat er is verstuurd en wat er nu gebeurt |
| twee weken verstreken | klant | er gaat nu een dwangsom lopen |
| besluit ontvangen | klant | wat dat betekent voor de zaak |
| afgehandeld | klant | het bedrag en wanneer het komt |
| nieuw dossier | kantoor | er staat werk klaar |
| actiedatum bereikt | kantoor | dagelijkse werklijst |

Die laatste twee lossen het gat op dat er nu is: iemand moet in de
beheeromgeving kijken om te weten dat er iets binnen is.

---

## 10. Kosten per maand

| Post | Wat | Indicatie |
| --- | --- | --- |
| Domein | `nubeslist.nl` bij een registrar | € 1 (ca. € 10 per jaar) |
| Hosting | Vercel Pro, verplicht bij commercieel gebruik | € 19 |
| Database | Supabase Pro (gratis kan om te beginnen) | € 24 |
| Mailbox | Google Workspace of Microsoft 365, per gebruiker | € 6 |
| Transactionele mail | Postmark of Resend, instapniveau | € 14 |
| **Totaal** | | **ongeveer € 65** |

Beginnen kan goedkoper: Supabase heeft een gratis niveau dat voor de eerste
dossiers volstaat. Let wel op dat een gratis Supabase-project in de pauzestand
gaat na een periode zonder verkeer, en dat er geen automatische back-ups bij
zitten. Zodra er echte dossiers in staan, is Pro geen luxe.

---

## 11. Vóór de eerste echte klant

Dit is geen bijzaak: jullie verwerken BSN, IBAN, adresgegevens en een
handtekening van mensen die vaak in een kwetsbare positie zitten.

- [ ] **Grondslag voor het BSN.** Een particuliere partij mag een BSN alleen
      gebruiken als daar een wettelijke basis voor is. De route loopt
      waarschijnlijk via de machtiging, maar **laat dit toetsen door een jurist**
      voordat er één BSN in de database staat. Dit is het punt waarop ik geen
      zekerheid kan geven.
- [ ] **DPIA.** Bij stelselmatige verwerking van BSN op enige schaal is een
      gegevensbeschermingseffectbeoordeling al snel verplicht.
- [ ] **Verwerkingsregister** (AVG art. 30) en een **privacyverklaring** op de
      site.
- [ ] **Verwerkersovereenkomsten** met Vercel, Supabase en de mailprovider.
- [ ] **Bewaartermijnen** vastleggen en automatisch uitvoeren. Voorstel: BSN
      wissen zodra de zaak is afgehandeld, het dossier zelf zeven jaar bewaren
      voor de administratie.
- [ ] **Back-up en herstel getest.** Niet "er is een back-up", maar: er is er
      één teruggezet en het werkte.
- [ ] **Algemene voorwaarden**, met de no-cure-no-pay-afspraak erin.
- [ ] **KvK-inschrijving** en de gegevens in `BEDRIJF_*` invullen, anders staan
      er stippellijnen op de machtiging.
- [ ] **Bevestiging van UWV** dat een digitaal gezette handtekening op de
      machtiging wordt geaccepteerd. Dit staat al langer open en is het enige
      punt dat de hele funnel kan laten omvallen: krijg het schriftelijk.
- [ ] **BEHEER_OPEN weg** uit de omgevingsvariabelen.

---

## 12. Volgorde van aanpak

Elke stap levert iets werkends op, zodat je nooit halverwege vastzit.

**Stap 1. Domein en hosting** (los van al het andere)
Domein kopen, DNS naar Vercel, mailbox inrichten, SPF/DKIM/DMARC zetten, Vercel
naar Pro. Daarna staat de huidige site op `nubeslist.nl`.

**Stap 2. Supabase erbij, nog zonder iets om te bouwen**
Project in een EU-regio, schema uit §5 draaien, RLS uit §6 aanzetten, publieke
registratie uit. Los daarvan een testproject.

**Stap 3. De opslag omzetten**
`src/store.js` herschrijven naar queries. De funnel blijft anoniem en schrijft
server-side met de service-sleutel. Klaar als alle tests weer groen zijn en een
dossier een herstart overleeft.

**Stap 4. Documenten bewaren**
Bucket `dossiers`, de originele brief erin. Hiermee vervalt het gat dat we nu
alleen de uitgelezen tekst hebben.

**Stap 5. Medewerkeraccounts**
Uitnodigen, tweefactor verplicht, rollen, auditlog. `BEHEER_WACHTWOORD` en
`BEHEER_OPEN` eruit.

**Stap 6. Het klantportaal**
`/mijn` met magic link, tijdlijn, ontbrekende gegevens aanvullen, documenten.

**Stap 7. E-mail**
De berichten uit §9, en de dagelijkse werklijst naar kantoor.

**Stap 8. Juridisch afronden**, dan pas adverteren.

Stap 1 en 2 kunnen naast elkaar. Stap 3 is het meeste werk. Stap 5 en 6 delen de
inlogopbouw, dus die liggen na elkaar het handigst.
