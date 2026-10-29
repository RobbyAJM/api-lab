DROP INDEX IF EXISTS idx_endpoints_collection;
CREATE INDEX IF NOT EXISTS idx_endpoints_collection_sort ON endpoints(collection_id, sort_order ASC, name ASC);
