-- Retire the `enrollment_token` table. The bootstrap-token flow it
-- powered was replaced by direct human-API-Key (`chk_…`) auth on
-- `POST /v1/agent/register`; the table has had no writers and no
-- readers since that change, so the rows can be dropped along with
-- the table itself. Indexes and constraints scoped to the table are
-- removed implicitly by the DROP TABLE.

DROP TABLE IF EXISTS enrollment_token;
