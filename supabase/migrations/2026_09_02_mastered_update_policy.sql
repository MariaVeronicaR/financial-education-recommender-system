-- Migración 2026-09-02: añade política UPDATE para mastered_concepts.
--
-- Síntoma: upsert() desde el frontend devuelve 42501 con
-- "new row violates row-level security policy (USING expression)
--  for table mastered_concepts" cuando la fila YA existe (upsert hace
-- INSERT o UPDATE según el caso, y solo había política de INSERT).
--
-- Fix: política de UPDATE con USING (auth.uid() = user_id) y WITH CHECK
-- (auth.uid() = user_id) para que el upsert siempre funcione cuando
-- el usuario actualiza sus propios conceptos dominados.
--
-- Cómo aplicar: Dashboard de Supabase > SQL Editor > New query > pegar y ejecutar.
-- Es idempotente (drop policy if exists antes del create).

drop policy if exists "mastered_update_own" on public.mastered_concepts;

create policy "mastered_update_own" on public.mastered_concepts
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
