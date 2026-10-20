-- Add grpc_url to collection_folders
ALTER TABLE collection_folders
ADD COLUMN IF NOT EXISTS grpc_url VARCHAR(500);
