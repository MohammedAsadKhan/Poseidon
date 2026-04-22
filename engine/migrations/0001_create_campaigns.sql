-- ─────────────────────────────────────────
-- Migration 0001: Campaigns
-- Core campaign data and status lifecycle
-- ─────────────────────────────────────────

-- Campaign status enum
CREATE TYPE campaign_status AS ENUM (
    'draft',
    'active',
    'paused',
    'completed',
    'archived'
);

-- Event type enum
CREATE TYPE event_type AS ENUM (
    'emailsent',
    'emailopened',
    'linkclicked',
    'formsubmitted',
    'reportedphishing'
);

-- Campaigns table
CREATE TABLE campaigns (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT NOT NULL,
    description      TEXT,
    status           campaign_status NOT NULL DEFAULT 'draft',
    from_name        TEXT NOT NULL,
    from_email       TEXT NOT NULL,
    subject          TEXT NOT NULL,
    template_id      UUID NOT NULL,
    target_group_id  UUID NOT NULL,
    redirect_url     TEXT,
    scheduled_at     TIMESTAMPTZ,
    launched_at      TIMESTAMPTZ,
    completed_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_campaigns_status     ON campaigns(status);
CREATE INDEX idx_campaigns_created_at ON campaigns(created_at DESC);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER campaigns_updated_at
    BEFORE UPDATE ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
