-- Rijbeveiliging (RLS), alleen nodig bij Supabase.
--
-- Zolang de applicatie de enige is die met de database praat, doet de code de
-- autorisatie (zie server.js en test/portaal.test.js). Zodra de browser
-- rechtstreeks met de database praat, moet de database zelf nee kunnen zeggen.
-- Dan is dit bestand het verschil tussen "wij vergeten nooit een where" en
-- "de database laat het niet toe".
--
-- Draaien ná 001-schema.sql.

begin;

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

-- Een tabel zonder policies is hierna dicht. Dat is de veilige kant om op te
-- vallen: vergeten we een policy, dan lekt er niets, dan werkt er iets niet.

-- ------------------------------------------------------------ hulpfuncties --

-- Is dit een actieve medewerker mét tweede factor? De aal2-eis staat hier
-- bewust in: zonder tweede factor geeft elke policy hieronder nul rijen.
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

create or replace function public.mag_wijzigen()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_medewerker() and exists (
    select 1 from medewerkers m
    where m.profiel_id = auth.uid() and m.rol <> 'lezer'
  );
$$;

create or replace function public.mijn_aanvrager_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.id from aanvragers a where a.profiel_id = auth.uid();
$$;

-- `set search_path = public` hoort bij security definer altijd mee: zonder dat
-- kan iemand met rechten op zijn eigen schema de functie laten omvallen naar
-- zijn eigen tabellen.

-- ---------------------------------------------------------------- policies --

create policy "klant ziet eigen dossier" on dossiers for select
  using (aanvrager_id = public.mijn_aanvrager_id());

create policy "medewerker ziet alle dossiers" on dossiers for select
  using (public.is_medewerker());

create policy "behandelaar wijzigt dossiers" on dossiers for update
  using (public.mag_wijzigen()) with check (public.mag_wijzigen());

-- Bewust geen insert-policy: dossiers ontstaan in de funnel, server-side met
-- de service-sleutel. Niemand met een gewone sessie maakt er een aan.

create policy "klant ziet eigen documenten" on documenten for select
  using (
    zichtbaar_voor_klant
    and exists (select 1 from dossiers d
                where d.id = documenten.dossier_id
                  and d.aanvrager_id = public.mijn_aanvrager_id())
  );

create policy "medewerker beheert documenten" on documenten for all
  using (public.is_medewerker()) with check (public.mag_wijzigen());

create policy "klant ziet eigen tijdlijn" on gebeurtenissen for select
  using (
    zichtbaar_voor_klant
    and exists (select 1 from dossiers d
                where d.id = gebeurtenissen.dossier_id
                  and d.aanvrager_id = public.mijn_aanvrager_id())
  );

create policy "medewerker beheert gebeurtenissen" on gebeurtenissen for all
  using (public.is_medewerker()) with check (public.mag_wijzigen());

-- Notities zijn intern. Geen klantpolicy, in geen enkele vorm.
create policy "alleen medewerkers bij notities" on notities for all
  using (public.is_medewerker()) with check (public.mag_wijzigen());

create policy "klant ziet eigen gegevens" on aanvragers for select
  using (profiel_id = auth.uid());

create policy "medewerker beheert aanvragers" on aanvragers for all
  using (public.is_medewerker()) with check (public.mag_wijzigen());

create policy "iedereen ziet zijn eigen profiel" on profielen for select
  using (id = auth.uid());

create policy "beheerder ziet alle profielen" on profielen for select
  using (exists (select 1 from medewerkers m
                 where m.profiel_id = auth.uid() and m.rol = 'beheerder' and m.actief));

create policy "medewerker ziet machtigingen" on machtigingen for all
  using (public.is_medewerker()) with check (public.mag_wijzigen());

create policy "klant ziet eigen machtiging" on machtigingen for select
  using (exists (select 1 from dossiers d
                 where d.id = machtigingen.dossier_id
                   and d.aanvrager_id = public.mijn_aanvrager_id()));

create policy "medewerker beheert afhandeling" on afhandelingen for all
  using (public.is_medewerker()) with check (public.mag_wijzigen());

create policy "klant ziet eigen afhandeling" on afhandelingen for select
  using (exists (select 1 from dossiers d
                 where d.id = afhandelingen.dossier_id
                   and d.aanvrager_id = public.mijn_aanvrager_id()));

-- Het auditlog is er om terug te kijken, niet om te wijzigen.
create policy "beheerder leest auditlog" on auditlog for select
  using (exists (select 1 from medewerkers m
                 where m.profiel_id = auth.uid() and m.rol = 'beheerder' and m.actief));

create policy "medewerker ziet verstuurde berichten" on berichten for select
  using (public.is_medewerker());

commit;
