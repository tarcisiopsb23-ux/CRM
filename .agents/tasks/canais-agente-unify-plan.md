# Implementation Plan — Unify Chatbot "Canais" + "Meu Agente" into ChatbotCanaisPage

**Scope:** Frontend only. No DB migrations, no `bank_b_full_schema.sql`, no Edge Function changes.
**Goal:** Merge the per-channel agent configuration (currently in `ChatbotAgentePage.tsx`) into `ChatbotCanaisPage.tsx` as an expandable inline section on each channel card, and turn `ChatbotAgentePage.tsx` into a redirect/notice page.

---

## Key data (grounded in code read during exploration)

### Files
- `c:/automacoes/C8 Control/src/pages/public-dashboard/ChatbotCanaisPage.tsx` — 3 channel cards (WhatsApp/Instagram/Facebook), each with 3 quick toggles (Bot IA, Atendimento humano, Flow Personalizado) + a "Configurações de Atendimento" card. Load via `get_agent_channel_config` (singular → `handles_*`/`auto_assign`) and `get_agent_channel_configs` (plural → JSONB keyed by channel_type, currently only `custom_flow_enabled` is read). Save via `saveChannelConfig` (6-param `handles_*` overload) and `saveFlowConfig` (currently 4-param).
- `c:/automacoes/C8 Control/src/pages/public-dashboard/ChatbotAgentePage.tsx` — Tabs with full per-channel config (identity, personality, objective, instructions, behaviors, handoff, outside-hours, system-prompt preview). Load via `get_agent_channel_configs`; save via `useMutation` calling `upsert_agent_channel_config` with all 22 params, plus `bot_active` to `client_ai_settings` (Banco B) and `set_bot_mode`. Still renders a global "Agente ativo" (`bot_active`) toggle card.

### RPC semantics (Banco A — `agent_channel_configs` table)
- Active overload is the **22-param** `upsert_agent_channel_config` (migration `172_custom_flow_per_channel.sql`): `(p_client_id, p_organization_id, p_channel_type, p_is_enabled, p_agent_name, p_agent_role, p_agent_description, p_tone, p_formality, p_use_emojis, p_response_length, p_objective, p_instructions, p_behavior_use_knowledge, p_behavior_collect_data, p_behavior_create_opportunity, p_behavior_handoff, p_handoff_keywords, p_handoff_after_mins, p_respond_outside_hours, p_outside_hours_message, p_custom_flow_enabled)`. Every param after `p_channel_type` has a DEFAULT. The body does `ON CONFLICT (client_id, channel_type) DO UPDATE SET <every column> = <param>` — **so calling it with only a few params overwrites all other columns with their defaults** (this is the wipe hazard).
- A separate **6-param** overload (`p_handles_whatsapp, p_handles_instagram, p_handles_facebook, p_auto_assign`) writes to the `agent_configs` table — a different table. `saveChannelConfig` uses this; it does NOT touch `agent_channel_configs`.
- `get_agent_channel_configs(p_client_id)` returns JSONB keyed by `channel_type` (`whatsapp`, `instagram_dm`, `facebook_dm`, …) with all 20 fields incl. `is_enabled` and `custom_flow_enabled`.
- Runtime (`get_bot_channel_context`) gates the bot on `agent_channel_configs.is_enabled` and returns `channel_config_not_found` when no row exists — so an `agent_channel_configs` row must exist for the bot to respond.

### Channel UI key → DB `channel_type` mapping
- `whatsapp` → `whatsapp`
- `instagram` → `instagram_dm`
- `facebook` → `facebook_dm`

### Routing (App.tsx)
- Both pages are children of `/:slug` (rendered in `PublicDashboardLayout`): `chatbot/canais` and `chatbot/agente`.
- `PublicDashboardSidebar.tsx` keeps "Meu Agente" → `chatbot/agente`, so the page must stay reachable (do not delete it).
- Redirect target from Agente → Canais: `/${slug}/chatbot/canais` (slug-prefixed absolute, matching how `ChatbotCanaisPage` builds its "Ver Integrações" link).

