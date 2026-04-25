import type { N8nConfig } from "@/types/settings";

export type DriveDocumentItem = {
  id?: string;
  name: string;
  url?: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: number;
};

export type DriveFolderItem = {
  id: string;
  name: string;
  url?: string;
  modifiedTime?: string;
};

function joinUrl(baseUrl: string, path: string) {
  const base = baseUrl.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

/**
 * Em desenvolvimento, redireciona URLs absolutas do n8n para o proxy local do Vite
 * (/n8n-proxy/...) evitando bloqueio de CORS.
 * Em produção, retorna a URL original sem alteração.
 */
function toProxiedUrl(url: string): string {
  if (import.meta.env.DEV) {
    try {
      const parsed = new URL(url);
      return `/n8n-proxy${parsed.pathname}${parsed.search}`;
    } catch {
      return url;
    }
  }
  return url;
}

export function getN8nWebhookUrl(config: N8nConfig | undefined): string | null {
  const baseUrl = config?.baseUrl?.trim();
  const webhookPath = config?.webhookPath?.trim();
  if (!baseUrl || !webhookPath) return null;
  return joinUrl(baseUrl, webhookPath);
}

export function extractDriveFolderId(input: string | null | undefined): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  if (/^[a-zA-Z0-9_-]{10,}$/.test(raw) && !raw.includes("http")) return raw;

  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/drive\/u\/\d+\/folders\/([a-zA-Z0-9_-]+)/,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

export function normalizeDriveFolderUrl(input: string | null | undefined): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const id = extractDriveFolderId(raw);
  if (!id) return raw.startsWith("http") ? raw : null;
  return `https://drive.google.com/drive/folders/${id}`;
}

function buildAuthHeaders(config: N8nConfig | undefined): Record<string, string> {
  const apiKey = config?.apiKey?.trim();
  if (!apiKey) return {};
  return {
    "x-api-key": apiKey,
    Authorization: `Bearer ${apiKey}`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Lê o body da resposta como JSON de forma segura — retorna null se vazio ou inválido */
async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function coerceFiles(payload: unknown): DriveDocumentItem[] {
  let rawFiles: unknown = payload;
  if (isRecord(payload)) {
    const data = payload.data;
    if (Array.isArray(payload.files)) rawFiles = payload.files;
    else if (isRecord(data) && Array.isArray(data.files)) rawFiles = data.files;
    else if (Array.isArray(payload.items)) rawFiles = payload.items;
    else if (Array.isArray(data)) rawFiles = data;
  }
  // Array direto (lastNode mode ou resposta já filtrada)
  if (Array.isArray(payload) && rawFiles === payload) rawFiles = payload;

  if (!Array.isArray(rawFiles)) return [];

  // Normaliza itens que podem vir como { json: {...} } (formato interno do n8n)
  const normalized = rawFiles.map((item) => {
    if (isRecord(item) && isRecord(item.json)) return item.json;
    return item;
  });

  return normalized
    .map((f) => {
      if (!isRecord(f)) return null;
      const name = String(f.name ?? f.title ?? "").trim();
      if (!name) return null;

      // Exclui pastas da lista de arquivos
      const mimeType = f.mimeType ? String(f.mimeType) : "";
      const typeStr = String(f.type ?? f.kind ?? "").toLowerCase();
      if (
        mimeType === "application/vnd.google-apps.folder" ||
        mimeType.includes("folder") ||
        typeStr === "folder"
      ) return null;
      const size =
        typeof f.size === "number"
          ? f.size
          : typeof f.size === "string" && f.size.trim()
            ? Number(f.size)
            : undefined;
      return {
        id: f.id ? String(f.id) : undefined,
        name,
        // Tenta url, webViewLink, link — e como fallback constrói a URL a partir do id
        url: f.url
          ? String(f.url)
          : f.webViewLink
            ? String(f.webViewLink)
            : f.link
              ? String(f.link)
              : f.id
                ? `https://drive.google.com/file/d/${String(f.id)}/view`
                : undefined,
        mimeType: f.mimeType ? String(f.mimeType) : undefined,
        modifiedTime: f.modifiedTime ? String(f.modifiedTime) : f.modified_at ? String(f.modified_at) : undefined,
        size: Number.isFinite(size) ? size : undefined,
      } satisfies DriveDocumentItem;
    })
    .filter(Boolean) as DriveDocumentItem[];
}

function coerceFolders(payload: unknown): DriveFolderItem[] {
  let rawItems: unknown = payload;

  if (isRecord(payload)) {
    const data = payload.data;
    if (Array.isArray(payload.folders)) rawItems = payload.folders;
    else if (isRecord(data) && Array.isArray(data.folders)) rawItems = data.folders;
    else if (Array.isArray(payload.items)) rawItems = payload.items;
    else if (Array.isArray(data)) rawItems = data;
  }
  // Array direto (lastNode mode ou resposta já filtrada)
  if (Array.isArray(payload) && rawItems === payload) rawItems = payload;

  if (!Array.isArray(rawItems)) return [];

  // Normaliza itens que podem vir como { json: {...} } (formato interno do n8n)
  const normalized = rawItems.map((item) => {
    if (isRecord(item) && isRecord(item.json)) return item.json;
    return item;
  });

  return normalized
    .map((f) => {
      if (!isRecord(f)) return null;
      const id = String(f.id ?? "").trim();
      const name = String(f.name ?? f.title ?? "").trim();
      if (!id || !name) return null;

      // Se mimeType estiver presente, filtra apenas pastas.
      // Se não estiver (n8n já retornou lista filtrada), aceita o item.
      const mimeType = f.mimeType ? String(f.mimeType) : "";
      if (mimeType) {
        const isFolder =
          String(f.type ?? f.kind ?? "").toLowerCase() === "folder" ||
          mimeType === "application/vnd.google-apps.folder" ||
          mimeType.includes("folder");
        if (!isFolder) return null;
      }

      return {
        id,
        name,
        url: f.url ? String(f.url) : f.webViewLink ? String(f.webViewLink) : f.link ? String(f.link) : undefined,
        modifiedTime: f.modifiedTime ? String(f.modifiedTime) : f.modified_at ? String(f.modified_at) : undefined,
      } satisfies DriveFolderItem;
    })
    .filter(Boolean) as DriveFolderItem[];
}

export async function listDriveFolderDocuments(input: {
  config: N8nConfig | undefined;
  folderId: string;
}): Promise<DriveDocumentItem[]> {
  const rawUrl = input.config?.driveFolderManualWebhookUrl?.trim() || getN8nWebhookUrl(input.config);
  if (!rawUrl) throw new Error("Webhook do Drive não configurado. Configure em Configurações → n8n → Ações Manuais no Drive.");
  const webhookUrl = toProxiedUrl(rawUrl);
  const authHeaders = buildAuthHeaders(input.config);

  // Tenta GET primeiro (compatível com workflow drive.json), depois POST (drive-folder-manual)
  const tryGet = async () => {
    const url = new URL(webhookUrl, window.location.origin);
    url.searchParams.set("action", "documents.list");
    url.searchParams.set("folderId", input.folderId);
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { ...authHeaders },
    });
    if (!res.ok) throw new Error(`GET ${res.status}`);
    return coerceFiles(await safeJson(res));
  };

  const tryPost = async () => {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ action: "documents.list", folderId: input.folderId }),
    });
    if (!res.ok) throw new Error(`Falha ao listar documentos (${res.status})`);
    return coerceFiles(await safeJson(res));
  };

  try {
    return await tryGet();
  } catch {
    return await tryPost();
  }
}

