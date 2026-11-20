-- Add FIX session endpoints while preserving existing HTTP and gRPC records.
ALTER TABLE endpoints DROP CONSTRAINT IF EXISTS endpoints_protocol_check;
ALTER TABLE endpoints
    ADD CONSTRAINT endpoints_protocol_check
    CHECK (protocol IN ('http', 'grpc', 'fix'));
