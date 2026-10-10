# n8n AI Workflows – Call/Video Transcription & Meeting Intelligence

Design for n8n workflows that transcribe calls/videos, generate meeting summaries, extract key points, and store results in Supabase attached to clients/projects.

---

## 1. Overview

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Trigger         │────►│  Transcription   │────►│  Summary + Keys  │
│  (Webhook/Manual)│     │  (Whisper/API)   │     │  (LLM)           │
└──────────────────┘     └──────────────────┘     └────────┬─────────┘
                                                           │
                                                           ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Maestr.IA       │◄────│  Supabase        │◄────│  Store           │
│  (events/projects)│     │  Insert/Update   │     │  (events.metadata)│
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

---

## 2. Storage Strategy

### Option A: `events.metadata` (no schema change)

`events` has `client_id`, `project_id`, `metadata` (JSONB). Store:

```json
{
  "transcription": { "text": "...", "language": "pt-BR", "duration_seconds": 120 },
  "summary": "Reunião discutiu...",
  "key_points": ["Ponto 1", "Ponto 2", "Ações acordadas"],
  "processed_at": "2024-03-05T15:00:00Z"
}
```

### Option B: Dedicated table (recommended for querying)

Create `meeting_transcripts`:

| Column            | Type     | Purpose                                      |
|-------------------|----------|----------------------------------------------|
| id                | UUID     | PK                                           |
| organization_id   | UUID     | Tenant                                       |
| event_id          | UUID     | FK → events (optional)                       |
| client_id         | UUID     | FK → clients                                 |
| project_id        | UUID     | FK → projects (optional)                     |
| source_type       | VARCHAR  | `call` \| `video` \| `upload`                |
| source_url        | TEXT     | URL or storage path                          |
| transcription     | TEXT     | Full transcript                              |
| summary           | TEXT     | Meeting summary                              |
| key_points        | JSONB    | `["point1", "point2"]`                       |
| metadata          | JSONB    | language, duration, model used               |
| created_at        | TIMESTAMPTZ |                                              |

---

## 3. Workflow 1: Transcription Pipeline

### Trigger

- **Manual:** JSON body with `{ "media_url": "...", "event_id": "...", "organization_id": "...", "client_id": "...", "project_id": "..." }`
- **Webhook:** POST with same payload (e.g. from Zoom/Meet webhook after recording)

### Nodes

| # | Node              | Type          | Config |
|---|-------------------|---------------|--------|
| 1 | Webhook / Manual  | Webhook/Manual| Accept JSON |
| 2 | Download/Read     | HTTP Request  | GET media_url, or Read Binary from URL |
| 3 | Transcribe        | OpenAI / Whisper API | Input: audio/video file; Output: text |
| 4 | Extract metadata  | Code          | `language`, `duration` from response |
| 5 | Pass to next      | —             | Output: `{ transcription, event_id, client_id, project_id, org_id }` |

### Whisper (OpenAI) node config

- **Resource:** File
- **Operation:** Transcribe
- **Binary Property:** `data` (from HTTP Request)
- **Model:** `whisper-1`
- **Language:** `pt` (optional, auto-detect if empty)

---

## 4. Workflow 2: Summary & Key Points

### Input (from previous workflow or manual)

```json
{
  "transcription": "Full meeting text...",
  "event_id": "uuid",
  "client_id": "uuid",
  "project_id": "uuid",
  "organization_id": "uuid"
}
```

### Nodes

| # | Node   | Type     | Config |
|---|--------|----------|--------|
| 1 | Input  | Previous workflow output |
| 2 | Prompt | Code / Set | Build prompt from transcription |
| 3 | LLM    | OpenAI Chat / Anthropic | Summary + key points |
| 4 | Parse  | Code     | Split model response into `summary` and `key_points[]` |
| 5 | Output | —        | Structured object for storage |

### LLM prompt (Portuguese)

```
Analise a transcrição da reunião abaixo e retorne um JSON válido com:

1. "summary": resumo conciso da reunião em 2-4 frases
2. "key_points": array de até 10 pontos-chave ou ações acordadas

Transcrição:
{{ $json.transcription }}

Retorne apenas o JSON, sem markdown.
```

### Parse (Code node)

```javascript
const raw = $input.first().json.response || $input.first().json.message?.content;
const text = typeof raw === 'string' ? raw : raw?.text || '';
const parsed = JSON.parse(text.replace(/```json?\n?|\n?```/g, ''));
return [{ json: { summary: parsed.summary, key_points: parsed.key_points } }];
```

---

## 5. Workflow 3: Store in Supabase & Attach