export async function listDriveFolderFolders(input: {
  config: N8nConfig | undefined;
  folderId: string;
}): Promise<DriveFolderItem[]> {
  const rawUrl = input.config?.driveFolderManualWebhookUrl?.trim() || getN8nWebhookUrl(input.config);
  if (!rawUrl) throw new Error("Webhook do Drive não configurado. Configure em Configurações → n8n → Ações Manuais no Drive.");
  const webhookUrl = toProxiedUrl(rawUrl);
  const authHeaders = buildAuthHeaders(input.config);

  const tryGet = async () => {
    const url = new URL(webhookUrl, window.location.origin);
    url.searchParams.set("action", "documents.folders.list");
    url.searchParams.set("folderId", input.folderId);
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { ...authHeaders },
    });
    if (!res.ok) throw new Error(`GET ${res.status}`);
    return coerceFolders(await safeJson(res));
  };

  const tryPost = async () => {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ action: "documents.folders.list", folderId: input.folderId }),
    });
    if (!res.ok) throw new Error(`Falha ao listar pastas (${res.status})`);
    return coerceFolders(await safeJson(res));
  };

  try {
    return await tryGet();
  } catch {
    return await tryPost();
  }
}

export async function createDriveFolder(input: {
  config: N8nConfig | undefined;
  parentFolderId: string;
  name: string;
}): Promise<DriveFolderItem> {
  const rawUrl = input.config?.driveFolderManualWebhookUrl?.trim() || getN8nWebhookUrl(input.config);
  if (!rawUrl) throw new Error("Webhook do Drive não configurado. Configure em Configurações → n8n → Ações Manuais no Drive.");
  const webhookUrl = toProxiedUrl(rawUrl);
  const authHeaders = buildAuthHeaders(input.config);

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({
      action: "documents.folders.create",
      parentFolderId: input.parentFolderId,
      name: input.name,
    }),
  });
  if (!res.ok) throw new Error(`Falha ao criar pasta (${res.status})`);
  const payload = await safeJson(res);
  if (!payload) return { id: "", name: input.name }; // resposta vazia — retorna fallback
  const items = coerceFolders(payload);
  const first = items[0];
  if (first) return first;
  if (isRecord(payload)) {
    const data = payload.data;
    const record = isRecord(data) ? data : payload;
    const id = String(record.id ?? "").trim();
    const name = String(record.name ?? record.title ?? "").trim();
    if (id && name) {
      return {
        id,
        name,
        url: record.url ? String(record.url) : record.webViewLink ? String(record.webViewLink) : record.link ? String(record.link) : undefined,
        modifiedTime: record.modifiedTime ? String(record.modifiedTime) : record.modified_at ? String(record.modified_at) : undefined,
      };
    }
  }
  throw new Error("Resposta inválida ao criar pasta.");
}

