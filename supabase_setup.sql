-- 1. Create the Splists table
CREATE TABLE splits (
    id TEXT PRIMARY KEY,
    receipt_data JSONB,
    people JSONB,
    assignments JSONB,
    individual_results JSONB,
    image_url TEXT,
    admin_password TEXT,
    view_password TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create the Suggestions table
CREATE TABLE suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    split_id TEXT REFERENCES splits(id) ON DELETE CASCADE,
    suggestor_name TEXT,
    suggested_assignments JSONB,
    suggested_people JSONB,
    suggested_data JSONB,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS
ALTER TABLE splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies (Simple open policies for ID-based access)
-- NOTE: In a production app, you might want to tighten these based on the passwords stored in the rows.
CREATE POLICY "Public Access" ON splits FOR ALL USING (true);
CREATE POLICY "Public Access" ON suggestions FOR ALL USING (true);

-- 5. Set up Storage (Run this in the Supabase Dashboard, or use this SQL to remind the user)
/*
  You need to create a bucket named 'receipts' in the Storage section.
  Ensure it is set to 'Public'.
  Add the following Storage Policies for the 'receipts' bucket:
  - ALLOW SELECT for all users
  - ALLOW INSERT/UPDATE for all users
*/
