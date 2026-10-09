/**
 * PixelTestPage — Página pública de teste de pixels
 *
 * Rota: /pixel-test/:slug
 *
 * Página SEM LOGIN que:
 *   1. Injeta Meta Pixel e GTM/GA4 do cliente (via useTrackingPixel)
 *   2. Permite disparar eventos de teste com um clique
 *   3. Serve como URL para o Google Tag Assistant e Meta Events Manager
 *
 * URL de uso:
 *   Tag Assistant: http://seu-dominio.com/pixel-test/teste-agencia-c8
 *   Dev:           http://localhost:8082/pixel-test/teste-agencia-c8
 *
 * Os dados disparados são fictícios e marcados com test_event_code: "TEST".
 */

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { FlaskConical, CheckCircle2, XCircle, Loader2, Zap, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trackServerSide, type TrackEventName } from "@/hooks/useTrackingPixel";
import { supabase } from "@/lib/supabase";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PixelConfig {
  meta_pixel_id:     string | null;
  gtm_container_id:  string | null;
  ga4_measurement_id: string | null;
  client_id:         string | null;
}

// ─── Eventos disponíveis ──────────────────────────────────────────────────────

const TEST_EVENTS: { name: TrackEventName; label: string; emoji: string }[] = [
  { name: "PageView",             label: "PageView",             emoji: "👁️" },
  { name: "Lead",                 label: "Lead",                 emoji: "🎯" },
  { name: "Contact",              label: "Contact",              emoji: "📞" },
  { name: "Schedule",             label: "Schedule",             emoji: "📅" },
  { name: "Purchase",             label: "Purchase",             emoji: "💰" },
  { name: "CompleteRegistration", label: "CompleteRegistration", emoji: "✅" },
  { name: "ViewContent",          label: "ViewContent",          emoji: "📄" },
];

// ─── Componente de status de pixel ────────────────────────────────────────────

function StatusRow({
  icon, label, value, configured,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  configured: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
      <div className="w-8 flex justify-center">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white/80">{label}</p>
        {configured && value && (
          <p className="text-xs font-mono text-white/40 truncate">{value}</p>
        )}
      </div>
      {configured ? (
        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs gap-1 shrink-0">
          <CheckCircle2 className="h-3 w-3" /> Ativo
        </Badge>
      ) : (
        <Badge variant="outline" className="text-xs text-white/30 border-white/10 shrink-0 gap-1">
          <XCircle className="h-3 w-3" /> Não configurado
        </Badge>
      )}
    </div>
  );
}

// ─── DataLayer manual ────────────────────────────────────────────────────────
// Permite disparar qualquer evento personalizado para o dataLayer do GTM.
// O cliente configura o acionador no GTM e testa aqui sem precisar
// que o C8 Control saiba o que está configurado.

