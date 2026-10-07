-- Default "where next" for each stage (configuration, not data). A deal only moves on
-- by itself once an admin has added at least one requirement to its stage, so these
-- do nothing until the rules are set up. Admins can change them, add branches (e.g.
-- Custom integrations to Feasibility) and add Live -> Addendum once those fields exist.
INSERT INTO "stage_transitions" ("from_stage", "to_stage", "position") VALUES
  ('lead', 'customer_engagement', 1),
  ('customer_engagement', 'qualified_lead', 1),
  ('qualified_lead', 'proposal', 1),
  ('feasibility', 'proposal', 1),
  ('proposal', 'legal_compliance', 1),
  ('legal_compliance', 'closed_won', 1),
  ('closed_won', 'live_direct', 1);
