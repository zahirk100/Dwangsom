-- nubeslist.nl: het schema voor Postgres (Supabase).
--
-- Dit bestand is nog niet in gebruik. De applicatie draait nu op de
-- opslagdrivers uit src/opslag.js (bestand, Redis of geheugen), en die zijn
-- voor de eerste honderden dossiers prima. Zodra er gezocht, gefilterd en
-- gerapporteerd moet worden over duizenden dossiers, is dit het schema waar
-- src/store.js naartoe verhuist. Het staat hier vast klaar zodat die stap een
-- verhuizing is en geen ontwerpvraag.
--
-- Draaien: plak dit in de SQL-editor van Supabase, of `psql -f db/001-schema.sql`.

begin;

-- ----------------------------------------------------------- opsommingen --

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

-- ---------------------------------------------------------------- mensen --

-- Eén rij per ingelogde gebruiker, klant of medewerker.
-- Bij Supabase verwijst id naar auth.users; zonder Supabase is het gewoon een
-- eigen tabel en staat de wachtwoordhash hier.
create table profielen (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique,
  naam           text,
  telefoon       text,
  wachtwoord_hash text,
  totp_geheim    text,
  totp_bevestigd_op timestamptz,
  actief         boolean not null default true,
  laatste_aanmelding timestamptz,
  aangemaakt_op  timestamptz not null default now()
);

create unique index on profielen (lower(email));

-- Wie hierin staat is medewerker. Niet erin = klant.
create table medewerkers (
  profiel_id    uuid primary key references profielen on delete cascade,
  rol           medewerkerrol not null default 'behandelaar',
  actief        boolean not null default true,
  aangemaakt_op timestamptz not null default now()
);

-- Eenmalige koppelingen: uitnodiging, inloglink, wachtwoordherstel.
-- Alleen de hash van het token staat hier, zodat een gelekte database geen
-- werkende links oplevert.
create table koppelingen (
  token_hash    text primary key,
  profiel_id    uuid not null references profielen on delete cascade,
  soort         text not null,
  verloopt_op   timestamptz not null,
  gebruikt_op   timestamptz,
  aangemaakt_op timestamptz not null default now()
);

create table sessies (
  id            uuid primary key default gen_random_uuid(),
  profiel_id    uuid not null references profielen on delete cascade,
  verloopt_op   timestamptz not null,
  ip            inet,
  user_agent    text,
  aangemaakt_op timestamptz not null default now()
);

create index on sessies (profiel_id);
create index on sessies (verloopt_op);

-- ------------------------------------------------------------- aanvragers --

-- Los van profielen: de funnel maakt een dossier aan vóórdat iemand inlogt.
create table aanvragers (
  id            uuid primary key default gen_random_uuid(),
  profiel_id    uuid unique references profielen on delete set null,
  naam          text not null,
  email         text not null,
  telefoon      text,
  adres         text,
  postcode      text,
  woonplaats    text,
  geboortedatum date,
  -- Versleuteld in de applicatie, vóór het opslaan. De sleutel staat in de
  -- omgeving, niet in de database: een gelekte dump is dan geen gelekt BSN.
  bsn_versleuteld text,
  iban          text,
  aangemaakt_op timestamptz not null default now(),
  gewijzigd_op  timestamptz not null default now()
);

create index on aanvragers (lower(email));

-- --------------------------------------------------------------- dossiers --

create table dossiers (
  id             uuid primary key default gen_random_uuid(),
  referentie     text not null unique,
  aanvrager_id   uuid not null references aanvragers on delete restrict,
  behandelaar_id uuid references medewerkers (profiel_id) on delete set null,

  soort          dossiersoort not null default 'beoordeling',
  status         dossierstatus not null default 'nieuw',

  bestuursorgaan text not null,
  zaaktype       text not null,
  organisatienaam text,
  kenmerk        text,
  basisdatum     date not null,
  termijn_bekend boolean not null default false,
  termijn_einddatum date,
  verdaagd       boolean not null default false,
  verdaging_einddatum date,
  opschorting_dagen integer not null default 0,
  ingebreke_gesteld boolean not null default false,
  ingebrekestelling_datum date,
  ingebrekestelling_door_ons boolean not null default false,
  besluit_genomen boolean not null default false,
  besluit_datum  date,
  bijzonder      text,

  -- De uitkomst van de rekenkern. Afgeleid, dus jsonb volstaat: er wordt nooit
  -- op gezocht. De waarheid staat in de kolommen hierboven en wordt bij elke
  -- wijziging opnieuw doorgerekend.
  rapport        jsonb,

  actiedatum     date,
  actie_label    text,

  aangemaakt_op  timestamptz not null default now(),
  gewijzigd_op   timestamptz not null default now()
);

-- De werklijst: openstaand werk waarvan de datum is bereikt, oudste eerst.
create index dossiers_werklijst on dossiers (actiedatum)
  where status not in ('toegekend', 'afgewezen', 'afgesloten');
create index on dossiers (aanvrager_id);
create index on dossiers (status);
create index on dossiers (behandelaar_id);

-- ------------------------------------------------------------- documenten --

create table documenten (
  id            uuid primary key default gen_random_uuid(),
  dossier_id    uuid not null references dossiers on delete cascade,
  soort         documentsoort not null,
  bestandsnaam  text not null,
  opslagpad     text not null,
  mimetype      text,
  bytes         integer,
  tekst         text,
  zichtbaar_voor_klant boolean not null default false,
  toegevoegd_door uuid references profielen on delete set null,
  aangemaakt_op timestamptz not null default now()
);

create index on documenten (dossier_id, soort);

-- --------------------------------------------------- tijdlijn en notities --

-- Eén logboek, met een vlag voor wat de klant mag zien. Twee tabellen zouden
-- vroeg of laat uit elkaar gaan lopen.
create table gebeurtenissen (
  id            bigint generated always as identity primary key,
  dossier_id    uuid not null references dossiers on delete cascade,
  soort         text not null,
  tekst         text not null,
  door_profiel_id uuid references profielen on delete set null,
  door_systeem  boolean not null default false,
  zichtbaar_voor_klant boolean not null default false,
  aangemaakt_op timestamptz not null default now()
);

create index on gebeurtenissen (dossier_id, aangemaakt_op desc);

-- Uitsluitend intern. Hier staat wat de klant nooit mag lezen.
create table notities (
  id            bigint generated always as identity primary key,
  dossier_id    uuid not null references dossiers on delete cascade,
  tekst         text not null,
  door_profiel_id uuid references profielen on delete set null,
  aangemaakt_op timestamptz not null default now()
);

-- -------------------------------------------- machtiging en afhandeling ---

create table machtigingen (
  dossier_id       uuid primary key references dossiers on delete cascade,
  digitaal         boolean not null default false,
  ondertekend_op   timestamptz,
  handtekening_pad text,
  ip               inet,
  user_agent       text,
  verstuurd_op     timestamptz,
  ontvangen_op     timestamptz
);

create table afhandelingen (
  dossier_id       uuid primary key references dossiers on delete cascade,
  bedrag_toegekend numeric(10,2),
  beschikking_op   date,
  uitbetaald_op    date,
  toelichting      text,
  vastgelegd_door  uuid references profielen on delete set null,
  vastgelegd_op    timestamptz not null default now()
);

-- ------------------------------------------------- auditspoor en berichten --

-- Verplicht zodra er BSN in de database staat: wie keek wanneer waarnaar.
create table auditlog (
  id            bigint generated always as identity primary key,
  profiel_id    uuid references profielen on delete set null,
  actie         text not null,
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
  status        text,
  aangemaakt_op timestamptz not null default now()
);

commit;