function DataLayerTester() {
  const [eventName, setEventName] = useState("");
  const [extraJson, setExtraJson] = useState("");
  const [log, setLog] = useState<{ event: string; time: string; ok: boolean }[]>([]);

  const push = () => {
    const name = eventName.trim();
    if (!name) return;

    let extra: Record<string, unknown> = {};
    if (extraJson.trim()) {
      try {
        extra = JSON.parse(extraJson.trim());
      } catch {
        setLog(prev => [{ event: `JSON inválido: ${extraJson}`, time: new Date().toLocaleTimeString("pt-BR"), ok: false }, ...prev].slice(0, 10));
        return;
      }
    }

    (window as any).dataLayer = (window as any).dataLayer ?? [];
    (window as any).dataLayer.push({ event: name, ...extra });

    setLog(prev => [
      { event: name, time: new Date().toLocaleTimeString("pt-BR"), ok: true },
      ...prev,
    ].slice(0, 10));
    setEventName("");
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">
          Disparar evento personalizado no dataLayer
        </p>
        <p className="text-[11px] text-white/25 leading-relaxed">
          Configure no GTM um acionador do tipo <code className="font-mono text-white/40">Evento personalizado</code> com
          o nome do evento. Depois dispare aqui para testar.
        </p>
      </div>

      <div className="space-y-2">
        <input
          type="text"
          value={eventName}
          onChange={e => setEventName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && push()}
          placeholder='Nome do evento — ex: c8_whatsapp_click'
          className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50 font-mono"
        />
        <textarea
          value={extraJson}
          onChange={e => setExtraJson(e.target.value)}
          placeholder={'Dados extras (JSON opcional):\n{ "categoria": "contato", "label": "whatsapp" }'}
          rows={2}
          className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white/60 placeholder-white/15 focus:outline-none focus:border-violet-500/50 font-mono resize-none"
        />
        <button
          onClick={push}
          disabled={!eventName.trim()}
          className="w-full rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition-colors"
        >
          → dataLayer.push({"{"}event: "{eventName || 'nome-do-evento'}"{"}"})
        </button>
      </div>

      {/* Log dos eventos disparados */}
      {log.length > 0 && (
        <div className="space-y-1 border-t border-white/5 pt-3">
          <p className="text-[10px] text-white/20 uppercase tracking-wider">Disparados</p>
          {log.map((entry, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className={entry.ok ? "text-emerald-400" : "text-red-400"}>
                {entry.ok ? "✓" : "✗"}
              </span>
              <code className="font-mono text-white/50 flex-1 truncate">{entry.event}</code>
              <span className="text-white/20 shrink-0">{entry.time}</span>
            </div>
          ))}
        </div>
      )}

      {/* Exemplo de como configurar no GTM */}
      <details className="group">
        <summary className="text-[11px] text-white/25 cursor-pointer hover:text-white/40 transition-colors list-none flex items-center gap-1">
          <span className="group-open:rotate-90 transition-transform inline-block">›</span>
          Como configurar no GTM
        </summary>
        <div className="mt-2 rounded-lg bg-black/30 p-3 space-y-1.5 text-[11px] text-white/35 leading-relaxed">
          <p><strong className="text-white/50">1.</strong> No GTM, crie um novo Acionador</p>
          <p><strong className="text-white/50">2.</strong> Tipo: <code className="font-mono text-white/50">Evento personalizado</code></p>
          <p><strong className="text-white/50">3.</strong> Nome do evento: o mesmo que você digitar aqui</p>
          <p><strong className="text-white/50">4.</strong> Associe o acionador à sua tag</p>
          <p><strong className="text-white/50">5.</strong> Ative o Modo de Prévia no GTM e dispare o evento aqui</p>
        </div>
      </details>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function PixelTestPage() {
  const { slug } = useParams<{ slug: string }>();
  const [config, setConfig] = useState<PixelConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [firing, setFiring] = useState<string | null>(null);
  const [firedEvents, setFiredEvents] = useState<string[]>([]);

  // Carrega client_id e configurações via slug
  // Usa a RPC get_client_tracking_config (SECURITY DEFINER com GRANT TO anon)
  // que retorna client_id + todos os IDs de tracking em uma única chamada
  useEffect(() => {
    if (!slug) return;

    supabase
      .rpc("get_client_tracking_config", { p_slug: slug })
      .then(({ data }) => {
        const row = Array.isArray(data) ? data[0] : data;
        if (!row?.client_id) { setLoading(false); return; }

        setConfig({
          client_id:          row.client_id,
          meta_pixel_id:      row.meta_pixel_id      || null,
          gtm_container_id:   row.gtm_container_id   || null,
          ga4_measurement_id: row.ga4_measurement_id || null,
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug]);

  // Injeta pixels diretamente quando os dados da RPC chegam
  // (não usa useTrackingPixel para evitar dependência das views com anon)
  useEffect(() => {
    if (!config) return;

    const { meta_pixel_id, gtm_container_id, ga4_measurement_id } = config;

    // Meta Pixel
    if (meta_pixel_id && !(window as any).fbq) {
      const fbqStub = function (...args: unknown[]) {
        (fbqStub as any).callMethod
          ? (fbqStub as any).callMethod.apply(fbqStub, args)
          : (fbqStub as any).queue.push(args);
      };
      (fbqStub as any).push = fbqStub;
      (fbqStub as any).loaded = true;
      (fbqStub as any).version = "2.0";
      (fbqStub as any).queue = [];
      (window as any).fbq = fbqStub;
      (window as any)._fbq = fbqStub;
      const s = document.createElement("script");
      s.async = true;
      s.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(s);
      (window as any).fbq("init", meta_pixel_id);
      (window as any).fbq("track", "PageView");
    }

    // Google Tag Manager
    if (gtm_container_id && !document.getElementById("gtm-pixel-test")) {
      (window as any).dataLayer = (window as any).dataLayer ?? [];
      (window as any).dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
      const s = document.createElement("script");
      s.id = "gtm-pixel-test";
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtm.js?id=${gtm_container_id}`;
      document.head.appendChild(s);
    }

    // GA4 direto (só se não tiver GTM)
    if (ga4_measurement_id && !gtm_container_id && !document.getElementById("ga4-pixel-test")) {
      (window as any).dataLayer = (window as any).dataLayer ?? [];
      (window as any).gtag = function (...a: unknown[]) { (window as any).dataLayer.push(a); };
      (window as any).gtag("js", new Date());
      (window as any).gtag("config", ga4_measurement_id);
      const s = document.createElement("script");
      s.id = "ga4-pixel-test";
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${ga4_measurement_id}`;
      document.head.appendChild(s);
    }
  }, [config]);

  // Dispara evento de teste
  const fire = async (eventName: TrackEventName) => {
    if (!slug || !config?.client_id) return;
    setFiring(eventName);
    try {
      await trackServerSide(slug, eventName, {
        email:           "teste@c8control.com.br",
        phone:           "11999999999",
        first_name:      "Teste",
        last_name:       "C8",
        test_event_code: "TEST",
        custom_data:     { test: true, fired_from: "pixel_test_page" },
      });
      setFiredEvents(prev => [eventName, ...prev].slice(0, 20));
    } finally {
      setFiring(null);
    }
  };

  const anyConfigured = !!(config?.meta_pixel_id || config?.gtm_container_id || config?.ga4_measurement_id);

  // ── Renderização ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-white/30" />
      </div>
    );
  }

  if (!config?.client_id) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <XCircle className="h-12 w-12 text-white/20 mx-auto" />
          <p className="text-white font-semibold">Cliente não encontrado</p>
          <p className="text-sm text-white/40">Verifique o slug na URL.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F172A] p-6">
      <div className="max-w-lg mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600">
            <FlaskConical className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Teste de Pixels</h1>
            <p className="text-xs text-white/40">/{slug} · Use esta URL no Tag Assistant</p>
          </div>
        </div>

        {/* URL de teste — para copiar e colar no Tag Assistant */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">URL desta página</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-violet-300 font-mono truncate">
              {window.location.href}
            </code>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-white/50 hover:text-white shrink-0"
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
              }}
            >
              Copiar
            </Button>
          </div>
          <p className="text-[11px] text-white/30">
            Cole esta URL no Google Tag Assistant para depurar as tags desta página.
          </p>
        </div>

        {/* Status dos pixels */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
            Status dos pixels
          </p>
          <StatusRow
            icon={
              <svg className="h-4 w-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.22 5.96C15.31 5.96 16.45 6.15 16.45 6.15V8.62H15.19C13.95 8.62 13.56 9.39 13.56 10.18V12.06H16.34L15.89 14.96H13.56V21.96C18.34 21.21 22 17.06 22 12.06C22 6.53 17.5 2.04 12 2.04Z"/>
              </svg>
            }
            label="Meta Pixel"
            value={config.meta_pixel_id}
            configured={!!config.meta_pixel_id}
          />
          <StatusRow
            icon={<span className="text-sm font-bold text-orange-400">G</span>}
            label="Google Tag Manager"
            value={config.gtm_container_id}
            configured={!!config.gtm_container_id}
          />
          <StatusRow
            icon={<span className="text-sm font-bold text-yellow-400">GA</span>}
            label="Google Analytics 4"
            value={config.ga4_measurement_id}
            configured={!!config.ga4_measurement_id}
          />
        </div>

        {/* Botões de disparo */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">
              Disparar evento de teste
            </p>
            <a
              href="https://tagassistant.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              Tag Assistant <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {!anyConfigured ? (
            <div className="py-4 text-center space-y-2">
              <p className="text-sm text-white/30">
                Nenhum pixel configurado.
              </p>
              <p className="text-xs text-white/20">
                Configure em Configurações → Integrações → Rastreamento.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {TEST_EVENTS.map(({ name, label, emoji }) => (
                <Button
                  key={name}
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white text-xs"
                  disabled={!!firing}
                  onClick={() => fire(name)}
                >
                  {firing === name
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <span>{emoji}</span>
                  }
                  {label}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* DataLayer manual — cliente dispara qualquer evento customizado */}
        <DataLayerTester />

        {/* Elementos para testar acionadores de clique no GTM */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">
              Acionadores de clique
            </p>
            <p className="text-[11px] text-white/25 leading-relaxed">
              Clique nos elementos abaixo para testar acionadores do GTM
              como <code className="font-mono">Click URL</code>, <code className="font-mono">Click Text</code> e <code className="font-mono">Click Classes</code>.
              O Tag Assistant registra cada clique em tempo real.
            </p>
          </div>

          <div className="space-y-2">

            {/* WhatsApp — acionador: Click URL contém wa.me */}
            <div className="flex items-center justify-between rounded-lg bg-white/5 border border-white/8 px-3 py-2.5">
              <div className="space-y-0.5 min-w-0">
                <p className="text-xs font-medium text-white/70">WhatsApp</p>
                <p className="text-[10px] text-white/30 font-mono">Click URL contém wa.me</p>
              </div>
              <a
                href="https://wa.me/5511999999999?text=Teste+de+pixel+C8+Control"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-md bg-[#25D366]/20 border border-[#25D366]/30 px-3 py-1.5 text-xs font-medium text-[#25D366] hover:bg-[#25D366]/30 transition-colors shrink-0"
                data-c8-test="whatsapp-click"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </a>
            </div>

            {/* Telefone — acionador: Click URL contém tel: */}
            <div className="flex items-center justify-between rounded-lg bg-white/5 border border-white/8 px-3 py-2.5">
              <div className="space-y-0.5 min-w-0">
                <p className="text-xs font-medium text-white/70">Telefone</p>
                <p className="text-[10px] text-white/30 font-mono">Click URL contém tel:</p>
              </div>
              <a
                href="tel:+5511999999999"
                className="flex items-center gap-1.5 rounded-md bg-blue-500/20 border border-blue-500/30 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/30 transition-colors shrink-0"
                data-c8-test="phone-click"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8a19.79 19.79 0 01-3.07-8.68A2 2 0 012 .9h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
                </svg>
                Ligar
              </a>
            </div>

            {/* Agendamento — acionador: Click Text contém Agendar */}
            <div className="flex items-center justify-between rounded-lg bg-white/5 border border-white/8 px-3 py-2.5">
              <div className="space-y-0.5 min-w-0">
                <p className="text-xs font-medium text-white/70">Agendamento</p>
                <p className="text-[10px] text-white/30 font-mono">Click Text contém Agendar</p>
              </div>
              <a
                href={`/booking/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-md bg-violet-500/20 border border-violet-500/30 px-3 py-1.5 text-xs font-medium text-violet-400 hover:bg-violet-500/30 transition-colors shrink-0"
                data-c8-test="booking-click"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                Agendar
              </a>
            </div>

            {/* Formulário — acionador: Click Classes contém btn-form ou Form Submission */}
            <div className="flex items-center justify-between rounded-lg bg-white/5 border border-white/8 px-3 py-2.5">
              <div className="space-y-0.5 min-w-0">
                <p className="text-xs font-medium text-white/70">Formulário de Lead</p>
                <p className="text-[10px] text-white/30 font-mono">Click Classes contém btn-form</p>
              </div>
              <button
                className="btn-form flex items-center gap-1.5 rounded-md bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/30 transition-colors shrink-0"
                onClick={() => {}}
                data-c8-test="form-click"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                </svg>
                Enviar formulário
              </button>
            </div>

          </div>

          <p className="text-[10px] text-white/20 pt-1">
            Dica: ative o <strong className="text-white/30">Modo de Prévia</strong> no GTM antes de clicar para ver os acionadores disparando no Tag Assistant.
          </p>
        </div>

        {/* Log de eventos disparados nesta sessão */}
        {firedEvents.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">
              Disparados nesta sessão
            </p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {firedEvents.map((ev, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <Zap className="h-3 w-3 text-violet-400 shrink-0" />
                  <span className="text-white/60 font-mono">{ev}</span>
                  <span className="text-white/20 ml-auto">{new Date().toLocaleTimeString("pt-BR")}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-[11px] text-white/20 pb-4">
          Eventos marcados com <code className="font-mono">test_event_code: TEST</code> · não afetam dados reais
        </p>

      </div>
    </div>
  );
}
