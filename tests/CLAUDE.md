# Tests (vitest)
- Unit tests go in `tests/unit/<module>.test.ts` (or mirror the source tree).
- Integration tests that hit Supabase MUST use a test project, never prod.
- Run: `npm run test` (one-shot), `npm run test:watch`, `npm run test:coverage`.
- Mocking Supabase: wrap the service-role client behind a factory and inject in tests — do not stub `@supabase/supabase-js` globally.