### Build / verify
- `npx tsc --noEmit -p tsconfig.app.json` (run from `c:/automacoes/C8 Control`). `tsconfig.app.json` has `noUnusedLocals: false`, `strict: false` — unused imports do not error.
- Baseline (before changes): exactly one error — `src/components/contracts/settings/ClauseEditor.tsx(91,1): error TS1137`. **This is pre-existing and must NOT be touched.** Acceptance = after changes, `tsc` still reports only that one error (zero new errors).

---

## Design decisions (rationale, one or two sentences each)

1. **`agentConfigs` holds only the 17 editable agent "content" fields** (agent_name … outside_hours_message). `is_enabled` and `custom_flow_enabled` are NOT stored in `agentConfigs` — they are driven by the existing quick toggles (`config.botX` / `config.flowX`). On save we pass `p_is_enabled = config.botX` and `p_custom_flow_enabled = config.flowX`. This avoids duplicating the toggle state and keeps the quick toggles the single source of truth for activation.

2. **`saveAgentConfig` passes `p_is_enabled` mirroring the Bot IA toggle** so saving the agent config never flips the channel on/off contrary to the visible toggle, and keeps the `agent_channel_configs.is_enabled` (which the runtime gates on) consistent with the toggle at save time.

3. **`saveFlowConfig` is rewritten to upsert the full 22-param row** (current `agentConfigs[uiKey]` + `p_custom_flow_enabled = value`) instead of the current 4-param call. Reason: the 22-param `ON CONFLICT DO UPDATE` overwrites every column, so the current 4-param call wipes the agent config whenever a row already exists. Unifying config + flow on one page makes this likely; the rewrite prevents the wipe and also ensures the row exists.

4. **`saveChannelConfig` (Bot IA / Atendimento humano) is left unchanged** (still the 6-param `handles_*`/`auto_assign` write to `agent_configs`). The task says do not break it; this keeps the quick toggles' existing behavior intact. (Known pre-existing limitation, out of scope: the Bot IA quick toggle writes `handles_*` while the runtime gates on `is_enabled`, so toggling Bot IA alone does not create an `agent_channel_configs` row. Saving the agent config or toggling Flow does create/update the row.)

5. **Extract an `AgentConfigSection` helper component** inside `ChatbotCanaisPage.tsx` (above the main component) that renders the expandable trigger + all fields + the per-channel Save button, taking `uiKey`, `cfg`, `onChange`, `onSave`, `saving`, `loading` as props. Avoids triplicating ~80 lines across the 3 channel cards and keeps the file readable.

