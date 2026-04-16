-- Add status column to wallet_documents for signed-URL upload flow
-- 'pending' = upload URL issued, file not yet uploaded
-- 'ready'   = file uploaded and processed (text extracted, embeddings created)
ALTER TABLE wallet_documents
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready';

-- Backfill: all existing documents are already processed
UPDATE wallet_documents SET status = 'ready' WHERE status IS NULL;
