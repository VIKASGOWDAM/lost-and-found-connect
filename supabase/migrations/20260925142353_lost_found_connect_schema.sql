/*
# Lost & Found Connect — Core Schema

## Overview
Creates the full data model for a lost-and-found platform: user profiles, dynamic
category-based form schema, reports (lost/found), and public/private attribute + media
tables. Enforces strict Row Level Security so private attributes and exact locations
are never exposed to non-owners.

## Tables
1. users — extends auth.users: full_name, phone, trust_score, is_verified_identity, role, created_at
2. categories — id, name, parent_id (nullable self-FK)
3. category_fields — id, category_id, field_key, field_label, field_type, is_public_default, is_required
4. reports — id, type, reporter_id, category_id, status, location_general, location_exact, date_occurred, created_at, updated_at
5. report_public_attributes — id, report_id, key, value
6. report_private_attributes — id, report_id, key, value, is_verification_challenge
7. report_media — id, report_id, url, visibility, media_type

## Security (RLS)
- users: own-row read/update/insert only
- categories + category_fields: public read (anon + authenticated)
- reports: public read non-flagged; owner full CRUD
- report_public_attributes: public read for non-flagged reports; owner CRUD
- report_private_attributes: owner-only, no public/anon access ever
- report_media: public read 'public' media on non-flagged reports; owner full CRUD
*/

-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('user', 'org_admin', 'org_staff', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE report_type AS ENUM ('lost', 'found');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE report_status AS ENUM ('open', 'matched', 'verifying', 'resolved', 'closed', 'flagged');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE field_type AS ENUM ('text', 'number', 'select', 'date', 'boolean');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE media_visibility AS ENUM ('public', 'private');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ USERS ============
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  trust_score integer NOT NULL DEFAULT 0,
  is_verified_identity boolean NOT NULL DEFAULT false,
  role user_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own" ON users;
CREATE POLICY "users_select_own" ON users FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "users_insert_own" ON users;
CREATE POLICY "users_insert_own" ON users FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============ CATEGORIES ============
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_public_read" ON categories;
CREATE POLICY "categories_public_read" ON categories FOR SELECT
  TO anon, authenticated USING (true);

-- ============ CATEGORY FIELDS ============
CREATE TABLE IF NOT EXISTS category_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  field_label text NOT NULL,
  field_type field_type NOT NULL DEFAULT 'text',
  is_public_default boolean NOT NULL DEFAULT true,
  is_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE category_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "category_fields_public_read" ON category_fields;
CREATE POLICY "category_fields_public_read" ON category_fields FOR SELECT
  TO anon, authenticated USING (true);

-- ============ REPORTS ============
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type report_type NOT NULL,
  reporter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  status report_status NOT NULL DEFAULT 'open',
  location_general text NOT NULL,
  location_exact point,
  date_occurred date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);
CREATE INDEX IF NOT EXISTS idx_reports_category ON reports(category_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports_public_read" ON reports;
CREATE POLICY "reports_public_read" ON reports FOR SELECT
  TO anon, authenticated USING (status != 'flagged');

DROP POLICY IF EXISTS "reports_owner_select" ON reports;
CREATE POLICY "reports_owner_select" ON reports FOR SELECT
  TO authenticated USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "reports_owner_insert" ON reports;
CREATE POLICY "reports_owner_insert" ON reports FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "reports_owner_update" ON reports;
CREATE POLICY "reports_owner_update" ON reports FOR UPDATE
  TO authenticated USING (auth.uid() = reporter_id) WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "reports_owner_delete" ON reports;
CREATE POLICY "reports_owner_delete" ON reports FOR DELETE
  TO authenticated USING (auth.uid() = reporter_id);

-- ============ REPORT PUBLIC ATTRIBUTES ============
CREATE TABLE IF NOT EXISTS report_public_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rpa_report ON report_public_attributes(report_id);

ALTER TABLE report_public_attributes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rpa_public_read" ON report_public_attributes;
CREATE POLICY "rpa_public_read" ON report_public_attributes FOR SELECT
  TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM reports r WHERE r.id = report_public_attributes.report_id AND r.status != 'flagged')
  );

