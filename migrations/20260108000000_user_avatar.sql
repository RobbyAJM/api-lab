-- Add avatar column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar VARCHAR(255) NOT NULL DEFAULT 'bottts:api-lab';
