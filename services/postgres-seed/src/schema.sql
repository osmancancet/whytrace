-- WhyTrace Postgres schema for the fictional Aegean State University.
-- Only ever rebuilt by `npm run seed`; agents read it in place through
-- Zetaris JDBC. All timestamps UTC.

DROP TABLE IF EXISTS vpn_sessions;
DROP TABLE IF EXISTS signin_events;
DROP TABLE IF EXISTS identities;

CREATE TABLE identities (
    upn            text PRIMARY KEY,
    display_name   text NOT NULL,
    role           text NOT NULL CHECK (role IN ('staff', 'student', 'faculty', 'admin')),
    department     text NOT NULL,
    mfa_method     text NOT NULL CHECK (mfa_method IN ('push', 'totp', 'sms', 'none')),
    home_country   text NOT NULL,
    manager_upn    text REFERENCES identities(upn),
    created_at     timestamptz NOT NULL
);

CREATE TABLE signin_events (
    event_id          text PRIMARY KEY,
    ts                timestamptz NOT NULL,
    upn               text NOT NULL,
    result            text NOT NULL CHECK (result IN ('success', 'failure', 'mfa_denied', 'mfa_approved')),
    ip                text NOT NULL,
    asn               text,
    asn_org           text,
    country           text,
    city              text,
    device_id         text,
    user_agent        text,
    app               text NOT NULL CHECK (app IN ('mail', 'lms', 'sis', 'vpn', 'portal', 'hr', 'imap')),
    mfa_prompt_count  int DEFAULT 0,
    risk_flag         text,
    via_vpn_appliance text
);

CREATE INDEX signin_events_upn_ts ON signin_events (upn, ts);

CREATE TABLE vpn_sessions (
    session_id    text PRIMARY KEY,
    upn           text NOT NULL,
    ts_start      timestamptz NOT NULL,
    ts_end        timestamptz,
    appliance_id  text NOT NULL,
    client_ip     text,
    assigned_ip   text
);

CREATE INDEX vpn_sessions_upn_ts ON vpn_sessions (upn, ts_start);