DROP POLICY IF EXISTS "rpa_owner_select" ON report_public_attributes;
CREATE POLICY "rpa_owner_select" ON report_public_attributes FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM reports r WHERE r.id = report_public_attributes.report_id AND r.reporter_id = auth.uid())
  );

DROP POLICY IF EXISTS "rpa_owner_insert" ON report_public_attributes;
CREATE POLICY "rpa_owner_insert" ON report_public_attributes FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM reports r WHERE r.id = report_id AND r.reporter_id = auth.uid())
  );

DROP POLICY IF EXISTS "rpa_owner_update" ON report_public_attributes;
CREATE POLICY "rpa_owner_update" ON report_public_attributes FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM reports r WHERE r.id = report_id AND r.reporter_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM reports r WHERE r.id = report_id AND r.reporter_id = auth.uid())
  );

DROP POLICY IF EXISTS "rpa_owner_delete" ON report_public_attributes;
CREATE POLICY "rpa_owner_delete" ON report_public_attributes FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM reports r WHERE r.id = report_id AND r.reporter_id = auth.uid())
  );

-- ============ REPORT PRIVATE ATTRIBUTES ============
CREATE TABLE IF NOT EXISTS report_private_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text,
  is_verification_challenge boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rpri_report ON report_private_attributes(report_id);

ALTER TABLE report_private_attributes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rpri_owner_select" ON report_private_attributes;
CREATE POLICY "rpri_owner_select" ON report_private_attributes FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM reports r WHERE r.id = report_private_attributes.report_id AND r.reporter_id = auth.uid())
  );

DROP POLICY IF EXISTS "rpri_owner_insert" ON report_private_attributes;
CREATE POLICY "rpri_owner_insert" ON report_private_attributes FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM reports r WHERE r.id = report_id AND r.reporter_id = auth.uid())
  );

DROP POLICY IF EXISTS "rpri_owner_update" ON report_private_attributes;
CREATE POLICY "rpri_owner_update" ON report_private_attributes FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM reports r WHERE r.id = report_id AND r.reporter_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM reports r WHERE r.id = report_id AND r.reporter_id = auth.uid())
  );

DROP POLICY IF EXISTS "rpri_owner_delete" ON report_private_attributes;
CREATE POLICY "rpri_owner_delete" ON report_private_attributes FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM reports r WHERE r.id = report_id AND r.reporter_id = auth.uid())
  );

-- ============ REPORT MEDIA ============
CREATE TABLE IF NOT EXISTS report_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  url text NOT NULL,
  visibility media_visibility NOT NULL DEFAULT 'public',
  media_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rm_report ON report_media(report_id);

ALTER TABLE report_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rm_public_read" ON report_media;
CREATE POLICY "rm_public_read" ON report_media FOR SELECT
  TO anon, authenticated USING (
    visibility = 'public'
    AND EXISTS (SELECT 1 FROM reports r WHERE r.id = report_media.report_id AND r.status != 'flagged')
  );

DROP POLICY IF EXISTS "rm_owner_select" ON report_media;
CREATE POLICY "rm_owner_select" ON report_media FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM reports r WHERE r.id = report_media.report_id AND r.reporter_id = auth.uid())
  );

DROP POLICY IF EXISTS "rm_owner_insert" ON report_media;
CREATE POLICY "rm_owner_insert" ON report_media FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM reports r WHERE r.id = report_id AND r.reporter_id = auth.uid())
  );

DROP POLICY IF EXISTS "rm_owner_update" ON report_media;
CREATE POLICY "rm_owner_update" ON report_media FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM reports r WHERE r.id = report_id AND r.reporter_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM reports r WHERE r.id = report_id AND r.reporter_id = auth.uid())
  );

DROP POLICY IF EXISTS "rm_owner_delete" ON report_media;
CREATE POLICY "rm_owner_delete" ON report_media FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM reports r WHERE r.id = report_id AND r.reporter_id = auth.uid())
  );

-- ============ UPDATED_AT TRIGGER ============
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reports_updated_at ON reports;
CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============ AUTO-CREATE USER PROFILE ============
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
