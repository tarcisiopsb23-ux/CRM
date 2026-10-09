/**
 * useTrackingPixel
 *
 * Injeta dinamicamente os scripts de rastreamento no <head> com base nas
 * configuracoes de client_ai_settings e client_gtm_settings do cliente.
 *
 * Suporta (independentes entre si):
 *   - Meta Pixel        (meta_pixel_id em client_ai_settings)
 *   - Google Tag Manager (gtm_container_id em client_gtm_settings)
 *   - Google Analytics 4 (ga4_measurement_id em client_gtm_settings)
 *
 * Tambem:
 *   - Captura fbclid e gclid da URL e salva em sessionStorage para uso posterior
 *   - Expoe window.fbq, window.dataLayer, window.gtag
 *   - Impede dupla injecao (idempotente)
 *
 * Uso:
 *   const { trackEvent, isReady } = useTrackingPixel(clientId, slug);
 *   trackEvent("Lead", { email: "...", phone: "..." });
 */

import { useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// --- Tipos -------------------------------------------------------------------

export interface TrackEventOptions {
  email?:        string;
  phone?:        string;
  first_name?:   string;
  last_name?:    string;
  custom_data?:  Record<string, unknown>;
  /** Permite override do event_id para deduplicacao explicita */
  event_id?:     string;
  /** Passar test_event_code para debug na Meta Events Manager */
  test_event_code?: string;
}

export type TrackEventName =
  | "PageView"
  | "Lead"
  | "Contact"
  | "Schedule"
  | "Purchase"
  | "CompleteRegistration"
  | "ViewContent";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

// --- Helpers de injecao de script -------------------------------------------

function injectScript(id: string, src: string, onload?: () => void): void {
  if (document.getElementById(id)) return; // idempotente
  const s = document.createElement("script");
  s.id    = id;
  s.src   = src;
  s.async = true;
  if (onload) s.onload = onload;
  document.head.appendChild(s);
}

function injectInlineScript(id: string, code: string): void {
  if (document.getElementById(id)) return; // idempotente
  const s = document.createElement("script");
  s.id          = id;
  s.textContent = code;
  document.head.appendChild(s);
}

// --- Injecao do Meta Pixel --------------------------------------------------

function injectMetaPixel(pixelId: string): void {
  if ((window as any).fbq) return; // ja injetado

  const fbqStub = function (...args: unknown[]) {
    (fbqStub as any).callMethod
      ? (fbqStub as any).callMethod.apply(fbqStub, args)
      : (fbqStub as any).queue.push(args);
  };
  (fbqStub as any).push    = fbqStub;
  (fbqStub as any).loaded  = true;
  (fbqStub as any).version = "2.0";
  (fbqStub as any).queue   = [];
  (window as any).fbq  = fbqStub;
  (window as any)._fbq = fbqStub;

  injectScript("meta-pixel-sdk", "https://connect.facebook.net/en_US/fbevents.js");

  const fbq = (window as any).fbq as (...args: unknown[]) => void;
  fbq("init", pixelId);
  fbq("track", "PageView");
}

// --- Injecao do GTM ---------------------------------------------------------

function injectGTM(containerId: string): void {
  if (document.getElementById("gtm-inline")) return;

  (window as any).dataLayer = (window as any).dataLayer ?? [];

  injectInlineScript(
    "gtm-inline",
    `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':` +
    `new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],` +
    `j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=` +
    `'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);` +
    `})(window,document,'script','dataLayer','${containerId}');`
  );
}

// --- Injecao do GA4 direto --------------------------------------------------

function injectGA4(measurementId: string): void {
  if (document.getElementById("ga4-inline")) return;

  (window as any).dataLayer = (window as any).dataLayer ?? [];
  (window as any).gtag = function (...args: unknown[]) {
    (window as any).dataLayer.push(args);
  };
  (window as any).gtag("js", new Date());
  (window as any).gtag("config", measurementId, { send_page_view: true });

  injectScript(
    "ga4-sdk",
    `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
  );

  injectInlineScript(
    "ga4-inline",
    `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}` +
    `gtag('js',new Date());gtag('config','${measurementId}',{send_page_view:true});`
  );
}

// --- Captura fbclid / gclid da URL ------------------------------------------

function captureClickIds(): void {
  const params = new URLSearchParams(window.location.search);
  const fbclid = params.get("fbclid");
  const gclid  = params.get("gclid");
  if (fbclid) sessionStorage.setItem("c8_fbclid", fbclid);
  if (gclid)  sessionStorage.setItem("c8_gclid",  gclid);
}

// --- Helper publico: trackServerSide ----------------------------------------
// Chama a Edge Function track-conversion de forma assincrona e silenciosa.

export async function trackServerSide(
  slug:      string,
  eventName: TrackEventName,
  opts?:     TrackEventOptions
): Promise<void> {
  const eventId = opts?.event_id ?? crypto.randomUUID();

  // Dispara browser-side primeiro (fbq + gtag) com o mesmo event_id
  const fbq  = (window as any).fbq  as ((...a: unknown[]) => void) | undefined;
  const gtag = (window as any).gtag as ((...a: unknown[]) => void) | undefined;

  if (fbq) {
    fbq("track", eventName, opts?.custom_data ?? {}, { eventID: eventId });
  }
  if (gtag && eventName !== "PageView") {
    const ga4Map: Record<string, string> = {
      Lead:                 "generate_lead",
      Contact:              "contact",
      Schedule:             "book_appointment",
      Purchase:             "purchase",
      CompleteRegistration: "sign_up",
      ViewContent:          "page_view",
    };
    gtag("event", ga4Map[eventName] ?? eventName.toLowerCase(), opts?.custom_data ?? {});
  }

  // Coleta cookies do pixel
  const fbc = document.cookie.split(";").find((c) => c.trim().startsWith("_fbc="))
    ?.split("=")[1] ?? sessionStorage.getItem("c8_fbclid") ?? undefined;
  const fbp = document.cookie.split(";").find((c) => c.trim().startsWith("_fbp="))
    ?.split("=")[1] ?? undefined;

  // Server-side (silencioso)
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/track-conversion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_name:       eventName,
        client_slug:      slug,
        event_id:         eventId,
        source_url:       window.location.href,
        utm_source:       new URLSearchParams(window.location.search).get("utm_source")   ?? sessionStorage.getItem("c8_utm_source")   ?? undefined,
        utm_medium:       new URLSearchParams(window.location.search).get("utm_medium")   ?? sessionStorage.getItem("c8_utm_medium")   ?? undefined,
        utm_campaign:     new URLSearchParams(window.location.search).get("utm_campaign") ?? sessionStorage.getItem("c8_utm_campaign") ?? undefined,
        utm_content:      new URLSearchParams(window.location.search).get("utm_content")  ?? sessionStorage.getItem("c8_utm_content")  ?? undefined,
        utm_term:         new URLSearchParams(window.location.search).get("utm_term")     ?? sessionStorage.getItem("c8_utm_term")     ?? undefined,
        fbclid:           sessionStorage.getItem("c8_fbclid") ?? undefined,
        gclid:            sessionStorage.getItem("c8_gclid")  ?? undefined,
        fbc,
        fbp,
        email:            opts?.email,
        phone:            opts?.phone,
        first_name:       opts?.first_name,
        last_name:        opts?.last_name,
        custom_data:      opts?.custom_data,
        user_agent:       navigator.userAgent,
        test_event_code:  opts?.test_event_code,
      }),
    });
  } catch {
    // silencioso
  }
}

// --- Hook principal ---------------------------------------------------------

export function useTrackingPixel(clientId?: string, slug?: string) {
  const injectedRef = useRef(false);

  // Le configuracoes de pixel do Banco A
  const { data: aiSettings } = useQuery({
    queryKey: ["client_ai_settings_safe", clientId],
    queryFn: async () => {
      if (!clientId) return null;
      // Ignora UUID all-zeros (inválido)
      if (clientId === "00000000-0000-0000-0000-000000000000") return null;
      const { data } = await supabase
        .from("client_ai_settings_safe")
        .select("meta_pixel_id, google_tag_id")
        .eq("client_id", clientId)
        .maybeSingle();
      return data;
    },
    enabled: !!clientId,
    staleTime: 10 * 60 * 1000,
  });

  // Le configuracoes GTM/GA4
  const { data: gtmSettings } = useQuery({
    queryKey: ["client_gtm_settings_safe", clientId],
    queryFn: async () => {
      if (!clientId) return null;
      // Ignora UUID all-zeros (inválido)
      if (clientId === "00000000-0000-0000-0000-000000000000") return null;
      const { data } = await supabase
        .from("client_gtm_settings_safe")
        .select("gtm_container_id, ga4_measurement_id")
        .eq("client_id", clientId)
        .maybeSingle();
      return data;
    },
    enabled: !!clientId,
    staleTime: 10 * 60 * 1000,
  });

  // Captura click IDs da URL uma vez
  useEffect(() => {
    captureClickIds();
    // Persiste UTMs na sessao para uso nos formularios e track-conversion
    const params = new URLSearchParams(window.location.search);
    ["utm_source","utm_medium","utm_campaign","utm_content","utm_term"].forEach((k) => {
      const v = params.get(k);
      if (v) sessionStorage.setItem(`c8_${k}`, v);
    });
  }, []);

  // Injeta scripts quando as configuracoes chegam
  useEffect(() => {
    if (injectedRef.current) return;
    if (!aiSettings && !gtmSettings) return;

    const metaPixelId  = (aiSettings  as any)?.meta_pixel_id     ?? null;
    const gtmId        = (gtmSettings as any)?.gtm_container_id   ?? null;
    const ga4Id        = (gtmSettings as any)?.ga4_measurement_id ?? null;

    if (metaPixelId) injectMetaPixel(metaPixelId);
    if (gtmId)       injectGTM(gtmId);
    // GA4 direto so se nao ha GTM (evitar dupla coleta)
    if (ga4Id && !gtmId) injectGA4(ga4Id);

    if (metaPixelId || gtmId || ga4Id) {
      injectedRef.current = true;
    }
  }, [aiSettings, gtmSettings]);

  // trackEvent: dispara browser-side + server-side
  const trackEvent = useCallback(
    (eventName: TrackEventName, opts?: TrackEventOptions) => {
      if (!slug) return;
      trackServerSide(slug, eventName, opts);
    },
    [slug]
  );

  const isReady = injectedRef.current || !!(
    (aiSettings  as any)?.meta_pixel_id     ||
    (gtmSettings as any)?.gtm_container_id  ||
    (gtmSettings as any)?.ga4_measurement_id
  );

  return { trackEvent, isReady };
}
