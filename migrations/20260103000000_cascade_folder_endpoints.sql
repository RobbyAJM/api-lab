-- Fix: Cascade delete endpoints when folder is deleted
ALTER TABLE endpoints
DROP CONSTRAINT IF EXISTS endpoints_folder_id_fkey;

ALTER TABLE endpoints
ADD CONSTRAINT endpoints_folder_id_fkey
FOREIGN KEY (folder_id) REFERENCES collection_folders(id) ON DELETE CASCADE;
