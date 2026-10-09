import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";

/**
 * Landing page intermediária para atribuição de campanhas.
 * Injeta GTM e Meta Pixel dinamicamente buscando os IDs do cliente via cid.
 * Os scripts são injetados ANTES do redirect para garantir o disparo dos eventos.
 */
export function WhatsAppRedirectPage() {
  const [params] = useSearchParams();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const to          = params.get("to") ?? "";
    const clientId    = params.get("cid") ?? "";
    const utmSource   = params.get("utm_source") ?? null;
    const utmMedium   = params.get("utm_medium") ?? null;
    const utmCampaign = params.get("utm_campaign") ?? null;
    const utmContent  = params.get("utm_content") ?? null;
    const utmTerm     = params.get("utm_term") ?? null;
    const msg         = params.get("msg") ?? "";

    const waUrl = msg
      ? `https://wa.me/${to}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/${to}`;

    async function run() {
      // Fetch GTM ID and Meta Pixel ID from client metadata
      let gtmId: string | null = null;
      let metaPixelId: string | null = null;

      if (clientId) {
        try {
          const { data } = await supabase
            .from("clients")
            .select("metadata")
            .eq("id", clientId)
            .single();
          gtmId = data?.metadata?.gtm_id ?? null;
          metaPixelId = data?.metadata?.meta_pixel_id ?? null;
        } catch { /* fail silently */ }
      }

      // Inject Meta Pixel script if configured
      if (metaPixelId && /^\d{15,16}$/.test(metaPixelId)) {
        await new Promise<void>((resolve) => {
          const script = document.createElement("script");
          script.innerHTML = `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${metaPixelId}');`;
          script.onload = () => resolve();
          document.head.appendChild(script);
          // Resolve after 300ms even if script hasn't loaded
          setTimeout(resolve, 300);
        });
      }

      // Inject GTM script if configured
      if (gtmId && /^GTM-[A-Z0-9]+$/.test(gtmId)) {
        const gtmScript = document.createElement("script");
        gtmScript.innerHTML = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');`;
        document.head.appendChild(gtmScript);
        // Small delay to allow GTM to initialize
        await new Promise(r => setTimeout(r, 200));
      }

      // Fire Meta Pixel Lead event
      try {
        (window as any).fbq?.("track", "Lead", {
          content_name: utmCampaign ?? "whatsapp-click",
          content_category: utmSource ?? "whatsapp",
        });
      } catch { /* silencioso */ }

      // Fire GTM dataLayer event
      try {
        (window as any).dataLayer = (window as any).dataLayer || [];
        (window as any).dataLayer.push({
          event: "whatsapp_click",
          utm_source: utmSource,
          utm_campaign: utmCampaign,
        });
      } catch { /* silencioso */ }

      // Save click to ad_click_sessions (fire-and-forget)
      if (clientId && to) {
        supabase.from("ad_click_sessions").insert({
          client_id:       clientId,
          utm_source:      utmSource,
          utm_medium:      utmMedium,
          utm_campaign:    utmCampaign,
          utm_content:     utmContent,
          utm_term:        utmTerm,
          whatsapp_number: to,
        }).then();
      }

      // Redirect to WhatsApp
      window.location.href = waUrl;
    }

    run();
  }, [params]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0a0a0a" }}>
      <p style={{ color: "#ffffff40", fontSize: 13, fontFamily: "monospace" }}>Redirecionando...</p>
    </div>
  );
}
