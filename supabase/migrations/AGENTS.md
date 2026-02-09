# Database Migrations - AGENTS.md

PostgreSQL migrations that define the database schema, RLS policies, and RPCs.

## Migration Naming
Migrations are prefixed with a timestamp (YYYYMMDDHHMMSS).

## Key Logic
- Complex logic like group creation and direct chat setup is often implemented as PostgreSQL functions (RPCs).
- RLS policies ensure data security at the database level.
