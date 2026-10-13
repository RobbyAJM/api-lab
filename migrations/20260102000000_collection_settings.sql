-- Add settings column to collections table for Collection-level configurations (Auth inheritance, etc.)
ALTER TABLE collections ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
