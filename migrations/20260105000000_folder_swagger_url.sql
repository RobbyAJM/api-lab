-- Add swagger_url to collection_folders
ALTER TABLE collection_folders
ADD COLUMN IF NOT EXISTS swagger_url VARCHAR(1000);
