# Build Note — Fase 2 Fix Iteration (Review Round 2)

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

## Changes in this iteration (Round 2 — fixing review.json findings)

### Finding fixed: `autosave-dep-array-missing-description` (blocking)

**File:** `src/pages/public-dashboard/flow-builder/FlowBuilderPage.tsx`

- Added `description` to the `useEffect` dependency array for auto-save (was `[nodes, edges, name, initialized, doSave]`, now `[nodes, edges, name, description, initialized, doSave]`).
- `description` was already in `doSave`'s closure, but changes to it alone never scheduled a debounced save. Now any description change triggers the 2-second timer.

### Finding fixed: `question-node-default-handle-no-id` (blocking)

**File:** `src/pages/public-dashboard/flow-builder/FlowNodeTypes/QuestionNode.tsx`

- Changed `{ label: "Resposta" }` → `{ id: "default", label: "Resposta" }` in `sourceHandles`.
- Edge serialisation is now deterministic (`sourceHandle: "default"` instead of `null`), symmetric with the named `"timeout"` handle.

### Finding fixed: `go-to-flow-no-validation` (advisory)

**Files:** `src/pages/public-dashboard/flow-builder/FlowPropertiesPanel.tsx`, `src/pages/public-dashboard/flow-builder/FlowBuilderPage.tsx`

- `FlowPropertiesPanel` now accepts `availableFlows?: ChatbotFlow[]`.
- The free-text UUID `<Input>` for `go_to_flow` was replaced with a `<Select>` populated from `availableFlows`. Shows flow name + "(ativo)" badge for active flows.
- `FlowBuilderPage` passes `flows.filter((f) => f.id !== flowId)` as `availableFlows` (current flow excluded). The `flows` list was already loaded for the activate-conflict check, so no extra RPC call is introduced.

## Build result (Round 2): PASS ✓

Command: `npm run build` in `c:/automacoes/C8 Control`
Completed in ~1m 29s. 0 TypeScript errors. 4006 modules transformed.
Same pre-existing warnings as before (duplicate keys in unrelated files, chunk size notices).
