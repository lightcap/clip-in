# Backlog

## Security

- [ ] **Implement application-level encryption for Peloton tokens** - Currently tokens are stored in plaintext in the `access_token_encrypted` column (see `src/app/api/peloton/connect/route.ts:67-76`). While protected by Supabase RLS and database-level encryption at rest, application-level encryption using the configured `PELOTON_TOKEN_ENCRYPTION_KEY` should be implemented before production deployment.