### Input

From Workflow 2:

```json
{
  "transcription": "...",
  "summary": "...",
  "key_points": ["...", "..."],
  "event_id": "uuid",
  "client_id": "uuid",
  "project_id": "uuid",
  "organization_id": "uuid",
  "source_url": "...",
  "source_type": "call"
}
```

### Option A: Update `events.metadata`

| # | Node  | Type    | Config |
|---|-------|---------|--------|
| 1 | Supabase | Supabase | Operation: Update |
|   |         | Table: `events` |
|   |         | Filter: `id = {{ $json.event_id }}` |
|   |         | Update: `metadata` = merge existing with new transcription object |

**Merge logic (Code node before Supabase):**

```javascript
const item = $input.first().json;
// Fetch current event metadata (or use $json.metadata from upstream)
const current = item.current_metadata || {};
const updated = {
  ...current,
  transcription: {
    text: item.transcription,
    summary: item.summary,
    key_points: item.key_points,
    processed_at: new Date().toISOString()
  }
};
return [{ json: { ...item, metadata: updated } }];
```

### Option B: Insert into `meeting_transcripts` (with migration)

| # | Node  | Type    | Config |
|---|-------|---------|--------|
| 1 | Supabase | Supabase | Operation: Insert |
|   |         | Table: `meeting_transcripts` |
|   |         | Rows: `organization_id`, `event_id`, `client_id`, `project_id`, `transcription`, `summary`, `key_points`, `source_url`, `source_type` |

### Attach to client/project

- **client_id / project_id:** passed from trigger; n8n sends them in the insert/update.
- **event_id:** if triggered from an event (e.g. Zoom webhook with event ID), link to that event.
- No extra “attach” step; the FK columns (`client_id`, `project_id`, `event_id`) provide the attachment.

---

## 6. Combined Workflow (All-in-One)

### Flow

```
[Webhook/Manual] 
    → [Get media binary]
    → [Whisper: Transcribe]
    → [Code: Build LLM prompt]
    → [OpenAI: Summary + key points]
    → [Code: Parse JSON]
    → [Supabase: Update events.metadata OR Insert meeting_transcripts]
```

### Webhook payload

```json
{
  "media_url": "https://storage.example.com/recordings/meeting-123.mp3",
  "organization_id": "uuid",
  "event_id": "uuid",
  "client_id": "uuid",
  "project_id": "uuid"
}
```

### Supabase credentials

- Use **Service Role Key** (not anon) so n8n bypasses RLS for automation.
- Store in n8n Credentials.

---

## 7. Migration for `meeting_transcripts` (Optional)

```sql
CREATE TABLE IF NOT EXISTS meeting_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  source_type VARCHAR(50) NOT NULL DEFAULT 'call',
  source_url TEXT,
  transcription TEXT NOT NULL,
  summary TEXT,
  key_points JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_meeting_transcripts_org ON meeting_transcripts(organization_id);
CREATE INDEX idx_meeting_transcripts_event ON meeting_transcripts(event_id);
CREATE INDEX idx_meeting_transcripts_client ON meeting_transcripts(client_id);
CREATE INDEX idx_meeting_transcripts_project ON meeting_transcripts(project_id);

ALTER TABLE meeting_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY meeting_transcripts_all ON meeting_transcripts FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());
```

---

## 8. Error Handling & Retries

| Step          | On Error      | Action                               |
|---------------|---------------|--------------------------------------|
| Download media| 4xx/5xx       | Retry 2x, then fail; log error      |
| Whisper       | Rate limit    | Retry with backoff                  |
| LLM           | Parse error   | Retry with “return valid JSON only” |
| Supabase      | RLS/constraint| Log; ensure Service Role is used    |

---

## 9. External Service Alternatives

| Service    | Use           | n8n Node / Integration |
|-----------|----------------|--------------------------|
| OpenAI    | Whisper + LLM  | Built-in OpenAI node     |
| Anthropic | Summary/keys   | Anthropic node           |
| Deepgram  | Transcription  | HTTP Request to API      |
| AssemblyAI| Transcription  | HTTP Request to API      |

---

## 10. Zoom/Meet Webhook Integration (Optional)

To trigger from Zoom/Meet:

- **Zoom:** Subscribe to `recording.completed`; payload has `download_url`, `topic`, `uuid`.
- **Google Meet:** Use Google Drive API when recording is saved; or use a polling workflow.
- Map `meeting.topic` or calendar event to `event_id` in Maestr.IA; pass `client_id`/`project_id` from event metadata or lookup by attendee.
