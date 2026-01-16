-- Add Peloton columns to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS peloton_user_id TEXT,
ADD COLUMN IF NOT EXISTS peloton_username TEXT,
ADD COLUMN IF NOT EXISTS current_ftp INTEGER,
ADD COLUMN IF NOT EXISTS estimated_ftp INTEGER;

-- Add unique constraint for peloton_user_id
CREATE UNIQUE INDEX IF NOT EXISTS profiles_peloton_user_id_key ON profiles(peloton_user_id) WHERE peloton_user_id IS NOT NULL;

-- Create peloton_tokens table for storing encrypted OAuth tokens
CREATE TABLE IF NOT EXISTS peloton_tokens (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    UNIQUE(user_id)
);

-- Create ftp_records table for FTP history tracking
CREATE TABLE IF NOT EXISTS ftp_records (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    workout_id TEXT NOT NULL,
    workout_date TIMESTAMPTZ NOT NULL,
    ride_title TEXT,
    avg_output INTEGER NOT NULL,
    calculated_ftp INTEGER NOT NULL,
    baseline_ftp INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id, workout_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ftp_records_user_date ON ftp_records(user_id, workout_date DESC);

-- Enable RLS
ALTER TABLE peloton_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE ftp_records ENABLE ROW LEVEL SECURITY;

-- RLS policies for peloton_tokens (drop first if exists)
DROP POLICY IF EXISTS "Users can view own tokens" ON peloton_tokens;
DROP POLICY IF EXISTS "Users can insert own tokens" ON peloton_tokens;
DROP POLICY IF EXISTS "Users can update own tokens" ON peloton_tokens;
DROP POLICY IF EXISTS "Users can delete own tokens" ON peloton_tokens;

CREATE POLICY "Users can view own tokens" ON peloton_tokens
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tokens" ON peloton_tokens
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tokens" ON peloton_tokens
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tokens" ON peloton_tokens
    FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for ftp_records (drop first if exists)
DROP POLICY IF EXISTS "Users can view own FTP records" ON ftp_records;
DROP POLICY IF EXISTS "Users can insert own FTP records" ON ftp_records;
DROP POLICY IF EXISTS "Users can update own FTP records" ON ftp_records;
DROP POLICY IF EXISTS "Users can delete own FTP records" ON ftp_records;

CREATE POLICY "Users can view own FTP records" ON ftp_records
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own FTP records" ON ftp_records
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own FTP records" ON ftp_records
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own FTP records" ON ftp_records
    FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at on peloton_tokens
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_peloton_tokens_updated_at ON peloton_tokens;
CREATE TRIGGER update_peloton_tokens_updated_at
    BEFORE UPDATE ON peloton_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
