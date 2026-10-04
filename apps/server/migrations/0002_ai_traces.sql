-- AI request traces (docs/adr/0017-ai-gateway.md §7).
-- DM data, not canonical state: one row per AI request, append-only.
-- Traces never reference the event store; they record that no canonical
-- event was produced (Stage 100) inside the trace document itself.

CREATE TABLE ltw_ai_traces (
  trace_id text PRIMARY KEY,
  campaign_id text NOT NULL,
  actor_id text NOT NULL,
  purpose text NOT NULL,
  status text NOT NULL,
  trace jsonb NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX ltw_ai_traces_by_campaign ON ltw_ai_traces (campaign_id, created_at);

CREATE TRIGGER ltw_ai_traces_append_only
  BEFORE UPDATE OR DELETE ON ltw_ai_traces
  FOR EACH ROW EXECUTE FUNCTION ltw_reject_history_rewrite();
CREATE TRIGGER ltw_ai_traces_no_truncate
  BEFORE TRUNCATE ON ltw_ai_traces
  FOR EACH STATEMENT EXECUTE FUNCTION ltw_reject_history_rewrite();
