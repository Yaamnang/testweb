-- Wipe this project's tables completely, ready to rebuild from scratch.
--
-- Drops every table and function in the public schema whose name starts with
-- eclypse_, and nothing else. It finds them by name at run time, so tables
-- added later are caught too. Afterwards run db/schema.sql again.

do $$
declare
  r record;
begin
  for r in
    select tablename from pg_tables
    where schemaname = 'public' and tablename like 'eclypse\_%'
  loop
    execute format('drop table if exists public.%I cascade', r.tablename);
  end loop;

  for r in
    select p.oid::regprocedure as fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'eclypse\_%'
  loop
    execute format('drop function if exists %s cascade', r.fn);
  end loop;
end $$;