6. **Omit the System Prompt preview** from the inline section (the task's field list does not include it). Reuse `ChatbotAgentePage`'s `SectionCard` + `BehaviorRow` patterns for visual consistency.

7. **`ChatbotAgentePage` becomes a manual notice + button (not an auto `<Navigate>`)**, per the task wording ("a Card containing a link/button to Canais"). Strip all old logic/imports but keep the named export `ChatbotAgentePage` and a minimal import set.

---

## Implementation steps

- [ ] 1. Add agent-config scaffolding (types, channel map, defaults, imports) to `ChatbotCanaisPage.tsx`.
      Add UI imports: `Input`, `Textarea`, `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` from `@/components/ui/*`, `Slider` from `@/components/ui/slider`. Add lucide imports: `ChevronDown, ChevronUp, Sparkles, Target, FileText, CheckSquare, Save, Clock` (Bot/Users/X already imported). Define `type AgentUiKey = "whatsapp" | "instagram" | "facebook"`. Define `interface AgentChannelConfig` with the 17 content fields (mirror `ChatbotAgentePage`'s `ChannelConfig` minus `is_enabled`/`custom_flow_enabled`; type `handoff_after_mins: number | ""`). Define `CHANNEL_TYPE_MAP: Record<AgentUiKey, string>` = `{ whatsapp: "whatsapp", instagram: "instagram_dm", facebook: "facebook_dm" }`. Define `makeAgentDefault(): AgentChannelConfig` mirroring `ChatbotAgentePage`'s `baseDefault` (agent_name "Assistente", agent_role "Atendimento ao cliente", tone "amigavel", formality 3, use_emojis false, response_length "medio", objective "atendimento", behavior_use_knowledge true, behavior_collect_data true, behavior_create_opportunity false, behavior_handoff true, handoff_keywords [], handoff_after_mins "", respond_outside_hours false, strings "").
      Files: `src/pages/public-dashboard/ChatbotCanaisPage.tsx`
      Verify: `npx tsc --noEmit -p tsconfig.app.json` — still only the ClauseEditor error.

- [ ] 2. Add state for agent configs and wire loading from `get_agent_channel_configs`.
      Add state: `const [agentConfigs, setAgentConfigs] = useState<Record<AgentUiKey, AgentChannelConfig>>({ whatsapp: makeAgentDefault(), instagram: makeAgentDefault(), facebook: makeAgentDefault() })`; `const [agentLoading, setAgentLoading] = useState(true)`; `const [agentSaving, setAgentSaving] = useState<Record<AgentUiKey, boolean>>({ whatsapp: false, instagram: false, facebook: false })`; `const [expanded, setExpanded] = useState<Record<AgentUiKey, boolean>>({ whatsapp: false, instagram: false, facebook: false })`. In the existing `useEffect` that calls `get_agent_channel_configs` (the one currently reading only `custom_flow_enabled`), set `agentLoading(true)` before the call and `agentLoading(false)` in `.finally()`; in the `.then`, for each of the 3 UI keys read the remote object `d[CHANNEL_TYPE_MAP[uiKey]]` and merge over `makeAgentDefault()`, coercing `null`→`""` for `instructions`/`outside_hours_message`/`agent_role`/`agent_description`, `null`→`""` for `handoff_after_mins`, `null`→`[]` for `handoff_keywords`. Keep the existing `config.flowX` assignment from `custom_flow_enabled`. Do NOT map `is_enabled` to `config.botX` (the Bot IA toggle keeps using `handles_*`).
      Files: `src/pages/public-dashboard/ChatbotCanaisPage.tsx`
      Verify: `npx tsc --noEmit -p tsconfig.app.json` — still only the ClauseEditor error.

- [ ] 3. Add the expandable "Configurações do agente" section + per-channel save.
      Create an `AgentConfigSection` component in the same file (above `ChatbotCanaisPage`), mirroring `ChatbotAgentePage`'s `SectionCard`/`BehaviorRow` helpers and field layout. Props: `uiKey: AgentUiKey`, `cfg: AgentChannelConfig`, `onChange: (patch: Partial<AgentChannelConfig>) => void`, `onSave: () => void`, `saving: boolean`, `loading: boolean`, `expanded: boolean`, `onToggle: () => void`. It holds its own `keywordInput` local state (Enter/comma to add, like `ChatbotAgentePage`'s `ChannelTab`). Renders, in order: a "Configurar agente" button row with `ChevronDown`/`ChevronUp`; when `expanded`, while `loading` show a `Loader2` spinner, else render SectionCards: Identidade (agent_name Input, agent_role Input, agent_description Textarea), Personalidade (tone Select amigavel/profissional/descontraido/tecnico, formality Slider 1–5, response_length Select curto/medio/longo, use_emojis Switch), Objetivo (objective Select atendimento/qualificacao/vendas/agendamento/suporte/personalizado), Instruções (instructions Textarea), Comportamentos (4 BehaviorRow switches: behavior_use_knowledge, behavior_collect_data, behavior_create_opportunity, behavior_handoff), Handoff (only when `behavior_handoff`: handoff_keywords chip input + handoff_after_mins number Input), Fora do horário (respond_outside_hours Switch + outside_hours_message Textarea shown when `!respond_outside_hours`, mirroring `ChatbotAgentePage`). End with a per-channel `<Button onClick={onSave} disabled={saving}>Salvar configurações do agente</Button>`. In `ChatbotCanaisPage`, inside each connected channel block (WhatsApp/Instagram/Facebook), below the existing conditional warnings and the Templates button (WhatsApp), render `<AgentConfigSection uiKey={...} cfg={agentConfigs[uiKey]} onChange={patch => setAgentConfigs(p => ({...p, [uiKey]: {...p[uiKey], ...patch}}))} onSave={() => saveAgentConfig(uiKey)} saving={agentSaving[uiKey]} loading={agentLoading} expanded={expanded[uiKey]} onToggle={() => setExpanded(p => ({...p, [uiKey]: !p[uiKey]}))} />`. Add `saveAgentConfig(uiKey: AgentUiKey)` that sets `agentSaving[uiKey]=true`, calls `supabase.rpc("upsert_agent_channel_config", { p_client_id, p_organization_id, p_channel_type: CHANNEL_TYPE_MAP[uiKey], p_is_enabled: config.botWhatsapp|botInstagram|botFacebook (matching uiKey), p_agent_name, p_agent_role, p_agent_description || null, p_tone, p_formality, p_use_emojis, p_response_length, p_objective, p_instructions || null, p_behavior_use_knowledge, p_behavior_collect_data, p_behavior_create_opportunity, p_behavior_handoff, p_handoff_keywords, p_handoff_after_mins === "" ? null : Number(...), p_respond_outside_hours, p_outside_hours_message || null, p_custom_flow_enabled: config.flowWhatsapp|flowInstagram|flowFacebook (matching uiKey) })`, then `toast.success` on success / `toast.error` on error, `agentSaving[uiKey]=false` in finally.
      Files: `src/pages/public-dashboard/ChatbotCanaisPage.tsx`
      Verify: `npx tsc --noEmit -p tsconfig.app.json` — still only the ClauseEditor error.

- [ ] 4. Rewrite `saveFlowConfig` to upsert the full 22-param row (no wipe).
      Replace the current 4-param `upsert_agent_channel_config` call with a full call: pass `p_channel_type: CHANNEL_TYPE_MAP[channel]`, `p_is_enabled` = the matching `config.botX` toggle, `p_custom_flow_enabled: value`, and all 17 content fields from `agentConfigs[channel]` (same null/`handoff_after_mins` coercion as `saveAgentConfig`). Keep the optimistic `config.flowX` update and the existing success/error toasts. This both prevents wiping the agent config and ensures an `agent_channel_configs` row exists for the channel.
      Files: `src/pages/public-dashboard/ChatbotCanaisPage.tsx`
      Verify: `npx tsc --noEmit -p tsconfig.app.json` — still only the ClauseEditor error.

- [ ] 5. Convert `ChatbotAgentePage.tsx` into a redirect/notice page.
      Replace the entire file body with a minimal component that keeps the named export `ChatbotAgentePage`: import only `useNavigate` (react-router-dom), `useClientAuth`, `PageHeader`, `Card`/`CardContent`, `Button`, and a lucide icon (e.g. `Bot`, `ArrowRight`). Pull `slug` from `useClientAuth`. Render `<PageHeader title="Meu Agente" description="..." />` and a `<Card>` containing a notice "Configurações movidas para Chatbot → Canais" plus a `<Button onClick={() => navigate(`/${slug}/chatbot/canais`)}>Ir para Canais</Button>`. Remove all prior logic (`useMutation`, `useDynamicClient`, `configs`, `saveBotMode`, `ChannelTab`, `SectionCard`, `buildSystemPromptPreview`, the `bot_active` global toggle, etc.). Do not delete the file; keep the route (`chatbot/agente`) and sidebar entry working.
      Files: `src/pages/public-dashboard/ChatbotAgentePage.tsx`
      Verify: `npx tsc --noEmit -p tsconfig.app.json` — still only the ClauseEditor error.

- [ ] 6. Final verification.
      From `c:/automacoes/C8 Control` run `npx tsc --noEmit -p tsconfig.app.json`. Confirm the ONLY reported error is the pre-existing `src/components/contracts/settings/ClauseEditor.tsx(91,1): error TS1137` — i.e., zero new errors introduced by `ChatbotCanaisPage.tsx` or `ChatbotAgentePage.tsx`. Then run `npm run build` (`vite build`) and confirm it completes without new errors. Confirm no DB/migration/`bank_b_full_schema.sql` files were modified (frontend-only): `git status` should list only the two `.tsx` files (plus this plan file).
      Files: (verification only)
      Verify: `npx tsc --noEmit -p tsconfig.app.json` → only ClauseEditor error; `npm run build` → succeeds.

---

## What must NOT change
- No new/edited SQL migrations; no edits to `migrations/bank_b_full_schema.sql` or `supabase/functions/provision-client-db/index.ts` (the `bank_b_full_schema` sync rule does not apply — this is frontend-only and touches no Banco B tables).
- Do not modify `ClauseEditor.tsx` (pre-existing TS1137 error is accepted).
- Do not remove the "Configurações de Atendimento" card, the WhatsApp "Gerenciar Templates" button, the existing per-channel quick toggles, `saveChannelConfig`, or the `get_agent_channel_config` (singular) load.
- Do not delete `ChatbotAgentePage.tsx` or its route/sidebar entry.

---

## Verification note (implementation)

**Date:** 2025 — first iteration (no prior review JSON).

**Changes made (frontend only):**
- `src/pages/public-dashboard/ChatbotCanaisPage.tsx`
  - Added UI imports (`Input`, `Textarea`, `Select*`, `Slider`) and lucide icons (`Sparkles`, `Target`, `FileText`, `CheckSquare`, `Save`, `Clock`, `ChevronDown`, `ChevronUp`).
  - Added `AgentUiKey`, `AgentChannelConfig` (17 content fields), `CHANNEL_TYPE_MAP` (`whatsapp`→`whatsapp`, `instagram`→`instagram_dm`, `facebook`→`facebook_dm`), `makeAgentDefault()`, `AGENT_FORMALITY_LABELS`.
  - Added `AgentSectionCard` / `AgentBehaviorRow` helpers and an `AgentConfigSection` component (expandable "Configurar agente" trigger + Identidade/Personalidade/Objetivo/Instruções/Comportamentos/Handoff/Fora-do-horário + per-channel Save), mirroring `ChatbotAgentePage`'s `ChannelTab` minus the active-toggle card and the system-prompt preview.
  - Added `agentConfigs` / `agentLoading` / `agentSaving` / `agentExpanded` state.
  - Extended the existing `get_agent_channel_configs` effect to load all 17 fields per channel (merged over `makeAgentDefault()` with `null`→`""` for strings, `null`→`[]` for `handoff_keywords`, `null`→`""` for `handoff_after_mins`); kept the existing `config.flowX` assignment from `custom_flow_enabled`. Did NOT map `is_enabled` to `config.botX` (Bot IA toggle keeps using `handles_*`).
  - Added `saveAgentConfig(channel)` calling `upsert_agent_channel_config` with all 22 params (`p_is_enabled` mirrors the Bot IA toggle, `p_custom_flow_enabled` mirrors the Flow toggle).
  - Rewrote `saveFlowConfig` to upsert the full 22-param row (instead of the old 4-param call) so toggling Flow no longer wipes the saved agent config and ensures an `agent_channel_configs` row exists.
  - Rendered `<AgentConfigSection>` inside each connected channel card (WhatsApp after Templates button; Instagram/Facebook after the conditional warnings). Collapsed by default; shows a loader while `agentLoading`; toast on save success/error.
  - Left `saveChannelConfig`, the "Configurações de Atendimento" card, the WhatsApp "Gerenciar Templates" button, and the existing per-channel quick toggles untouched.
- `src/pages/public-dashboard/ChatbotAgentePage.tsx`
  - Replaced the full page with a minimal notice + "Ir para Canais" button (navigates to `/${slug}/chatbot/canais`). Removed all old logic (`useMutation`, `useDynamicClient`, `ChannelTab`, `SectionCard`, `buildSystemPromptPreview`, `bot_active` global toggle, `saveBotMode`, etc.). Kept the named export `ChatbotAgentePage` so the `chatbot/agente` route and sidebar entry still resolve.

**What was run:**
- `npx tsc --noEmit -p tsconfig.app.json` (from `c:/automacoes/C8 Control`).
- `npm run build` (= `vite build`).

**Results:**
- `tsc`: PASS for the changed files. The only reported error is the pre-existing `src/components/contracts/settings/ClauseEditor.tsx(91,1): error TS1137: Expression or comma expected.` — not touched, accepted per plan. **Zero new TypeScript errors introduced.**
- `vite build`: PASS — completed in ~44.5s (exit 0). Only a pre-existing chunk-size warning (>600 kB), unrelated to this change.

**Pre-existing-only errors (not introduced here):**
- `src/components/contracts/settings/ClauseEditor.tsx(91,1): error TS1137` (the single accepted baseline error).

**Scope check:** No SQL migrations, no `migrations/bank_b_full_schema.sql`, and no `supabase/functions/provision-client-db/index.ts` edits — frontend-only, so the bank-b schema-sync rule does not apply.

