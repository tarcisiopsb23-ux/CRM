/**
 * LeadFormPage - Pagina publica de captura de leads
 * Rota: /form/:slug/:formSlug
 * Sem autenticacao. Suporta modo embed via ?embed=true
 */

import { useState, useEffect, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { applyMask } from "@/lib/masks";
import { cn } from "@/lib/utils";

// --- Tipos --------------------------------------------------------------------

interface FieldLogic {
  show_if?: { field_id: string; operator: string; value: string };
}

interface FormField {
  id:           string;
  type:         string;
  label:        string;
  placeholder?: string;
  required?:    boolean;
  options?:     string[];
  html_content?: string;
  logic?:       FieldLogic;
}

interface FormData {
  form_id:         string;
  client_id:       string;
  organization_id: string;
  title:           string;
  description?:    string;
  primary_color:   string;
  logo_url?:       string;
  background_color: string;
  button_text:     string;
  fields:          FormField[];
  success_message: string;
  redirect_url?:   string;
  trigger_event:   string;
  client_name:     string;
  client_slug:     string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

// --- Helpers -----------------------------------------------------------------

function fieldIsVisible(field: FormField, values: Record<string, string>): boolean {
  const logic = field.logic?.show_if;
  if (!logic) return true;
  const dep = values[logic.field_id] ?? "";
  switch (logic.operator) {
    case "equals":     return dep === logic.value;
    case "not_equals": return dep !== logic.value;
    case "contains":   return dep.includes(logic.value);
    case "not_empty":  return dep.length > 0;
    default:           return true;
  }
}

// --- Injeção de pixel (sem hook — pága pública sem auth) -------------------

function injectPixels(clientId: string) {
  // Lê configurações de pixel para este cliente
  Promise.all([
    supabase.from("client_ai_settings_safe")
      .select("meta_pixel_id")
      .eq("client_id", clientId)
      .maybeSingle(),
    supabase.from("client_gtm_settings_safe")
      .select("gtm_container_id, ga4_measurement_id")
      .eq("client_id", clientId)
      .maybeSingle(),
  ]).then(([aiRes, gtmRes]) => {
    const metaPixelId  = (aiRes.data as any)?.meta_pixel_id    ?? null;
    const gtmId        = (gtmRes.data as any)?.gtm_container_id  ?? null;
    const ga4Id        = (gtmRes.data as any)?.ga4_measurement_id ?? null;

    if (metaPixelId && !(window as any).fbq) {
      const fbq = function (...args: unknown[]) {
        (fbq as any).callMethod ? (fbq as any).callMethod.apply(fbq, args) : (fbq as any).queue.push(args);
      };
      (fbq as any).push = fbq; (fbq as any).loaded = true; (fbq as any).version = "2.0"; (fbq as any).queue = [];
      (window as any).fbq = fbq; (window as any)._fbq = fbq;
      const s = document.createElement("script");
      s.async = true; s.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(s);
      (window as any).fbq("init", metaPixelId);
      (window as any).fbq("track", "PageView");
    }

    if (gtmId && !document.getElementById("gtm-lf")) {
      (window as any).dataLayer = (window as any).dataLayer ?? [];
      const s = document.createElement("script");
      s.id = "gtm-lf";
      s.textContent = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`;
      document.head.appendChild(s);
    }

    if (ga4Id && !gtmId && !document.getElementById("ga4-lf")) {
      (window as any).dataLayer = (window as any).dataLayer ?? [];
      (window as any).gtag = function (...a: unknown[]) { (window as any).dataLayer.push(a); };
      (window as any).gtag("js", new Date()); (window as any).gtag("config", ga4Id);
      const s = document.createElement("script");
      s.id = "ga4-lf"; s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${ga4Id}`;
      document.head.appendChild(s);
    }
  }).catch(() => { /* silencioso */ });
}

// --- Componente de campo individual -----------------------------------------

function FormFieldInput({
  field,
  value,
  error,
  color,
  onChange,
}: {
  field:    FormField;
  value:    string;
  error?:   string;
  color:    string;
  onChange: (id: string, val: string) => void;
}) {
  const baseInput = "w-full px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/15 text-white placeholder-white/30 focus:outline-none focus:border-[--form-color] transition-colors";

  if (field.type === "divider") {
    return <hr className="border-white/10" />;
  }

  if (field.type === "html") {
    return (
      <div
        className="text-white/70 text-sm"
        dangerouslySetInnerHTML={{ __html: field.html_content ?? "" }}
      />
    );
  }

  if (field.type === "consent") {
    return (
      <label className="flex items-start gap-2.5 cursor-pointer group">
        <input
          type="checkbox"
          checked={value === "true"}
          onChange={(e) => onChange(field.id, e.target.checked ? "true" : "")}
          className="mt-0.5 rounded"
          style={{ accentColor: color }}
          required={field.required}
        />
        <span className={cn("text-xs text-white/70 group-hover:text-white/90 transition-colors", error && "text-red-400")}>
          {field.label}
          {field.required && <span className="text-red-400 ml-1">*</span>}
        </span>
      </label>
    );
  }

  if (field.type === "radio" || field.type === "checkbox") {
    return (
      <div className="space-y-1.5">
        <Label className="text-white/80 text-xs font-medium">
          {field.label}{field.required && <span className="text-red-400 ml-1">*</span>}
        </Label>
        <div className="space-y-1.5">
          {(field.options ?? []).map((opt) => {
            const checked = field.type === "checkbox"
              ? (value || "").split(",").map((v) => v.trim()).includes(opt)
              : value === opt;
            return (
              <label key={opt} className="flex items-center gap-2 cursor-pointer">
                <input
                  type={field.type === "radio" ? "radio" : "checkbox"}
                  name={field.id}
                  value={opt}
                  checked={checked}
                  onChange={(e) => {
                    if (field.type === "radio") {
                      onChange(field.id, opt);
                    } else {
                      const prev = (value || "").split(",").map((v) => v.trim()).filter(Boolean);
                      const next = e.target.checked
                        ? [...prev, opt]
                        : prev.filter((v) => v !== opt);
                      onChange(field.id, next.join(", "));
                    }
                  }}
                  style={{ accentColor: color }}
                />
                <span className="text-white/70 text-sm">{opt}</span>
              </label>
            );
          })}
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="space-y-1.5">
        <Label className="text-white/80 text-xs font-medium">
          {field.label}{field.required && <span className="text-red-400 ml-1">*</span>}
        </Label>
        <select
          value={value}
          onChange={(e) => onChange(field.id, e.target.value)}
          className={cn(baseInput, "cursor-pointer")}
          style={{ ["--form-color" as string]: color }}
        >
          <option value="">{field.placeholder || "Selecione..."}</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        {error && <p className="text-red-400 text-xs">{error}</p>}
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div className="space-y-1.5">
        <Label className="text-white/80 text-xs font-medium">
          {field.label}{field.required && <span className="text-red-400 ml-1">*</span>}
        </Label>
        <textarea
          value={value}
          onChange={(e) => onChange(field.id, e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          className={cn(baseInput, "resize-none")}
          style={{ ["--form-color" as string]: color }}
        />
        {error && <p className="text-red-400 text-xs">{error}</p>}
      </div>
    );
  }

  // text, email, phone, date, number
  return (
    <div className="space-y-1.5">
      <Label className="text-white/80 text-xs font-medium">
        {field.label}{field.required && <span className="text-red-400 ml-1">*</span>}
      </Label>
      <input
        type={field.type === "email" ? "email" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
        value={value}
        onChange={(e) => {
          let v = e.target.value;
          if (field.type === "phone") v = applyMask(v, "phone");
          onChange(field.id, v);
        }}
        placeholder={field.placeholder}
        className={cn(baseInput, error && "border-red-400/60")}
        style={{ ["--form-color" as string]: color }}
      />
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}

// --- Página principal ---------------------------------------------------------

export function LeadFormPage() {
  const { slug, formSlug } = useParams<{ slug: string; formSlug: string }>();
  const [searchParams] = useSearchParams();
  const isEmbed = searchParams.get("embed") === "true";

  const [formData,   setFormData]   = useState<FormData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [notFound,   setNotFound]   = useState(false);
  const [values,     setValues]     = useState<Record<string, string>>({});
  const [errors,     setErrors]     = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // -- postMessage resize para o embed (quando dentro de iframe) -----------
  useEffect(() => {
    if (!isEmbed) return;
    const sendResize = () => {
      const height = document.body.scrollHeight;
      window.parent.postMessage(
        { type: "c8-resize", height, formPath: `${slug}/${formSlug}` },
        "*"
      );
    };
    sendResize();
    const ro = new ResizeObserver(sendResize);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, [isEmbed, slug, formSlug, formData, submitted]);

  // -- Carrega formulário ------------------------------------------------
  useEffect(() => {
    if (!slug || !formSlug) return;
    supabase.rpc("get_form_by_slug", { p_client_slug: slug, p_form_slug: formSlug })
      .then(({ data, error }) => {
        if (error || !data || (data as any).error) {
          setNotFound(true);
          return;
        }
        const form = data as unknown as FormData;
        setFormData(form);
        // Injeta pixels
        injectPixels(form.client_id);
        // Aplica cor primária
        document.documentElement.style.setProperty("--form-primary", form.primary_color);
        // Título da aba
        document.title = `${form.title} — ${form.client_name}`;
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug, formSlug]);

  // Captura UTMs e click IDs da URL
  const attribution = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source:   params.get("utm_source")   ?? sessionStorage.getItem("c8_utm_source")   ?? undefined,
      utm_medium:   params.get("utm_medium")   ?? sessionStorage.getItem("c8_utm_medium")   ?? undefined,
      utm_campaign: params.get("utm_campaign") ?? sessionStorage.getItem("c8_utm_campaign") ?? undefined,
      utm_content:  params.get("utm_content")  ?? sessionStorage.getItem("c8_utm_content")  ?? undefined,
      utm_term:     params.get("utm_term")     ?? sessionStorage.getItem("c8_utm_term")     ?? undefined,
      fbclid:       params.get("fbclid")       ?? sessionStorage.getItem("c8_fbclid")       ?? undefined,
      gclid:        params.get("gclid")        ?? sessionStorage.getItem("c8_gclid")        ?? undefined,
      fbc:  document.cookie.split(";").find((c) => c.trim().startsWith("_fbc="))?.split("=")[1],
      fbp:  document.cookie.split(";").find((c) => c.trim().startsWith("_fbp="))?.split("=")[1],
    };
  }, []);

  const handleChange = (id: string, val: string) => {
    setValues((prev) => ({ ...prev, [id]: val }));
    if (errors[id]) setErrors((prev) => { const n = { ...prev }; delete n[id]; return n; });
  };

  const validate = (): boolean => {
    if (!formData) return false;
    const newErrors: Record<string, string> = {};
    for (const field of formData.fields) {
      if (!fieldIsVisible(field, values)) continue;
      if (!field.required) continue;
      if (field.type === "divider" || field.type === "html") continue;
      const val = (values[field.id] ?? "").trim();
      if (!val) newErrors[field.id] = "Este campo é obrigatório";
      else if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        newErrors[field.id] = "E-mail inválido";
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData || !slug || !formSlug) return;
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/lead-form-submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_slug: slug,
          form_slug:   formSlug,
          data:        values,
          ...attribution,
          landing_page: window.location.href,
          user_agent:  navigator.userAgent,
          ga_client_id: document.cookie.split(";")
            .find((c) => c.trim().startsWith("_ga="))
            ?.split("=").slice(1).join("="),
        }),
      });

      const result = await res.json() as {
        success: boolean;
        error?:  string;
        fields?: { id: string; label: string }[];
        redirect_url?: string | null;
        success_message?: string;
      };

      if (!res.ok || !result.success) {
        // Erros de validação por campo
        if (result.fields) {
          const fieldErrors: Record<string, string> = {};
          result.fields.forEach(({ id }) => { fieldErrors[id] = "Este campo é obrigatório"; });
          setErrors(fieldErrors);
        } else {
          setSubmitError(result.error ?? "Erro ao enviar formulário. Tente novamente.");
        }
        return;
      }

      // Sucesso — dispara fbq Lead no browser também
      const fbq = (window as any).fbq as ((...a: unknown[]) => void) | undefined;
      if (fbq) fbq("track", formData.trigger_event);

      // Notifica o embed (página pai) sobre a conversão
      if (isEmbed) {
        window.parent.postMessage(
          { type: "c8-conversion", eventName: formData.trigger_event, formPath: `${slug}/${formSlug}` },
          "*"
        );
      }

      if (result.redirect_url) {
        window.location.href = result.redirect_url;
      } else {
        setSubmitted(true);
      }
    } catch {
      setSubmitError("Falha na conexão. Verifique sua internet e tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  // -- Estados de carregamento / erro ------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F172A]">
        <Loader2 className="h-8 w-8 animate-spin text-white/30" />
      </div>
    );
  }

  if (notFound || !formData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F172A] p-6">
        <div className="text-center space-y-3 max-w-sm">
          <AlertCircle className="h-12 w-12 text-white/20 mx-auto" />
          <p className="text-white font-semibold">Formulário não encontrado</p>
          <p className="text-sm text-white/50">
            O link pode estar incorreto ou o formulário foi desativado.
          </p>
        </div>
      </div>
    );
  }

  const color       = formData.primary_color ?? "#6366f1";
  const bgColor     = formData.background_color ?? "#0F172A";
  const visibleFields = formData.fields.filter((f) => fieldIsVisible(f, values));

  // -- Tela de sucesso ---------------------------------------------------
  if (submitted) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: bgColor }}
      >
        <div className="text-center space-y-4 max-w-sm">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
            style={{ background: `${color}20` }}
          >
            <CheckCircle2 className="h-8 w-8" style={{ color }} />
          </div>
          {formData.logo_url && (
            <img src={formData.logo_url} alt={formData.client_name} className="h-8 mx-auto object-contain" />
          )}
          <div>
            <p className="text-white font-semibold text-lg">Enviado com sucesso!</p>
            <p className="text-white/60 text-sm mt-1">{formData.success_message}</p>
          </div>
        </div>
      </div>
    );
  }

  // -- Formulário --------------------------------------------------------
  return (
    <div
      className={cn("min-h-screen flex items-center justify-center", isEmbed ? "p-2" : "p-4 md:p-8")}
      style={{ background: isEmbed ? "transparent" : bgColor }}
    >
      <div
        className={cn(
          "w-full rounded-2xl shadow-2xl border border-white/8 overflow-hidden",
          isEmbed ? "max-w-full" : "max-w-lg"
        )}
        style={{ background: bgColor }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {formData.logo_url && (
            <img src={formData.logo_url} alt={formData.client_name} className="h-8 mb-3 object-contain" />
          )}
          <h1 className="text-xl font-bold text-white">{formData.title}</h1>
          {formData.description && (
            <p className="text-sm text-white/60 mt-1">{formData.description}</p>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {visibleFields.map((field) => (
            <FormFieldInput
              key={field.id}
              field={field}
              value={values[field.id] ?? ""}
              error={errors[field.id]}
              color={color}
              onChange={handleChange}
            />
          ))}

          {submitError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-400/20 bg-red-400/5 px-4 py-3">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{submitError}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
            style={{ background: color }}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {formData.button_text || "Enviar"}
          </button>

          {/* LGPD mínimo */}
          <p className="text-center text-[10px] text-white/25 pb-1">
            Seus dados são protegidos conforme a LGPD.
          </p>
        </form>
      </div>

      {/* Powered by — apenas fora do embed */}
      {!isEmbed && (
        <a
          href="https://app.c8control.com.br"
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-3 right-4 text-[10px] text-white/20 hover:text-white/40 transition-colors"
        >
          Powered by C8 Control
        </a>
      )}
    </div>
  );
}
