-- Default pipeline stages (configuration, not data). Admins can rename them later.
INSERT INTO "pipeline_stages" ("key", "label", "position", "kind") VALUES
  ('lead', 'Lead', 1, 'open'),
  ('customer_engagement', 'Customer Engagement', 2, 'open'),
  ('qualified_lead', 'Qualified Lead', 3, 'open'),
  ('feasibility', 'Feasibility (RICE)', 4, 'open'),
  ('proposal', 'Proposal', 5, 'open'),
  ('legal_compliance', 'Legal & Compliance', 6, 'open'),
  ('closed_won', 'Closed Won', 7, 'won'),
  ('live_direct', 'Live Direct', 8, 'live'),
  ('live_aggregator', 'Live via Aggregator', 9, 'live'),
  ('addendum', 'Addendum', 10, 'change'),
  ('on_hold', 'On Hold', 11, 'parked'),
  ('closed_lost', 'Closed Lost', 12, 'lost'),
  ('terminated', 'Terminated', 13, 'terminated')
ON CONFLICT ("key") DO NOTHING;
