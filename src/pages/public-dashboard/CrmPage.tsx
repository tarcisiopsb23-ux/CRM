/**
 * CrmPage — Clientes / Contatos
 *
 * Formulário expandido com seções:
 *   1. Identificação  (nome, tipo, CPF/CNPJ, nascimento)
 *   2. Contato        (whatsapp, telefone, e-mail, empresa)
 *   3. Endereço       (CEP + busca automática)
 *   4. Origem         (canal, campanha, UTMs)
 *   5. Campos personalizados (entity_type = 'contact')
 *
 * Detecta possíveis duplicatas antes de salvar.
 */
import { useRef, useState, useEffect, useCallback } from "react";
import {
  Plus, Search, Upload, FileSpreadsheet, Pencil, Trash2,
  Loader2, Users, AlertCircle, CheckCircle2, Download, X,
  MapPin, Building2, Phone, Mail, ChevronDown, ChevronUp,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useCrmContacts, type CrmContact, type CrmContactInput } from "@/hooks/useCrmContacts";
import { useCepLookup } from "@/hooks/useCepLookup";
import { formatCep, normalizeCep } from "@/lib/cep-service";
import { PageHeader } from "./components/PageHeader";
import { CredentialsErrorState } from "./components/CredentialsErrorState";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import type { CrmCustomField } from "./components/CrmSettingsPanel";

// ─── Helpers de importação ────────────────────────────────────────────────────

interface ImportRow extends CrmContactInput { _error?: string; }

function parseContactRows(rows: Record<string, unknown>[]): ImportRow[] {
  return rows.map((row, i) => {
    const get = (...keys: string[]) => {
      for (const k of keys) {
        const found = Object.keys(row).find(rk => rk.toLowerCase().trim() === k.toLowerCase());
        if (found !== undefined) return String(row[found] ?? "").trim();
      }
      return "";
    };
    const name = get("nome", "name", "contato", "contact");
    const errors: string[] = [];
    if (!name) errors.push("nome obrigatório");
    return {
      name:     name || `(linha ${i + 2})`,
      phone:    get("telefone", "phone", "celular") || null,
      whatsapp: get("whatsapp", "zap", "wpp") || null,
      email:    get("email", "e-mail") || null,
      source:   get("origem", "source", "canal") || "import",
      _error:   errors.length > 0 ? errors.join(", ") : undefined,
    } as ImportRow;
  });
}

function downloadContactTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([
    { nome: "João Silva", whatsapp: "11999998888", email: "joao@email.com", origem: "instagram" },
    { nome: "Maria Santos", whatsapp: "11988887777", email: "", origem: "whatsapp" },
  ], { header: ["nome", "whatsapp", "email", "origem"] });
  ws["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 28 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, "Contatos");
  XLSX.writeFile(wb, "modelo_contatos.xlsx");
}

// ─── Formulário de contato ────────────────────────────────────────────────────

interface ContactFormProps {
  initial?: Partial<CrmContact>;
  clientId: string;
  customFields: CrmCustomField[];
  onSave: (data: CrmContactInput, customValues: Record<string, string>) => void;
  onCancel: () => void;
  saving: boolean;
}

function Section({ title, icon, children, defaultOpen = true }: {
  title: string; icon?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full group">
        <div className="flex items-center gap-2">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
            {title}
          </p>
        </div>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && <div className="space-y-3">{children}</div>}
    </div>
  );
}

