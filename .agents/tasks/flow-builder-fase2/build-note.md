# Build Note — Fase 2 Fix Iteration

## Command
```
npm run build
```
Executed in `c:/automacoes/C8 Control`.

## Result: PASS ✓

Build completed successfully in ~1m 10s. 0 TypeScript errors.

Only pre-existing warnings (acceptable per brief):
- `[plugin vite:esbuild]` duplicate key warnings in `assembleContract.ts` and `useContractAssembly.ts` (unrelated to this feature)
- Some chunks larger than 600 kB (vendor bundles, pre-existing)
- Dynamic import collision warning for `proposalSlug.ts` (pre-existing)

## Changes in this iteration

### Finding fixed: `description-wipeout-on-autosave` (blocking)

**File:** `src/pages/public-dashboard/flow-builder/FlowBuilderPage.tsx`

- Added `const [description, setDescription] = useState<string | null>(null)` state variable.
- Initialized it from `flow.description ?? null` in the same `useEffect` that initializes `name`.
- Passed `description: description ?? undefined` to `upsertFlow` inside `doSave`.
- Added `description` to `doSave`'s `useCallback` dep array.

Before this fix, every auto-save from the editor would call `upsertFlow` without a `description` field, which defaulted to `null` in the hook and was written as `NULL` to the `description` column by the RPC's UPDATE path — silently wiping any description set at flow creation.

### Finding fixed: `set-flow-status-no-status-validation` (advisory)

**File:** `migrations/158_chatbot_flows_rpc.sql`

- Added explicit `IF p_status NOT IN ('draft', 'active', 'archived') THEN RAISE EXCEPTION 'invalid_status'; END IF;` before the archive block in `set_flow_status`.

This surfaces invalid status strings as a clear domain-level `invalid_status` exception rather than a cryptic Postgres CHECK constraint violation.
