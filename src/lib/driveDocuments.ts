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

function coerceFiles(payload: unknown): DriveDocumentItem[] {
  let rawFiles: unknown = payload;
  if (isRecord(payload)) {
    const data = payload.data;
    if (Array.isArray(payload.files)) rawFiles = payload.files;
    else if (isRecord(data) && Array.isArray(data.files)) rawFiles = data.files;
    else if (Array.isArray(payload.items)) rawFiles = payload.items;
    else if (Array.isArray(data)) rawFiles = data;
  }

  if (!Array.isArray(rawFiles)) return [];

  return rawFiles
    .map((f) => {
      if (!isRecord(f)) return null;
      const name = String(f.name ?? f.title ?? "").trim();
      if (!name) return null;
      const size =
        typeof f.size === "number"
          ? f.size
          : typeof f.size === "string" && f.size.trim()
            ? Number(f.size)
            : undefined;
      return {
        id: f.id ? String(f.id) : undefined,
        name,
        url: f.url ? String(f.url) : f.webViewLink ? String(f.webViewLink) : f.link ? String(f.link) : undefined,
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

  if (!Array.isArray(rawItems)) return [];

  return rawItems
    .map((f) => {
      if (!isRecord(f)) return null;
      const mimeType = f.mimeType ? String(f.mimeType) : "";
      const isFolder =
        String(f.type ?? f.kind ?? "").toLowerCase() === "folder" ||
        mimeType === "application/vnd.google-apps.folder" ||
        mimeType.includes("folder");
      if (!isFolder) return null;
      const id = String(f.id ?? "").trim();
      const name = String(f.name ?? f.title ?? "").trim();
      if (!id || !name) return null;
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
  const webhookUrl = getN8nWebhookUrl(input.config);
  if (!webhookUrl) throw new Error("Integração n8n não configurada (URL Base / Caminho do Webhook).");

  const authHeaders = buildAuthHeaders(input.config);

  const tryGet = async () => {
    const url = new URL(webhookUrl);
    url.searchParams.set("action", "documents.list");
    url.searchParams.set("folderId", input.folderId);
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { ...authHeaders },
    });
    if (!res.ok) throw new Error(`Falha ao listar documentos (${res.status})`);
    return coerceFiles(await res.json());
  };

  const tryPostJson = async () => {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ action: "documents.list", folderId: input.folderId }),
    });
    if (!res.ok) throw new Error(`Falha ao listar documentos (${res.status})`);
    return coerceFiles(await res.json());
  };

  try {
    return await tryGet();
  } catch {
    return await tryPostJson();
  }
}

export async function listDriveFolderFolders(input: {
  config: N8nConfig | undefined;
  folderId: string;
}): Promise<DriveFolderItem[]> {
  const webhookUrl = getN8nWebhookUrl(input.config);
  if (!webhookUrl) throw new Error("Integração n8n não configurada (URL Base / Caminho do Webhook).");

  const authHeaders = buildAuthHeaders(input.config);

  const tryGet = async () => {
    const url = new URL(webhookUrl);
    url.searchParams.set("action", "documents.folders.list");
    url.searchParams.set("folderId", input.folderId);
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { ...authHeaders },
    });
    if (!res.ok) throw new Error(`Falha ao listar pastas (${res.status})`);
    return coerceFolders(await res.json());
  };

  const tryPostJson = async () => {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ action: "documents.folders.list", folderId: input.folderId }),
    });
    if (!res.ok) throw new Error(`Falha ao listar pastas (${res.status})`);
    return coerceFolders(await res.json());
  };

  try {
    return await tryGet();
  } catch {
    return await tryPostJson();
  }
}

export async function createDriveFolder(input: {
  config: N8nConfig | undefined;
  parentFolderId: string;
  name: string;
}): Promise<DriveFolderItem> {
  const webhookUrl = getN8nWebhookUrl(input.config);
  if (!webhookUrl) throw new Error("Integração n8n não configurada (URL Base / Caminho do Webhook).");
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
  const payload = await res.json();
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
  const webhookUrl = getN8nWebhookUrl(input.config);
  if (!webhookUrl) throw new Error("Integração n8n não configurada (URL Base / Caminho do Webhook).");

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
