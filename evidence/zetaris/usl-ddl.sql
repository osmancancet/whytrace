-- Unified Semantic Layer DDL — copied verbatim from scripts/zetaris_bootstrap.ts
-- (`uslSteps()`). Six entity tables with inline primary + foreign keys; each is
-- then wired to its source projection by one `ACTIVATE USL TABLE` statement
-- (see below).

COMPILE USL IF NOT EXISTS security_usl DEPLOY NAMESPACE lightning.metastore.whytrace DDL
CREATE TABLE identity (
  upn varchar(64) NOT NULL PRIMARY KEY,
  display_name varchar(128),
  role varchar(16),
  department varchar(64),
  mfa_method varchar(8),
  home_country varchar(2)
);
CREATE TABLE signin_event (
  event_id varchar(32) NOT NULL PRIMARY KEY,
  ts timestamp,
  upn varchar(64) NOT NULL FOREIGN KEY REFERENCES identity(upn),
  result varchar(16),
  ip varchar(45),
  asn varchar(32),
  asn_org varchar(128),
  country varchar(2),
  city varchar(64),
  device_id varchar(32),
  app varchar(16),
  mfa_prompt_count int,
  risk_flag varchar(64),
  via_vpn_appliance varchar(32)
);
CREATE TABLE vpn_session (
  session_id varchar(32) NOT NULL PRIMARY KEY,
  upn varchar(64) NOT NULL FOREIGN KEY REFERENCES identity(upn),
  ts_start timestamp,
  ts_end timestamp,
  appliance_id varchar(32),
  client_ip varchar(45),
  assigned_ip varchar(45)
);
CREATE TABLE mail_event (
  event_id varchar(64) NOT NULL PRIMARY KEY,
  ts timestamp,
  upn varchar(64) FOREIGN KEY REFERENCES identity(upn),
  kind varchar(16),
  verdict varchar(16),
  sender_domain varchar(128),
  detail varchar(1024)
);
CREATE TABLE device (
  device_id varchar(32) NOT NULL PRIMARY KEY,
  owner_upn varchar(64),
  type varchar(32),
  os_version varchar(64),
  managed boolean,
  firmware varchar(64),
  last_seen timestamp
);
CREATE TABLE vulnerability (
  cve_id varchar(32) NOT NULL PRIMARY KEY,
  vendor varchar(128),
  product varchar(128),
  name varchar(256),
  date_added date,
  ransomware_use varchar(32)
);

-- ACTIVATE statements (one per entity) bind each USL table to its source projection:

ACTIVATE USL TABLE lightning.metastore.whytrace.security_usl.identity AS
  SELECT upn, display_name, role, department, mfa_method, home_country
  FROM auth_pg.identities;

ACTIVATE USL TABLE lightning.metastore.whytrace.security_usl.signin_event AS
  SELECT event_id, ts, upn, result, ip, asn, asn_org, country, city, device_id,
         app, mfa_prompt_count, risk_flag, via_vpn_appliance
  FROM auth_pg.signin_events;

ACTIVATE USL TABLE lightning.metastore.whytrace.security_usl.vpn_session AS
  SELECT session_id, upn, ts_start, ts_end, appliance_id, client_ip, assigned_ip
  FROM auth_pg.vpn_sessions;

-- mail_event unions three REST feeds (deliveries, clicks, rules) into one entity:
ACTIVATE USL TABLE lightning.metastore.whytrace.security_usl.mail_event AS
  SELECT CONCAT('d:', COALESCE(d.message_id,'')) AS event_id,
         CAST(d.ts AS TIMESTAMP) AS ts,
         d.recipient_upn AS upn,
         'delivery' AS kind,
         d.verdict AS verdict,
         d.sender_domain,
         CONCAT('subject=', d.subject) AS detail
  FROM MAILGW.deliveries_flat AS d
  UNION ALL
  SELECT CONCAT('c:', COALESCE(c.click_id,'')) AS event_id,
         CAST(c.ts AS TIMESTAMP) AS ts,
         c.upn,
         'click' AS kind,
         NULL AS verdict,
         c.url_domain AS sender_domain,
         c.url AS detail
  FROM MAILGW.clicks_flat AS c
  UNION ALL
  SELECT CONCAT('r:', COALESCE(r.rule_id,'')) AS event_id,
         CAST(r.ts AS TIMESTAMP) AS ts,
         r.upn,
         'rule' AS kind,
         r.action AS verdict,
         NULL AS sender_domain,
         CONCAT('target=', r.target, ' via=', r.created_via) AS detail
  FROM MAILGW.rules_flat AS r;

ACTIVATE USL TABLE lightning.metastore.whytrace.security_usl.device AS
  SELECT COALESCE(device_id,'') AS device_id,
         owner_upn,
         type,
         os_version,
         CAST(managed AS boolean) AS managed,
         firmware,
         CAST(last_seen AS timestamp) AS last_seen
  FROM FILES.assets;

ACTIVATE USL TABLE lightning.metastore.whytrace.security_usl.vulnerability AS
  SELECT COALESCE(k.cve_id,'') AS cve_id,
         k.vendor,
         k.product,
         k.name,
         CAST(k.date_added AS DATE) AS date_added,
         k.ransomware_use
  FROM KEV.cisa_kev_flat AS k;
