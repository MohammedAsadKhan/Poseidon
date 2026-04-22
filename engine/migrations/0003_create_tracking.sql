-- ─────────────────────────────────────────
-- Migration 0003: Tracking Tokens
-- Unique tokens per campaign/target pair
-- Used to attribute opens, clicks and
-- submissions back to individual people
-- ─────────────────────────────────────────

CREATE TABLE tracking_tokens (
    token        TEXT PRIMARY KEY,
    campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    target_id    UUID NOT NULL REFERENCES targets(id)   ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One token per campaign/target pair
    UNIQUE(campaign_id, target_id)
);

CREATE INDEX idx_tracking_tokens_campaign_id ON tracking_tokens(campaign_id);
CREATE INDEX idx_tracking_tokens_target_id   ON tracking_tokens(target_id);
