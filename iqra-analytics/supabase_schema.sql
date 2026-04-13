-- Выполни это в Supabase → SQL Editor

CREATE TABLE runs (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  date_from  DATE,
  date_to    DATE,
  stats      JSONB,
  rows       JSONB
);

-- Индекс для быстрой сортировки по дате
CREATE INDEX runs_created_at_idx ON runs (created_at DESC);

-- (Опционально) Row Level Security — отключаем, т.к. используем service key
ALTER TABLE runs DISABLE ROW LEVEL SECURITY;
