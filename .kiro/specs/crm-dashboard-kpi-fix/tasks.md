# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Views ausentes, tempo médio sem perdidos, canalData sem filtro
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the three bugs exist
  - **Scoped PBT Approach**: Scope each property to the concrete failing case to ensure reproducibility
  - Create `src/tests/crm-dashboard-kpi-fix.exploration.test.ts`
  - Test 1 (Causa 1 — views ausentes): call `supabase.from("client_conversation_kpis").select("*").limit(1)` and assert `error === null` — FAILS with `{ code: "42P01" }` on unfixed code
  - Test 2 (Causa 2 — tempo médio): given leads `[{ status: "fechado", created_at: "2025-01-01", updated_at: "2025-01-03" }, { status: "perdido", created_at: "2025-01-01", updated_at: "2025-01-11" }]`, assert `tempoMedioVidaDias === 6` — FAILS returning `2` on unfixed code (only fechado counted)
  - Test 3 (Causa 3 — canalData sem filtro): given `dateRange = { from: "2025-01-01", to: "2025-01-07" }` and a lead with `created_at = "2024-12-01"`, assert that lead does NOT appear in canalData — FAILS on unfixed code (no date filter applied)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct - it proves the bugs exist)
  - Document counterexamples found to understand root cause
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.3, 1.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Leads fechados preservados no cálculo, Performance e CRM inalterados
  - **IMPORTANT**: Follow observation-first methodology
  - Create `src/tests/crm-dashboard-kpi-fix.preservation.test.ts`
  - Observe: given only `status = 'fechado'` leads, `tempoMedioVidaDias` equals the average of their durations on unfixed code
  - Observe: given empty leads array, `tempoMedioVidaDias` returns `null` on unfixed code
  - Write property-based test: for all non-empty arrays of leads where every lead has `status = 'fechado'`, `tempoMedioVidaDias` equals the arithmetic mean of `(updated_at - created_at)` in days (from Preservation Requirements 3.3 in design)
  - Write property-based test: for any leads array with no `'fechado'` or `'perdido'` entries, `tempoMedioVidaDias` is `null`
  - Write property-based test: for any `dateRange`, leads with `created_at` within the range that have `status = 'fechado'` are included in `canalData.porStatus.fechado`
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for crm-dashboard-kpi-fix (three root causes)

  - [x] 3.1 Create Supabase migration with client_conversation_kpis and client_agent_kpis views
    - Create file `supabase/migrations/20260325000010_kpi_views.sql`
    - Add `DROP VIEW IF EXISTS client_conversation_kpis CASCADE` and `DROP VIEW IF EXISTS client_agent_kpis CASCADE` for idempotency
    - Create `client_conversation_kpis` view: aggregates `conversations` table by `client_id`, `DATE_TRUNC('day', started_at)` as `period_date`, `source`, `campaign` — columns: `client_id`, `period_date`, `source`, `campaign`, `conversations` (COUNT), `bot_finished` (SUM), `human_transfer` (SUM), `leads_identified` (SUM), `conversions` (SUM)
    - Create `client_agent_kpis` view: aggregates by `client_id`, `DATE_TRUNC('day', started_at)` as `period_date`, `agent_name` — columns: `client_id`, `period_date`, `agent_name`, `conversations_started` (COUNT), `conversations_finished` (SUM), `conversions` (SUM)
    - Both views must use `CREATE OR REPLACE VIEW`
    - _Bug_Condition: isBugCondition({ action: 'load_atendimento_tab' }) where viewExists('client_conversation_kpis') = false_
    - _Expected_Behavior: supabase.from("client_conversation_kpis").select("*") returns { error: null }_
    - _Preservation: get_client_data RPC and all other existing views/functions remain unaffected_
    - _Requirements: 2.1, 2.2_

  - [x] 3.2 Fix tempoMedioVidaDias to include status = 'perdido' leads
    - Edit `src/pages/PublicDashboardPage.tsx` in `AtendimentoSection`
    - Replace: `const fechados = data.filter(l => l.status === "fechado" && l.updated_at && l.created_at);`
    - With: `const concluidos = data.filter(l => (l.status === "fechado" || l.status === "perdido") && l.updated_at && l.created_at);`
    - Replace all references to `fechados` in the `tempoMedioVidaDias` calculation with `concluidos`
    - _Bug_Condition: isBugCondition({ action: 'compute_tempo_medio', leadStatus: 'perdido' }) = true_
    - _Expected_Behavior: tempoMedioVidaDias = mean over all leads where status IN ('fechado','perdido')_
    - _Preservation: leads with status = 'fechado' continue to be included (Requirements 3.3)_
    - _Requirements: 2.3, 3.3_

  - [x] 3.3 Add dateRange filter to canalData query and useEffect dependencies
    - Edit `src/pages/PublicDashboardPage.tsx` in `AtendimentoSection`
    - Add `.gte("created_at", dateRange.from).lte("created_at", dateRange.to + "T23:59:59")` to the `supabase.from("crm_leads").select(...)` chain
    - Change `useEffect` dependency array from `[clientId]` to `[clientId, dateRange.from, dateRange.to]`
    - _Bug_Condition: isBugCondition({ action: 'fetch_canal_data', dateRange: { from, to } }) = true_
    - _Expected_Behavior: canalData contains only leads with created_at BETWEEN dateRange.from AND dateRange.to_
    - _Preservation: when dateRange covers all time, results are equivalent to the unfiltered query_
    - _Requirements: 2.4_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Views existem, tempo médio inclui perdidos, canalData respeita período
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run `src/tests/crm-dashboard-kpi-fix.exploration.test.ts` after applying fixes in 3.1, 3.2, 3.3
    - **EXPECTED OUTCOME**: All three property tests PASS (confirms all three bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Leads fechados preservados, comportamentos existentes inalterados
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run `src/tests/crm-dashboard-kpi-fix.preservation.test.ts` after applying all fixes
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation properties still hold after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run all tests in `src/tests/crm-dashboard-kpi-fix.*.test.ts`
  - Verify no TypeScript errors in `src/pages/PublicDashboardPage.tsx` (run `npx tsc --noEmit`)
  - Verify migration file `supabase/migrations/20260325000010_kpi_views.sql` is valid SQL (review manually)
  - Ensure all tests pass; ask the user if questions arise