export async function uploadDriveFolderDocument(input: {
  config: N8nConfig | undefined;
  folderId: string;
  file: File;
}): Promise<void> {
  const rawUrl = input.config?.driveFolderManualWebhookUrl?.trim() || getN8nWebhookUrl(input.config);
  if (!rawUrl) throw new Error("Webhook do Drive não configurado. Configure em Configurações → n8n → Ações Manuais no Drive.");
  const webhookUrl = toProxiedUrl(rawUrl);
  const authHeaders = buildAuthHeaders(input.config);
  const form = new FormData();
  form.set("action", "documents.upload");
  form.set("folderId", input.folderId);
  form.set("file", input.file);

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { ...authHeaders },
    body: form,
  });
  if (!res.ok) throw new Error(`Falha ao enviar documento (${res.status})`);
}

export async function shareDriveFolder(input: {
  config: N8nConfig | undefined;
  folderId: string;
  name: string;
  email: string;
  role: "reader" | "commenter" | "writer";
}): Promise<void> {
  const rawUrl = input.config?.driveFolderManualWebhookUrl?.trim() || getN8nWebhookUrl(input.config);
  if (!rawUrl) throw new Error("Webhook do Drive não configurado. Configure em Configurações → n8n → Ações Manuais no Drive.");
  const webhookUrl = toProxiedUrl(rawUrl);
  const authHeaders = buildAuthHeaders(input.config);
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ action: "share_access", folderId: input.folderId, name: input.name, email: input.email, role: input.role }),
  });
  if (!res.ok) throw new Error(`Falha ao compartilhar pasta (${res.status})`);
}

export async function revokeDriveFolderAccess(input: {
  config: N8nConfig | undefined;
  folderId: string;
  email: string;
}): Promise<void> {
  const rawUrl = input.config?.driveFolderManualWebhookUrl?.trim() || getN8nWebhookUrl(input.config);
  if (!rawUrl) throw new Error("Webhook do Drive não configurado. Configure em Configurações → n8n → Ações Manuais no Drive.");
  const webhookUrl = toProxiedUrl(rawUrl);
  const authHeaders = buildAuthHeaders(input.config);
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ action: "revoke_access", folderId: input.folderId, email: input.email }),
  });
  if (!res.ok) throw new Error(`Falha ao revogar acesso (${res.status})`);
}

/** Compartilha um arquivo específico (por fileId) no Google Drive */
export async function shareDriveFile(input: {
  config: N8nConfig | undefined;
  fileId: string;
  name: string;
  email: string;
  role: "reader" | "commenter" | "writer";
}): Promise<void> {
  const rawUrl = input.config?.driveFolderManualWebhookUrl?.trim() || getN8nWebhookUrl(input.config);
  if (!rawUrl) throw new Error("Webhook do Drive não configurado. Configure em Configurações → n8n → Ações Manuais no Drive.");
  const webhookUrl = toProxiedUrl(rawUrl);
  const authHeaders = buildAuthHeaders(input.config);
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ action: "share_access", fileId: input.fileId, name: input.name, email: input.email, role: input.role }),
  });
  if (!res.ok) throw new Error(`Falha ao compartilhar arquivo (${res.status})`);
}

/** Exclui uma subpasta do Google Drive */
export async function deleteDriveFolder(input: {
  config: N8nConfig | undefined;
  folderId: string;
}): Promise<void> {
  const rawUrl = input.config?.driveFolderManualWebhookUrl?.trim() || getN8nWebhookUrl(input.config);
  if (!rawUrl) throw new Error("Webhook do Drive não configurado. Configure em Configurações → n8n → Ações Manuais no Drive.");
  const webhookUrl = toProxiedUrl(rawUrl);
  const authHeaders = buildAuthHeaders(input.config);
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ action: "delete_subfolder", folderId: input.folderId }),
  });
  if (!res.ok) throw new Error(`Falha ao excluir pasta (${res.status})`);
}

/** Exclui um arquivo do Google Drive */
export async function deleteDriveFile(input: {
  config: N8nConfig | undefined;
  fileId: string;
}): Promise<void> {
  const rawUrl = input.config?.driveFolderManualWebhookUrl?.trim() || getN8nWebhookUrl(input.config);
  if (!rawUrl) throw new Error("Webhook do Drive não configurado. Configure em Configurações → n8n → Ações Manuais no Drive.");
  const webhookUrl = toProxiedUrl(rawUrl);
  const authHeaders = buildAuthHeaders(input.config);
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ action: "delete_file", fileId: input.fileId }),
  });
  if (!res.ok) throw new Error(`Falha ao excluir arquivo (${res.status})`);
}
