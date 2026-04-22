-- ─────────────────────────────────────────
-- Migration 0002: Targets and Target Groups
-- People being tested in campaigns
-- ─────────────────────────────────────────

-- Target groups - named lists of people
CREATE TABLE target_groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_target_groups_created_at ON target_groups(created_at DESC);

-- Individual targets within a group
CREATE TABLE targets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id    UUID NOT NULL REFERENCES target_groups(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    first_name  TEXT,
    last_name   TEXT,
    position    TEXT,
    department  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent duplicate emails within the same group
    UNIQUE(group_id, email)
);

CREATE INDEX idx_targets_group_id  ON targets(group_id);
CREATE INDEX idx_targets_email     ON targets(email);
CREATE INDEX idx_targets_department ON targets(department);

-- Campaign events - every meaningful action a target takes
CREATE TABLE campaign_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    target_id    UUID NOT NULL REFERENCES targets(id)   ON DELETE CASCADE,
    event_type   event_type NOT NULL,
    ip_address   TEXT,
    user_agent   TEXT,
    payload      JSONB,
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaign_events_campaign_id  ON campaign_events(campaign_id);
CREATE INDEX idx_campaign_events_target_id    ON campaign_events(target_id);
CREATE INDEX idx_campaign_events_event_type   ON campaign_events(event_type);
CREATE INDEX idx_campaign_events_occurred_at  ON campaign_events(occurred_at DESC);

-- Composite index for per-campaign per-target queries
CREATE INDEX idx_campaign_events_campaign_target
    ON campaign_events(campaign_id, target_id);
