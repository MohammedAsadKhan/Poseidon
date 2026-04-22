-- ─────────────────────────────────────────
-- Migration 0004: Email Templates
-- Base templates for phishing emails
-- AI generates on top of these at send time
-- ─────────────────────────────────────────

CREATE TABLE templates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    subject       TEXT NOT NULL,
    body_html     TEXT NOT NULL,
    body_text     TEXT NOT NULL,
    ai_generated  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_templates_created_at    ON templates(created_at DESC);
CREATE INDEX idx_templates_ai_generated  ON templates(ai_generated);

-- Auto-update updated_at
CREATE TRIGGER templates_updated_at
    BEFORE UPDATE ON templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────
-- Seed data
-- Default template so the engine has
-- something to work with out of the box
-- ─────────────────────────────────────────
INSERT INTO templates (id, name, subject, body_html, body_text, ai_generated)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Default AI Template',
    'Action required: {{subject}}',
    '<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Dear {{FIRST_NAME}},</p>
  <p>{{body}}</p>
  <p><a href="{{CLICK_URL}}" style="background: #0066cc; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Take Action</a></p>
  <p>Regards,<br>{{FROM_NAME}}</p>
</body>
</html>',
    'Dear {{FIRST_NAME}},

{{body}}

Click here: {{CLICK_URL}}

Regards,
{{FROM_NAME}}',
    FALSE
);

-- Default target group so campaigns can be
-- created immediately without setup
INSERT INTO target_groups (id, name, description)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Default Group',
    'Default target group — add targets before launching'
);
