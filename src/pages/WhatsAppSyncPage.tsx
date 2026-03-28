import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, RefreshCw, CheckCircle2, XCircle, Clock, MessageCircle, Search } from "lucide-react";
import { IntegrationStatusBadge } from "@/components/crm/IntegrationStatusBadge";
import type { IntegrationStatus } from "@/components/crm/IntegrationStatusBadge";

type WaContact = {
  id: number;
  nome: string;
  telefone: string;
  ultima_mensagem: string | null;
  tipo_mensagem: string | null;
  data_ultima_interacao: string | null;
  status: "pendente" | "negocio" | "nao_negocio";
  observacao: string | null;
  tem_keyword: number;
};

const STATUS_LABEL: Record<WaContact["status"], string> = {
  pendente:    "Pendente",
  negocio:     "É negócio",
  nao_negocio: "Não é negócio",
};

const STATUS_COLOR: Record<WaContact["status"], string> = {
  pendente:    "bg-slate-700 text-slate-300",
  negocio:     "bg-emerald-900/50 text-emerald-400",
  nao_negocio: "bg-red-900/50 text-red-400",
};

export function WhatsAppSyncPage() {
  const navigate = useNavigate();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [waStatus, setWaStatus] = useState<IntegrationStatus>("inativo");
  const [contacts, setContacts] = useState<WaContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todos" | WaContact["status"]>("pendente");
  const [importing, setImporting] = useState<number | null>(null);

  // Load webhook URL from session and auto-fetch contacts
  useEffect(() => {
    const raw = localStorage.getItem("client_auth");
    if (!raw) return;
    const session = JSON.parse(raw);
    const url = session?.metadata?.whatsapp_webhook_url ?? "";
    setWebhookUrl(url);
    if (!url) return;

    // fetch status then auto-load contacts regardless of status
    fetchStatus(url).then(() => {
      fetchContactsFromUrl(url);
    });
  }, []);

  const fetchStatus = async (url: string) => {
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/api/status`);
      const data = await res.json();
      const valid: IntegrationStatus[] = ["conectado", "aguardando_qr", "desconectado", "inativo"];
      setWaStatus(valid.includes(data?.status) ? data.status : "desconectado");
    } catch {
      setWaStatus("desconectado");
    }
  };

  const fetchContactsFromUrl = async (url: string) => {
    if (!url) return;
    setLoading(true);
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/api/contatos`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: WaContact[] = await res.json();
      setContacts(data);
    } catch {
      // silently fail on auto-load
    } finally {
      setLoading(false);
    }
  };

  const fetchContacts = useCallback(async () => {
    if (!webhookUrl) { toast.error("Configure a URL do webhook WhatsApp no Perfil primeiro."); return; }
    setLoading(true);
    try {
      const url = `${webhookUrl.replace(/\/$/, "")}/api/contatos`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: WaContact[] = await res.json();
      setContacts(data);
    } catch {
      toast.error("Erro ao buscar contatos. Verifique se o backend WhatsApp está rodando.");
    } finally {
      setLoading(false);
    }
  }, [webhookUrl]);

  const updateStatus = async (contact: WaContact, newStatus: WaContact["status"]) => {
    if (!webhookUrl) return;
    try {
      await fetch(`${webhookUrl.replace(/\/$/, "")}/api/contatos/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, status: newStatus } : c));
    } catch {
      toast.error("Erro ao atualizar status");
    }
  };

  // Marca como negócio E importa como lead no CRM em uma só ação
  const markAsNegocioAndImport = async (contact: WaContact) => {
    setImporting(contact.id);
    try {
      const { data: existing } = await supabase
        .from("crm_leads").select("id").eq("phone", contact.telefone).maybeSingle();

      if (!existing) {
        const { error } = await supabase.from("crm_leads").insert({
          name: contact.nome,
          phone: contact.telefone,
          origin: "WhatsApp",
          whatsapp_link: `https://wa.me/${contact.telefone.replace(/\D/g, "")}`,
          last_contact_at: contact.data_ultima_interacao,
          notes: contact.ultima_mensagem ? `Última mensagem: ${contact.ultima_mensagem}` : null,
          status: "novo",
        });
        if (error) throw error;
        toast.success(`${contact.nome} importado como lead no CRM`);
      } else {
        toast.info(`${contact.nome} já existe no CRM`);
      }

      await updateStatus(contact, "negocio");
    } catch {
      toast.error("Erro ao importar lead");
    } finally {
      setImporting(null);
    }
  };

  const filtered = contacts.filter(c => {
    const matchFilter = filter === "todos" || c.status === filter;
    const matchSearch = !search || c.nome.toLowerCase().includes(search.toLowerCase()) || c.telefone.includes(search);
    return matchFilter && matchSearch;
  });

  const counts = {
    todos: contacts.length,
    pendente: contacts.filter(c => c.status === "pendente").length,
    negocio: contacts.filter(c => c.status === "negocio").length,
    nao_negocio: contacts.filter(c => c.status === "nao_negocio").length,
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white hover:bg-slate-800"
              onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-black text-white uppercase tracking-tight">WhatsApp → CRM</h1>
              <p className="text-slate-400 text-sm">Classifique contatos e importe como leads</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <IntegrationStatusBadge status={waStatus} />
            <Button onClick={fetchContacts} disabled={loading}
              className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 text-white font-bold gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Sincronizar
            </Button>
          </div>
        </div>

        {/* Status sem URL */}
        {!webhookUrl && (
          <Card className="bg-amber-900/20 border-amber-500/30">
            <CardContent className="py-4 flex items-center gap-3">
              <MessageCircle className="h-5 w-5 text-amber-400 shrink-0" />
              <div>
                <p className="text-amber-300 font-bold text-sm">URL do webhook não configurada</p>
                <p className="text-amber-400/70 text-xs">Configure a URL do backend WhatsApp em <button onClick={() => navigate("/dashboard/profile")} className="underline">Perfil → Integrações</button></p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filtros + busca */}
        {contacts.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white pl-9" placeholder="Buscar por nome ou telefone..." />
            </div>
            <div className="flex gap-1">
              {(["todos", "pendente", "negocio", "nao_negocio"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                    filter === f ? "bg-[#7C3AED] text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                  }`}>
                  {f === "todos" ? `Todos (${counts.todos})` :
                   f === "pendente" ? `Pendentes (${counts.pendente})` :
                   f === "negocio" ? `Negócios (${counts.negocio})` :
                   `Não negócio (${counts.nao_negocio})`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Lista de contatos */}
        {contacts.length === 0 && !loading ? (
          <Card className="bg-[#1E293B] border-slate-800">
            <CardContent className="py-16 text-center text-slate-500">
              <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-bold">Nenhum contato ainda</p>
              <p className="text-xs mt-1">Clique em "Sincronizar" para buscar contatos do WhatsApp</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map(contact => (
              <Card key={contact.id} className="bg-[#1E293B] border-slate-800 hover:border-slate-700 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-full bg-slate-700 flex items-center justify-center text-sm font-black text-white shrink-0">
                      {contact.nome.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-white">{contact.nome}</p>
                        {contact.tem_keyword === 1 && (
                          <span className="text-[10px] bg-yellow-900/40 text-yellow-400 px-1.5 py-0.5 rounded-full font-bold">
                            🔑 keyword
                          </span>
                        )}
                        {contact.tipo_mensagem && contact.tipo_mensagem !== "texto" && (
                          <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded-full font-bold capitalize">
                            {contact.tipo_mensagem.replace("_", " ")}
                          </span>
                        )}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_COLOR[contact.status]}`}>
                          {STATUS_LABEL[contact.status]}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{contact.telefone}</p>
                      {contact.ultima_mensagem && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                          "{contact.tipo_mensagem && contact.tipo_mensagem !== "texto"
                            ? `[${contact.tipo_mensagem.replace("_", " ")}] ${contact.ultima_mensagem}`
                            : contact.ultima_mensagem}"
                        </p>
                      )}
                      {contact.data_ultima_interacao && (
                        <p className="text-[10px] text-slate-600 mt-0.5">
                          {new Date(contact.data_ultima_interacao).toLocaleString("pt-BR")}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      {/* Classificação */}
                      <div className="flex gap-1">
                        <button
                          onClick={() => markAsNegocioAndImport(contact)}
                          disabled={importing === contact.id}
                          title="É negócio — importar como lead"
                          className={`p-1.5 rounded transition-colors ${contact.status === "negocio" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-400 hover:text-emerald-400"} disabled:opacity-50`}>
                          {importing === contact.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => updateStatus(contact, "nao_negocio")}
                          title="Não é negócio"
                          className={`p-1.5 rounded transition-colors ${contact.status === "nao_negocio" ? "bg-red-700 text-white" : "bg-slate-800 text-slate-400 hover:text-red-400"}`}>
                          <XCircle className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => updateStatus(contact, "pendente")}
                          title="Marcar como pendente"
                          className={`p-1.5 rounded transition-colors ${contact.status === "pendente" ? "bg-slate-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-300"}`}>
                          <Clock className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
