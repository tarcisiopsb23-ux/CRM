# n8n Workflow — Processamento de Assets de Conteúdo

## Visão Geral

Quando um arquivo é enviado para um item de conteúdo, a Edge Function
`content-upload-asset` dispara um webhook para este workflow n8n.

O workflow:
1. Recebe os metadados do arquivo
2. Faz download do arquivo do bucket `content-staging`
3. Se vídeo → envia para Vimeo API
4. Se imagem/doc → envia para Google Drive (pasta do cliente)
5. Chama o callback `content-asset-callback` com o resultado
6. A Edge Function atualiza `content_assets` e notifica o frontend via Realtime

---

## Configuração no n8n

### Variáveis de ambiente necessárias no n8n

```
SUPABASE_URL          = https://owwaulaenabbdalycusx.supabase.co
CONTENT_API_KEY       = (mesma chave em CONTENT_API_KEY no Supabase)
VIMEO_ACCESS_TOKEN    = (token da conta Vimeo da agência)
VIMEO_FOLDER_ID       = (ID da pasta raiz no Vimeo)
GOOGLE_DRIVE_ROOT_ID  = (ID da pasta raiz no Google Drive)
```

---

## Estrutura do Payload recebido (webhook trigger)

```json
{
  "asset_id":         "uuid",
  "content_item_id":  "uuid",
  "organization_id":  "uuid",
  "client_id":        "uuid",
  "file_name":        "video-entrega.mp4",
  "file_type":        "video",
  "mime_type":        "video/mp4",
  "staging_url":      "https://...supabase.co/storage/v1/object/public/content-staging/...",
  "staging_path":     "org_id/item_id/uuid.mp4",
  "is_final":         true,
  "uploader_type":    "agency"
}
```

---

## Fluxo do Workflow (pseudocódigo n8n)

```
[Webhook Trigger]
       │
       ▼
[Switch: file_type]
  │
  ├─ "video" ──────────────────────────────────────────────────────────┐
  │                                                                    │
  │  [HTTP Request: Download do staging_url]                          │
  │         ↓                                                          │
  │  [Vimeo: Upload via API]                                          │
  │    POST https://api.vimeo.com/me/videos                           │
  │    Authorization: Bearer {VIMEO_ACCESS_TOKEN}                     │
  │    Body: tus upload (streaming)                                    │
  │         ↓                                                          │
  │  [Vimeo: Configurar privacidade]                                  │
  │    PATCH /videos/{video_id}                                       │
  │    { privacy: { embed: "whitelist", view: "disable" } }           │
  │         ↓                                                          │
  │  [Vimeo: Adicionar domínio permitido]                             │
  │    PUT /videos/{video_id}/privacy/domains/c8control.com.br        │
  │         ↓                                                          │
  │  [Set: provider=vimeo, external_id=video_id,                      │
  │         embed_url=https://player.vimeo.com/video/{video_id}]      │
  │                                                                    │
  └─ "image" / "pdf" / "document" ────────────────────────────────────┤
                                                                       │
     [HTTP Request: Download do staging_url]                          │
            ↓                                                          │
     [Google Drive: Buscar/criar pasta do cliente]                    │
       GET https://www.googleapis.com/drive/v3/files                  │
       q: name='{client_id}' and '{ROOT_ID}' in parents               │
            ↓                                                          │
     [Google Drive: Upload do arquivo]                                │
       POST https://www.googleapis.com/upload/drive/v3/files          │
       multipart: metadata + file                                      │
            ↓                                                          │
     [Google Drive: Configurar permissão pública]                     │
       POST /files/{file_id}/permissions                              │
       { type: "anyone", role: "reader" }                             │
            ↓                                                          │
     [Set: provider=google_drive, external_id=file_id,                │
           view_url=https://drive.google.com/file/d/{file_id}/view,   │
           embed_url=https://drive.google.com/file/d/{file_id}/preview]│
                                                                       │
       [Callback para content-asset-callback]  ◄──────────────────────┘
              POST {SUPABASE_URL}/functions/v1/content-asset-callback
              Headers: x-content-api-key: {CONTENT_API_KEY}
              Body: {
                asset_id, success: true,
                external_provider, external_id,
                embed_url, view_url,
                staging_path
              }
```

---

## Tratamento de erro

Se qualquer etapa falhar, o workflow deve chamar o callback com `success: false`:

```json
{
  "asset_id":      "uuid",
  "success":       false,
  "error_message": "Descrição do erro",
  "staging_path":  "path/no/bucket"
}
```

O bucket staging **não** é limpo em caso de erro — o usuário pode reenviar.

---

## Variáveis de configuração no Supabase (Edge Functions)

Adicionar nas secrets das Edge Functions:
```
CONTENT_API_KEY       = chave aleatória segura (usada para autenticar o callback do n8n)
N8N_CONTENT_ASSET_WEBHOOK_URL = URL do webhook n8n deste workflow
```

---

## Pasta do Google Drive por cliente

O workflow cria automaticamente uma pasta com nome `{client_id}` dentro de
`GOOGLE_DRIVE_ROOT_ID` caso não exista. Cada upload vai para a subpasta
`{client_id}/{content_item_id}/`.

Estrutura resultante:
```
📁 C8 Conteúdo (GOOGLE_DRIVE_ROOT_ID)
   📁 {client_id_1}
      📁 {content_item_id_A}
         📄 banner-v1.png
         📄 banner-v2.png
      📁 {content_item_id_B}
         🎬 reels-roteiro.pdf
   📁 {client_id_2}
      ...
```