function ContactForm({ initial, clientId, customFields, onSave, onCancel, saving }: ContactFormProps) {
  // ── Identificação ──
  const [name,        setName]        = useState(initial?.name        ?? "");
  const [lastName,    setLastName]    = useState(initial?.last_name   ?? "");
  const [contactType, setContactType] = useState<"person"|"company">(initial?.contact_type ?? "person");
  const [cpf,         setCpf]         = useState(initial?.cpf         ?? "");
  const [cnpj,        setCnpj]        = useState(initial?.cnpj        ?? "");
  const [birthdate,   setBirthdate]   = useState(initial?.birthdate   ?? "");
  const [company,     setCompany]     = useState(initial?.company     ?? "");
  const [jobTitle,    setJobTitle]    = useState(initial?.job_title   ?? "");
  // ── Contato ──
  const [whatsapp, setWhatsapp] = useState(initial?.whatsapp ?? initial?.phone ?? "");
  const [phone,    setPhone]    = useState(initial?.phone    ?? "");
  const [phone2,   setPhone2]   = useState(initial?.phone2   ?? "");
  const [email,    setEmail]    = useState(initial?.email    ?? "");
  const [email2,   setEmail2]   = useState(initial?.email2   ?? "");
  // ── Endereço ──
  const [zipCode,      setZipCode]      = useState(initial?.zip_code      ? formatCep(initial.zip_code) : "");
  const [street,       setStreet]       = useState(initial?.street        ?? "");
  const [streetNumber, setStreetNumber] = useState(initial?.street_number ?? "");
  const [complement,   setComplement]   = useState(initial?.complement    ?? "");
  const [neighborhood, setNeighborhood] = useState(initial?.neighborhood  ?? "");
  const [city,         setCity]         = useState(initial?.city           ?? "");
  const [state,        setState]        = useState(initial?.state          ?? "");
  // ── Origem ──
  const [source,       setSource]       = useState(initial?.source         ?? initial?.origin_recent ?? "");
  const [utmSource,    setUtmSource]    = useState(initial?.utm_source     ?? "");
  const [utmMedium,    setUtmMedium]    = useState(initial?.utm_medium     ?? "");
  const [utmCampaign,  setUtmCampaign]  = useState(initial?.utm_campaign   ?? "");
  // ── Status ──
  const [clientStatus, setClientStatus] = useState(initial?.client_status ?? "lead");
  const [notes,        setNotes]        = useState(initial?.notes          ?? "");
  // ── Campos personalizados ──
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  // ── CEP ──
  const { lookup: lookupCep, loading: cepLoading, error: cepError } = useCepLookup();

  const handleCepBlur = async () => {
    const digits = normalizeCep(zipCode);
    if (digits.length !== 8) return;
    const result = await lookupCep(digits);
    if (result) {
      if (result.street)       setStreet(result.street);
      if (result.neighborhood) setNeighborhood(result.neighborhood);
      if (result.city)         setCity(result.city);
      if (result.state)        setState(result.state);
      // Foco no número após preencher
      document.getElementById("street-number")?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Nome é obrigatório."); return; }
    for (const f of customFields) {
      if (f.required && !customValues[f.id]?.trim()) {
        toast.error(`Campo "${f.name}" é obrigatório.`); return;
      }
    }
    onSave({
      name: name.trim(), last_name: lastName.trim() || null,
      contact_type: contactType,
      cpf: normalizeCep(cpf) || null, cnpj: normalizeCep(cnpj) || null,
      birthdate: birthdate || null, company: company.trim() || null,
      job_title: jobTitle.trim() || null,
      whatsapp: whatsapp.trim() || null, phone: phone.trim() || null,
      phone2: phone2.trim() || null, email: email.trim() || null, email2: email2.trim() || null,
      zip_code: normalizeCep(zipCode) || null, street: street.trim() || null,
      street_number: streetNumber.trim() || null, complement: complement.trim() || null,
      neighborhood: neighborhood.trim() || null, city: city.trim() || null,
      state: state.trim().toUpperCase() || null,
      source: source.trim() || null, origin_recent: source.trim() || null,
      utm_source: utmSource.trim() || null, utm_medium: utmMedium.trim() || null,
      utm_campaign: utmCampaign.trim() || null,
      client_status: clientStatus, notes: notes.trim() || null,
    }, customValues);
  };

  const inputCls = "text-sm";
  const labelCls = "text-xs text-muted-foreground";

  return (
    <form onSubmit={handleSubmit} className="space-y-5 py-2">

      {/* ── Identificação ── */}
      <Section title="Identificação" icon={<Users className="h-3.5 w-3.5" />}>
        {/* Tipo de cadastro */}
        <div className="flex gap-2">
          {(["person","company"] as const).map(t => (
            <button key={t} type="button" onClick={() => setContactType(t)}
              className={cn(
                "flex-1 py-2.5 rounded-lg border text-sm font-bold transition-all",
                contactType === t
                  ? "border-violet-500 bg-violet-600 text-white shadow-md"
                  : "border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white"
              )}>
              {t === "person" ? "Pessoa Física" : "Pessoa Jurídica"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 col-span-2 sm:col-span-1">
            <Label className={labelCls}>Nome <span className="text-destructive">*</span></Label>
            <Input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Nome" />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Sobrenome</Label>
            <Input className={inputCls} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Sobrenome" />
          </div>
          {contactType === "person" ? (
            <>
              <div className="space-y-1">
                <Label className={labelCls}>CPF</Label>
                <Input className={inputCls} value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00" maxLength={14} />
              </div>
              <div className="space-y-1">
                <Label className={labelCls}>Data de Nascimento</Label>
                <Input type="date" className={inputCls} value={birthdate} onChange={e => setBirthdate(e.target.value)} />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <Label className={labelCls}>Razão Social / Empresa</Label>
                <Input className={inputCls} value={company} onChange={e => setCompany(e.target.value)} placeholder="Empresa Ltda." />
              </div>
              <div className="space-y-1">
                <Label className={labelCls}>CNPJ</Label>
                <Input className={inputCls} value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000/0001-00" maxLength={18} />
              </div>
            </>
          )}
          {contactType === "person" && (
            <div className="space-y-1 col-span-2 sm:col-span-1">
              <Label className={labelCls}>Empresa</Label>
              <Input className={inputCls} value={company} onChange={e => setCompany(e.target.value)} placeholder="Nome da empresa" />
            </div>
          )}
          <div className="space-y-1">
            <Label className={labelCls}>Cargo</Label>
            <Input className={inputCls} value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="Ex: Gerente, Sócio" />
          </div>
        </div>
      </Section>

      {/* ── Contato ── */}
      <Section title="Contato" icon={<Phone className="h-3.5 w-3.5" />}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className={labelCls}>WhatsApp</Label>
            <Input className={inputCls} value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="(11) 99999-8888" />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Telefone</Label>
            <Input className={inputCls} value={phone} onChange={e => setPhone(e.target.value)} placeholder="(11) 3333-4444" />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Telefone 2</Label>
            <Input className={inputCls} value={phone2} onChange={e => setPhone2(e.target.value)} placeholder="(11) 99999-0000" />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>E-mail</Label>
            <Input type="email" className={inputCls} value={email} onChange={e => setEmail(e.target.value)} placeholder="email@dominio.com" />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>E-mail 2</Label>
            <Input type="email" className={inputCls} value={email2} onChange={e => setEmail2(e.target.value)} placeholder="outro@dominio.com" />
          </div>
        </div>
      </Section>

      {/* ── Endereço ── */}
      <Section title="Endereço" icon={<MapPin className="h-3.5 w-3.5" />} defaultOpen={false}>
        <div className="grid grid-cols-3 gap-3">
          {/* CEP com busca automática */}
          <div className="space-y-1">
            <Label className={labelCls}>CEP</Label>
            <div className="relative">
              <Input className={inputCls}
                value={zipCode}
                onChange={e => setZipCode(e.target.value)}
                onBlur={handleCepBlur}
                placeholder="00000-000"
                maxLength={9}
              />
              {cepLoading && (
                <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
            {cepError && <p className="text-[10px] text-amber-500">{cepError}</p>}
          </div>
          <div className="space-y-1 col-span-2">
            <Label className={labelCls}>Logradouro</Label>
            <Input className={inputCls} value={street} onChange={e => setStreet(e.target.value)} placeholder="Rua, Avenida..." />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Número</Label>
            <Input id="street-number" className={inputCls} value={streetNumber} onChange={e => setStreetNumber(e.target.value)} placeholder="123" />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Complemento</Label>
            <Input className={inputCls} value={complement} onChange={e => setComplement(e.target.value)} placeholder="Sala 2, Apto 101" />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Bairro</Label>
            <Input className={inputCls} value={neighborhood} onChange={e => setNeighborhood(e.target.value)} placeholder="Centro" />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className={labelCls}>Cidade</Label>
            <Input className={inputCls} value={city} onChange={e => setCity(e.target.value)} placeholder="São Paulo" />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Estado (UF)</Label>
            <Input className={inputCls} value={state} onChange={e => setState(e.target.value.toUpperCase())} placeholder="SP" maxLength={2} />
          </div>
        </div>
      </Section>

      {/* ── Origem ── */}
      <Section title="Origem / Aquisição" icon={<Building2 className="h-3.5 w-3.5" />} defaultOpen={false}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className={labelCls}>Origem</Label>
            <Input className={inputCls} value={source} onChange={e => setSource(e.target.value)} placeholder="instagram, google, indicação..." />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>UTM Source</Label>
            <Input className={inputCls} value={utmSource} onChange={e => setUtmSource(e.target.value)} placeholder="google" />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>UTM Medium</Label>
            <Input className={inputCls} value={utmMedium} onChange={e => setUtmMedium(e.target.value)} placeholder="cpc" />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>UTM Campaign</Label>
            <Input className={inputCls} value={utmCampaign} onChange={e => setUtmCampaign(e.target.value)} placeholder="nome-campanha" />
          </div>
        </div>
      </Section>

      {/* ── Gestão ── */}
      <Section title="Informações Adicionais" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className={labelCls}>Status do cliente</Label>
            <Input className={inputCls} value={clientStatus} onChange={e => setClientStatus(e.target.value)} placeholder="lead, prospect, ativo..." />
          </div>
        </div>
        <div className="space-y-1">
          <Label className={labelCls}>Observações</Label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            className={cn("w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground resize-none h-20 focus:outline-none focus:ring-2 focus:ring-ring")}
            placeholder="Anotações sobre o contato..." />
        </div>
      </Section>

      {/* ── Campos personalizados ── */}
      {customFields.filter(f => f.visible !== false).length > 0 && (
        <Section title="Campos Personalizados" defaultOpen={true}>
          <div className="grid grid-cols-2 gap-3">
            {customFields.filter(f => f.visible !== false).map(field => (
              <div key={field.id} className={cn("space-y-1", field.field_type === "textarea" && "col-span-2")}>
                <Label className={labelCls}>
                  {field.name}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                {field.description && <p className="text-[10px] text-muted-foreground/60">{field.description}</p>}
                {(field.field_type === "text" || field.field_type === "phone" || field.field_type === "email" || field.field_type === "url" || field.field_type === "cpf" || field.field_type === "cnpj") && (
                  <Input className={inputCls} value={customValues[field.id] ?? ""} onChange={e => setCustomValues(p => ({...p, [field.id]: e.target.value}))} placeholder={field.placeholder ?? field.name} />
                )}
                {field.field_type === "textarea" && (
                  <textarea value={customValues[field.id] ?? ""} onChange={e => setCustomValues(p => ({...p, [field.id]: e.target.value}))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder={field.placeholder ?? field.name} />
                )}
                {(field.field_type === "number" || field.field_type === "currency" || field.field_type === "percent") && (
                  <Input type="number" className={inputCls} value={customValues[field.id] ?? ""} onChange={e => setCustomValues(p => ({...p, [field.id]: e.target.value}))} placeholder={field.placeholder ?? "0"} />
                )}
                {(field.field_type === "date" || field.field_type === "datetime") && (
                  <Input type={field.field_type === "datetime" ? "datetime-local" : "date"} className={inputCls} value={customValues[field.id] ?? ""} onChange={e => setCustomValues(p => ({...p, [field.id]: e.target.value}))} />
                )}
                {field.field_type === "select" && (
                  <Select value={customValues[field.id] ?? ""} onValueChange={v => setCustomValues(p => ({...p, [field.id]: v}))}>
                    <SelectTrigger className="text-sm"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>{(field.options ?? []).map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {field.field_type === "boolean" && (
                  <div className="flex items-center gap-2 pt-1">
                    <Switch checked={(customValues[field.id] ?? "") === "true"} onCheckedChange={v => setCustomValues(p => ({...p, [field.id]: v ? "true" : "false"}))} />
                    <span className="text-sm text-muted-foreground">{(customValues[field.id] ?? "") === "true" ? "Sim" : "Não"}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button type="submit" disabled={saving} className="bg-gradient-ember text-primary-foreground shadow-glow">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar
        </Button>
      </div>
    </form>
  );
}

// ─── Alerta de duplicata ──────────────────────────────────────────────────────

interface DuplicateAlertProps {
  duplicates: { id: string; name: string; phone: string | null; whatsapp: string | null; email: string | null; match: string }[];
  onDismiss: () => void;
  onView: (id: string) => void;
}
function DuplicateAlert({ duplicates, onDismiss, onView }: DuplicateAlertProps) {
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-amber-400">Possível contato já cadastrado</p>
          <p className="text-xs text-muted-foreground mt-0.5">Encontramos {duplicates.length} contato(s) com dados semelhantes.</p>
        </div>
      </div>
      <div className="space-y-2">
        {duplicates.map(d => (
          <div key={d.id} className="flex items-center justify-between rounded-md border border-border/60 bg-muted/10 px-3 py-2 gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{d.name}</p>
              <p className="text-xs text-muted-foreground">{d.whatsapp || d.phone || d.email || "—"} · conflito: {d.match}</p>
            </div>
            <Button variant="outline" size="sm" className="shrink-0 h-7 text-xs" onClick={() => onView(d.id)}>
              Ver cadastro
            </Button>
          </div>
        ))}
      </div>
      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={onDismiss}>
        Continuar mesmo assim
      </Button>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function CrmPage() {
  const dc = useDynamicClient();
  const { auth } = useClientAuth();
  const clientId = auth?.user?.client_id;
  const canEdit = ["owner", "admin", "manager", "member"].includes(auth?.user?.role ?? "");

  const { data: contacts = [], isLoading, create, update, remove, importBatch, checkDuplicates } =
    useCrmContacts(clientId);

  const [search,       setSearch]       = useState("");
  const [dialogOpen,   setDialogOpen]   = useState(false);
  const [editing,      setEditing]      = useState<CrmContact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CrmContact | null>(null);
  const [importOpen,   setImportOpen]   = useState(false);
  const [importRows,   setImportRows]   = useState<ImportRow[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [pendingSave,  setPendingSave]  = useState<{ data: CrmContactInput; custom: Record<string,string> } | null>(null);
  const [duplicates,   setDuplicates]   = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Campos personalizados de contatos
  const [customFields, setCustomFields] = useState<CrmCustomField[]>([]);
  const fetchCustomFields = useCallback(async () => {
    if (!dc || !clientId) return;
    const { data } = await dc.rpc("get_crm_data", { p_client_id: clientId });
    if (data?.contact_fields) setCustomFields(data.contact_fields as CrmCustomField[]);
    else if (data?.custom_fields) setCustomFields((data.custom_fields as CrmCustomField[]).filter(f => (f.entity_type ?? "deal") === "contact"));
  }, [dc, clientId]);
  useEffect(() => { fetchCustomFields(); }, [fetchCustomFields]);

  if (!dc) return <CredentialsErrorState />;

  const filtered = contacts.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.last_name ?? "").toLowerCase().includes(q) ||
      (c.company ?? "").toLowerCase().includes(q) ||
      (c.phone ?? "").includes(search) ||
      (c.whatsapp ?? "").includes(search) ||
      (c.email ?? "").toLowerCase().includes(q)
    );
  });

  const openCreate = () => { setEditing(null); setDuplicates([]); setPendingSave(null); setDialogOpen(true); };
  const openEdit   = (c: CrmContact) => { setEditing(c); setDuplicates([]); setPendingSave(null); setDialogOpen(true); };

  const handleSave = async (data: CrmContactInput, customValues: Record<string, string>) => {
    if (!clientId) return;
    // Verifica duplicatas apenas na criação
    if (!editing) {
      try {
        const result = await checkDuplicates({
          whatsapp: data.whatsapp ?? undefined,
          phone:    data.phone    ?? undefined,
          email:    data.email    ?? undefined,
          cpf:      data.cpf      ?? undefined,
          cnpj:     data.cnpj     ?? undefined,
        });
        if (result.has_duplicates) {
          setDuplicates(result.duplicates);
          setPendingSave({ data, custom: customValues });
          return; // espera confirmação
        }
      } catch { /* silencioso — não bloqueia */ }
    }
    await executeSave(data, customValues);
  };

  const executeSave = async (data: CrmContactInput, customValues: Record<string, string>) => {
    if (!clientId) return;
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, client_id: clientId, ...data });
        // Salva campos personalizados
        if (Object.keys(customValues).length > 0) {
          await dc.rpc("save_crm_custom_values", {
            p_client_id:   clientId,
            p_entity_id:   editing.id,
            p_entity_type: "contact",
            p_values:      Object.entries(customValues).map(([field_id, value]) => ({ field_id, value })),
          });
        }
        toast.success("Contato atualizado.");
      } else {
        const contactId = await create.mutateAsync({ ...data, client_id: clientId });
        if (contactId && Object.keys(customValues).length > 0) {
          await dc.rpc("save_crm_custom_values", {
            p_client_id:   clientId,
            p_entity_id:   contactId,
            p_entity_type: "contact",
            p_values:      Object.entries(customValues).map(([field_id, value]) => ({ field_id, value })),
          });
        }
        toast.success("Contato criado.");
      }
      setDialogOpen(false); setEditing(null); setDuplicates([]); setPendingSave(null);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Contato arquivado."); setDeleteTarget(null);
    } catch (e: any) { toast.error(e.message); }
  };

  function processFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx","xls","csv"].includes(ext ?? "")) { toast.error("Use .xlsx, .xls ou .csv"); return; }
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
        if (!rows.length) { toast.error("Planilha vazia."); return; }
        setImportRows(parseContactRows(rows));
        setImportOpen(true);
      } catch { toast.error("Erro ao processar arquivo."); }
    };
    reader.readAsArrayBuffer(file);
  }

  const handleImport = async () => {
    const valid = importRows.filter(r => !r._error);
    if (!valid.length || !clientId) return;
    try {
      const rows = valid.map(({ _error: _e, ...r }) => ({ ...r, client_id: clientId }));
      await importBatch.mutateAsync(rows as Array<CrmContactInput & { client_id: string }>);
      toast.success(`${valid.length} contato(s) importado(s)!`);
      setImportOpen(false); setImportRows([]); setImportFileName("");
    } catch (e: any) { toast.error(e.message); }
  };

  const displayName = (c: CrmContact) =>
    [c.name, c.last_name].filter(Boolean).join(" ");

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        title="Clientes"
        description={`${contacts.length} contato${contacts.length !== 1 ? "s" : ""} cadastrado${contacts.length !== 1 ? "s" : ""}`}
        action={canEdit ? (
          <div className="flex items-center gap-2 flex-wrap">
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ""; }} />
            <Button variant="outline" size="sm" onClick={downloadContactTemplate} className="gap-2 text-muted-foreground">
              <Download className="h-4 w-4" /> Modelo
            </Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
              <FileSpreadsheet className="h-4 w-4 text-emerald-400" /> Importar
            </Button>
            <Button onClick={openCreate} className="bg-gradient-ember text-primary-foreground shadow-glow">
              <Plus className="h-4 w-4 mr-1" /> Novo Contato
            </Button>
          </div>
        ) : undefined}
      />

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Nome, empresa, telefone, e-mail..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <Users className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">{search ? "Nenhum contato encontrado." : "Nenhum contato cadastrado ainda."}</p>
          {canEdit && !search && (
            <Button variant="outline" onClick={openCreate} className="border-border">
              <Plus className="h-4 w-4 mr-2" /> Adicionar primeiro contato
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 overflow-hidden">
          {/* Desktop */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent bg-muted/10">
                  <TableHead>Nome</TableHead>
                  <TableHead>WhatsApp / Telefone</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cadastro</TableHead>
                  {canEdit && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(c => (
                  <TableRow key={c.id} className="border-border/60 hover:bg-muted/10">
                    <TableCell className="font-semibold text-foreground">{displayName(c)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{c.whatsapp || c.phone || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{c.email ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{c.company ?? "—"}</TableCell>
                    <TableCell>
                      {c.client_status && (
                        <Badge variant="outline" className="text-[10px] capitalize">{c.client_status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(parseISO(c.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(c)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {/* Mobile */}
          <div className="divide-y divide-border md:hidden">
            {filtered.map(c => (
              <div key={c.id} className="p-4 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{displayName(c)}</p>
                  {c.client_status && <Badge variant="outline" className="text-[10px] capitalize">{c.client_status}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{c.whatsapp || c.phone || c.email || "—"}</p>
                {c.company && <p className="text-xs text-muted-foreground">{c.company}</p>}
                {canEdit && (
                  <div className="flex gap-1 pt-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(c)}>
                      <Pencil className="h-3 w-3 mr-1" /> Editar
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => setDeleteTarget(c)}>
                      <Trash2 className="h-3 w-3 mr-1" /> Arquivar
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) { setDialogOpen(false); setEditing(null); setDuplicates([]); setPendingSave(null); } }}>
        <DialogContent className="border-border bg-card sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? "Editar Contato" : "Novo Contato"}</DialogTitle>
          </DialogHeader>
          {/* Alerta de duplicata */}
          {duplicates.length > 0 && pendingSave && (
            <DuplicateAlert
              duplicates={duplicates}
              onDismiss={() => { executeSave(pendingSave.data, pendingSave.custom); }}
              onView={id => { setDialogOpen(false); const c = contacts.find(x => x.id === id); if (c) openEdit(c); }}
            />
          )}
          {(!duplicates.length || !pendingSave) && (
            <ContactForm
              initial={editing ?? undefined}
              clientId={clientId ?? ""}
              customFields={customFields}
              onSave={handleSave}
              onCancel={() => { setDialogOpen(false); setEditing(null); }}
              saving={create.isPending || update.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog exclusão */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="border-border bg-card sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Arquivar Contato</DialogTitle>
            <DialogDescription>
              Arquivar <strong>{deleteTarget ? displayName(deleteTarget) : ""}</strong>? O contato não aparecerá mais na lista, mas seus dados serão preservados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={remove.isPending}>
              {remove.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Arquivar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog importação */}
      <Dialog open={importOpen} onOpenChange={open => { if (!open) { setImportOpen(false); setImportRows([]); setImportFileName(""); } }}>
        <DialogContent className="border-border bg-card sm:max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-400" /> Importar Contatos
            </DialogTitle>
            <DialogDescription>
              {importFileName} · {importRows.length} linha(s)
              {importRows.some(r => r._error) && (
                <span className="text-destructive ml-1"> · {importRows.filter(r => r._error).length} com erro</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <span><strong className="text-foreground">Colunas:</strong> nome, whatsapp, email, origem</span>
            <Button variant="outline" size="sm" onClick={downloadContactTemplate} className="shrink-0 gap-1.5 h-7 px-2 text-xs">
              <Download className="h-3.5 w-3.5" /> Modelo
            </Button>
          </div>
          <div className="flex-1 overflow-auto rounded-md border border-border min-h-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importRows.map((r, i) => (
                  <TableRow key={i} className={cn("border-border/60", r._error ? "bg-destructive/5" : "")}>
                    <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{r.whatsapp ?? r.phone ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{r.email ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{r.source ?? "—"}</TableCell>
                    <TableCell>
                      {r._error
                        ? <span className="flex items-center gap-1 text-xs text-destructive"><AlertCircle className="h-3.5 w-3.5" />{r._error}</span>
                        : <span className="flex items-center gap-1 text-xs text-emerald-500"><CheckCircle2 className="h-3.5 w-3.5" />Ok</span>
                      }
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter className="gap-2 pt-2">
            {importRows.some(r => r._error) && (
              <p className="text-xs text-muted-foreground mr-auto">Linhas com erro serão ignoradas.</p>
            )}
            <Button variant="ghost" onClick={() => { setImportOpen(false); setImportRows([]); }}>Cancelar</Button>
            <Button onClick={handleImport} disabled={importBatch.isPending || importRows.filter(r => !r._error).length === 0}
              className="bg-gradient-ember text-primary-foreground shadow-glow">
              {importBatch.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importando...</>
                : <><Upload className="h-4 w-4 mr-2" />Importar {importRows.filter(r => !r._error).length} contato(s)</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
