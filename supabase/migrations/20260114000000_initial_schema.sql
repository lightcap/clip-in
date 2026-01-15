-- Clip In Initial Schema
-- This migration sets up the core tables for the Peloton companion app

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types
CREATE TYPE workout_status AS ENUM ('planned', 'completed', 'skipped', 'postponed');
CREATE TYPE sync_type AS ENUM ('manual', 'scheduled');

-- Create profiles table (extends Supabase auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    peloton_user_id TEXT,
    peloton_username TEXT,
    display_name TEXT,
    avatar_url TEXT,
    current_ftp INTEGER,
    estimated_ftp INTEGER,
    UNIQUE(peloton_user_id)
);

-- Create peloton_tokens table for storing encrypted OAuth tokens
CREATE TABLE peloton_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    UNIQUE(user_id)
);

-- Create ftp_records table for FTP history tracking
CREATE TABLE ftp_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- Create planned_workouts table for workout scheduling
CREATE TABLE planned_workouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    peloton_ride_id TEXT NOT NULL,
    ride_title TEXT NOT NULL,
    ride_image_url TEXT,
    instructor_name TEXT,
    duration_seconds INTEGER NOT NULL,
    discipline TEXT NOT NULL,
    scheduled_date DATE NOT NULL,
    scheduled_time TIME,
    status workout_status NOT NULL DEFAULT 'planned',
    pushed_to_stack BOOLEAN NOT NULL DEFAULT FALSE,
    pushed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Create stack_sync_logs table for tracking stack push operations
CREATE TABLE stack_sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sync_type sync_type NOT NULL,
    workouts_pushed INTEGER NOT NULL DEFAULT 0,
    success BOOLEAN NOT NULL,
    error_message TEXT
);

-- Create indexes for performance
CREATE INDEX idx_ftp_records_user_date ON ftp_records(user_id, workout_date DESC);
CREATE INDEX idx_planned_workouts_user_date ON planned_workouts(user_id, scheduled_date);
CREATE INDEX idx_planned_workouts_status ON planned_workouts(user_id, status);
CREATE INDEX idx_stack_sync_logs_user_date ON stack_sync_logs(user_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE peloton_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE ftp_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE planned_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stack_sync_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for profiles
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Create RLS policies for peloton_tokens
CREATE POLICY "Users can view own tokens" ON peloton_tokens
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tokens" ON peloton_tokens
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tokens" ON peloton_tokens
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tokens" ON peloton_tokens
    FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for ftp_records
CREATE POLICY "Users can view own FTP records" ON ftp_records
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own FTP records" ON ftp_records
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own FTP records" ON ftp_records
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own FTP records" ON ftp_records
    FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for planned_workouts
CREATE POLICY "Users can view own planned workouts" ON planned_workouts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own planned workouts" ON planned_workouts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own planned workouts" ON planned_workouts
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own planned workouts" ON planned_workouts
    FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for stack_sync_logs
CREATE POLICY "Users can view own sync logs" ON stack_sync_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sync logs" ON stack_sync_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_peloton_tokens_updated_at
    BEFORE UPDATE ON peloton_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_planned_workouts_updated_at
    BEFORE UPDATE ON planned_workouts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id)
    VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for auto-creating profile on signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
