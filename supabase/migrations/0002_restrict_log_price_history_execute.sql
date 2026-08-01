-- Supabase's security linter flags log_price_history() as a SECURITY DEFINER
-- function reachable at /rest/v1/rpc/log_price_history by both the anon and
-- authenticated roles.
--
-- It is not exploitable: it is a trigger function, and PostgreSQL refuses
-- direct invocation with "trigger functions can only be called as triggers",
-- which was verified against this database before applying this migration.
-- Revoking EXECUTE is defence in depth — it removes the function from the
-- exposed RPC surface altogether.
--
-- This does not disable price history: PostgreSQL runs trigger functions as
-- part of the DML statement and does not check EXECUTE privilege on them, so
-- prices_history_trigger keeps firing as before.

revoke execute on function public.log_price_history() from anon, authenticated, public;
