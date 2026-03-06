-- CDC Agent: document knowledge base and full-text search
-- Run this in Supabase SQL Editor or via: supabase db push

-- Table: cdc_documents (metadata + full extracted text)
CREATE TABLE IF NOT EXISTS cdc_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    content_text TEXT,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: cdc_chunks (searchable chunks with French FTS)
CREATE TABLE IF NOT EXISTS cdc_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES cdc_documents(id) ON DELETE CASCADE,
    document_name TEXT NOT NULL,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('french', content)) STORED
);

CREATE INDEX IF NOT EXISTS idx_cdc_chunks_document_id ON cdc_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_cdc_chunks_tsv ON cdc_chunks USING GIN(tsv);

-- RPC: search chunks by full-text query (French config)
CREATE OR REPLACE FUNCTION search_cdc_chunks(query text, match_count int DEFAULT 8)
RETURNS TABLE(
    id uuid,
    document_id uuid,
    document_name text,
    content text,
    chunk_index int,
    rank real
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        c.id,
        c.document_id,
        c.document_name,
        c.content,
        c.chunk_index,
        ts_rank(c.tsv, plainto_tsquery('french', query)) AS rank
    FROM cdc_chunks c
    WHERE c.tsv @@ plainto_tsquery('french', query)
    ORDER BY rank DESC
    LIMIT match_count;
$$;

-- RLS
ALTER TABLE cdc_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdc_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on cdc_documents" ON cdc_documents;
CREATE POLICY "Allow all on cdc_documents" ON cdc_documents FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on cdc_chunks" ON cdc_chunks;
CREATE POLICY "Allow all on cdc_chunks" ON cdc_chunks FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON cdc_documents TO anon;
GRANT ALL ON cdc_chunks TO anon;
