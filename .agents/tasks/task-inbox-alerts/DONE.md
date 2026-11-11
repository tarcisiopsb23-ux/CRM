# task-inbox-alerts — DONE

**Status:** completed  
**Final commit:** `d3504e5` — fix: resolve inbox-alerts review findings

---

## Summary of changes

### FEAT-001 — "Minhas Conversas" filter + folder badge counts

**File:** `src/hooks/useOmnichannelInbox.ts`
- Added client-side filter so "Minhas Conversas" shows only conversations assigned to the current user (matches `atendente_id === currentUser.id`).
- Added `folderCounts` computed from the full conversation list: counts for `minhas`, `nao_atribuidas`, `bot_ativo`, `urgentes`, `finalizadas`.
- Subscription cleanup improved: `useEffect` returns a proper cleanup that calls `subscription.unsubscribe()` to prevent stale Realtime listeners.

**File:** `src/pages/public-dashboard/ChatbotAgentePage.tsx`
- Renders numeric badge (count pill) next to each folder label in the left-panel category list.
- "Não Atribuídas" folder is sorted first when it has conversations.
- Removed the Contacts tab from the conversations screen; contacts are accessed via the sidebar.
- Displays the last message preview (single line, truncated) on each conversation card.
- Guard added: conversation list only updates when the new data is for the active folder (prevents flicker when switching folders).

---

### FEAT-002 — Alert bell + profile dialog

**File:** `src/pages/public-dashboard/PublicDashboardLayout.tsx`
- Imported and wired the new `useNotificationAlerts` hook.
- Added two bell icons to the top header bar:
  - **Conversation alerts bell** — shows a red badge with unread count; rings an audio chime (Web Audio API tone) on new messages in conversations assigned to the current user. Clicking it opens a dropdown listing recent alerts.
  - **App alerts bell** — placeholder prepared for future general application notifications.
- Added a **Profile menu** item in the top-right user menu that opens `ProfileDialog`.
- Alert sound can be toggled on/off from the profile dialog; preference persisted in `localStorage`.

**New file:** `src/hooks/useNotificationAlerts.ts`
- Subscribes to `public.omni_conversations` Realtime changes filtered to `atendente_id = currentUser.id`.
- Fires an audio alert (Web Audio API, no external file dependency) when a new message arrives.
- Respects `soundEnabled` toggle stored in `localStorage` under key `c8_alert_sound`.
- Exposes `alerts` array, `unreadCount`, `markAllRead()`, `soundEnabled`, `toggleSound()`.
- Designed to be reusable for other alert categories in the future.

**New file:** (inline in layout) `ProfileDialog`
- Avatar upload (file input → base64, stored in `localStorage` as `c8_avatar`).
- Display name field (stored in `localStorage` as `c8_display_name`).
- Sound alert toggle tied to `useNotificationAlerts`.

---

### Review-finding fixes (commit `d3504e5`)

- **Stale subscriptions:** `useNotificationAlerts` hook's `useEffect` now returns `() => subscription.unsubscribe()` so the Realtime channel is torn down on unmount.
- **Filter guard:** `folderCounts` computation and conversation list updates are now gated to the active folder only, preventing unnecessary re-renders.
- **Polling removed:** switched from a `setInterval` polling approach to pure Realtime subscription for alert detection.

---

## TypeScript check

Only pre-existing error in `ClauseEditor.tsx:91` (unrelated to this task). No new TS errors introduced.
