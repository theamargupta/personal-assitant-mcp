# Supabase Clients
- `server.ts` — SSR client (respects RLS) for server components and user-authed API routes.
- `service-role.ts` — backend-only, bypasses RLS. NEVER import from a client component.

All server-only modules start with `import 'server-only';`.
