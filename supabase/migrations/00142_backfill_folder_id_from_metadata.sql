-- =============================================================================
-- Migration 00142: Backfill folder_id e folder_url a partir de metadata
-- Migra dados existentes de metadata.drive_folder / metadata.drive_folder_id
-- para as colunas diretas folder_id e folder_url
-- =============================================================================

-- CLIENTS
UPDATE public.clients
SET
  folder_id = COALESCE(
    folder_id,
    -- Tenta extrair ID de metadata.drive_folder_id
    NULLIF(TRIM((metadata->>'drive_folder_id')::text), ''),
    -- Tenta extrair ID de metadata.drive_folder (pode ser ID ou URL)
    CASE
      WHEN (metadata->>'drive_folder') ~ '^[a-zA-Z0-9_-]{10,}$'
        AND (metadata->>'drive_folder') NOT LIKE '%http%'
      THEN NULLIF(TRIM((metadata->>'drive_folder')::text), '')
      WHEN (metadata->>'drive_folder') ~ '/folders/([a-zA-Z0-9_-]+)'
      THEN SUBSTRING((metadata->>'drive_folder') FROM '/folders/([a-zA-Z0-9_-]+)')
      ELSE NULL
    END
  ),
  folder_url = COALESCE(
    folder_url,
    -- Se metadata.drive_folder_url existe, usa direto
    NULLIF(TRIM((metadata->>'drive_folder_url')::text), ''),
    -- Se metadata.drive_folder é uma URL, usa direto
    CASE
      WHEN (metadata->>'drive_folder') LIKE 'http%'
      THEN NULLIF(TRIM((metadata->>'drive_folder')::text), '')
      -- Se é um ID puro, constrói a URL
      WHEN (metadata->>'drive_folder') ~ '^[a-zA-Z0-9_-]{10,}$'
        AND (metadata->>'drive_folder') NOT LIKE '%http%'
      THEN 'https://drive.google.com/drive/folders/' || TRIM((metadata->>'drive_folder')::text)
      ELSE NULL
    END
  )
WHERE
  (folder_id IS NULL OR folder_url IS NULL)
  AND (
    metadata->>'drive_folder_id' IS NOT NULL
    OR metadata->>'drive_folder' IS NOT NULL
    OR metadata->>'drive_folder_url' IS NOT NULL
  );

-- SUPPLIERS
UPDATE public.suppliers
SET
  folder_id = COALESCE(
    folder_id,
    NULLIF(TRIM((metadata->>'drive_folder_id')::text), ''),
    CASE
      WHEN (metadata->>'drive_folder') ~ '^[a-zA-Z0-9_-]{10,}$'
        AND (metadata->>'drive_folder') NOT LIKE '%http%'
      THEN NULLIF(TRIM((metadata->>'drive_folder')::text), '')
      WHEN (metadata->>'drive_folder') ~ '/folders/([a-zA-Z0-9_-]+)'
      THEN SUBSTRING((metadata->>'drive_folder') FROM '/folders/([a-zA-Z0-9_-]+)')
      ELSE NULL
    END
  ),
  folder_url = COALESCE(
    folder_url,
    NULLIF(TRIM((metadata->>'drive_folder_url')::text), ''),
    CASE
      WHEN (metadata->>'drive_folder') LIKE 'http%'
      THEN NULLIF(TRIM((metadata->>'drive_folder')::text), '')
      WHEN (metadata->>'drive_folder') ~ '^[a-zA-Z0-9_-]{10,}$'
        AND (metadata->>'drive_folder') NOT LIKE '%http%'
      THEN 'https://drive.google.com/drive/folders/' || TRIM((metadata->>'drive_folder')::text)
      ELSE NULL
    END
  )
WHERE
  (folder_id IS NULL OR folder_url IS NULL)
  AND (
    metadata->>'drive_folder_id' IS NOT NULL
    OR metadata->>'drive_folder' IS NOT NULL
    OR metadata->>'drive_folder_url' IS NOT NULL
  );

-- PROJECTS
UPDATE public.projects
SET
  folder_id = COALESCE(
    folder_id,
    NULLIF(TRIM((metadata->>'drive_folder_id')::text), ''),
    CASE
      WHEN (metadata->>'drive_folder') ~ '^[a-zA-Z0-9_-]{10,}$'
        AND (metadata->>'drive_folder') NOT LIKE '%http%'
      THEN NULLIF(TRIM((metadata->>'drive_folder')::text), '')
      WHEN (metadata->>'drive_folder') ~ '/folders/([a-zA-Z0-9_-]+)'
      THEN SUBSTRING((metadata->>'drive_folder') FROM '/folders/([a-zA-Z0-9_-]+)')
      ELSE NULL
    END
  ),
  folder_url = COALESCE(
    folder_url,
    NULLIF(TRIM((metadata->>'drive_folder_url')::text), ''),
    CASE
      WHEN (metadata->>'drive_folder') LIKE 'http%'
      THEN NULLIF(TRIM((metadata->>'drive_folder')::text), '')
      WHEN (metadata->>'drive_folder') ~ '^[a-zA-Z0-9_-]{10,}$'
        AND (metadata->>'drive_folder') NOT LIKE '%http%'
      THEN 'https://drive.google.com/drive/folders/' || TRIM((metadata->>'drive_folder')::text)
      ELSE NULL
    END
  )
WHERE
  (folder_id IS NULL OR folder_url IS NULL)
  AND (
    metadata->>'drive_folder_id' IS NOT NULL
    OR metadata->>'drive_folder' IS NOT NULL
    OR metadata->>'drive_folder_url' IS NOT NULL
  );

-- PROFILES (colaboradores)
UPDATE public.profiles
SET
  folder_id = COALESCE(
    folder_id,
    NULLIF(TRIM((metadata->>'drive_folder_id')::text), ''),
    CASE
      WHEN (metadata->>'drive_folder') ~ '^[a-zA-Z0-9_-]{10,}$'
        AND (metadata->>'drive_folder') NOT LIKE '%http%'
      THEN NULLIF(TRIM((metadata->>'drive_folder')::text), '')
      WHEN (metadata->>'drive_folder') ~ '/folders/([a-zA-Z0-9_-]+)'
      THEN SUBSTRING((metadata->>'drive_folder') FROM '/folders/([a-zA-Z0-9_-]+)')
      ELSE NULL
    END
  ),
  folder_url = COALESCE(
    folder_url,
    NULLIF(TRIM((metadata->>'drive_folder_url')::text), ''),
    CASE
      WHEN (metadata->>'drive_folder') LIKE 'http%'
      THEN NULLIF(TRIM((metadata->>'drive_folder')::text), '')
      WHEN (metadata->>'drive_folder') ~ '^[a-zA-Z0-9_-]{10,}$'
        AND (metadata->>'drive_folder') NOT LIKE '%http%'
      THEN 'https://drive.google.com/drive/folders/' || TRIM((metadata->>'drive_folder')::text)
      ELSE NULL
    END
  )
WHERE
  (folder_id IS NULL OR folder_url IS NULL)
  AND (
    metadata->>'drive_folder_id' IS NOT NULL
    OR metadata->>'drive_folder' IS NOT NULL
    OR metadata->>'drive_folder_url' IS NOT NULL
  );
