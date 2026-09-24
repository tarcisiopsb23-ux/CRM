/**
 * C8 Control — Widget Embed
 *
 * Incorpora um formulário de leads em qualquer site via iframe.
 *
 * Uso:
 *   <script src="https://app.c8control.com.br/embed.js"
 *           data-form="meu-slug/meu-formulario"></script>
 *   <div id="c8-form"></div>
 *
 * Atributos do <script>:
 *   data-form      (obrigatório)  "client-slug/form-slug"
 *   data-container (opcional)    ID do elemento onde o iframe será inserido
 *                                (padrão: "c8-form")
 *   data-height    (opcional)    altura inicial em px (padrão: auto/responsivo)
 *   data-width     (opcional)    largura (padrão: "100%")
 *
 * Comportamento:
 *   - Cria um iframe responsivo que se auto-ajusta à altura do conteúdo
 *   - Herda UTMs e fbclid/gclid da URL da página pai e os repassa ao iframe
 *   - Comunica eventos via postMessage para integração com pixel da página pai
 *   - Não adiciona nenhum CSS global à página host
 */
(function () {
  "use strict";

  // ── Localiza o script tag para ler atributos ─────────────────────────────
  var scripts = document.querySelectorAll("script[data-form]");
  var scriptTag = scripts[scripts.length - 1];

  if (!scriptTag) {
    console.warn("[C8 Embed] Script tag com data-form não encontrado.");
    return;
  }

  var formPath    = scriptTag.getAttribute("data-form") || "";
  var containerId = scriptTag.getAttribute("data-container") || "c8-form";
  var fixedHeight = scriptTag.getAttribute("data-height") || null;
  var width       = scriptTag.getAttribute("data-width")  || "100%";

  if (!formPath || formPath.split("/").length < 2) {
    console.warn('[C8 Embed] data-form inválido. Use o formato "client-slug/form-slug".');
    return;
  }

  // ── Base URL detectada do src do script ──────────────────────────────────
  var scriptSrc = scriptTag.getAttribute("src") || "";
  var baseUrl = scriptSrc
    ? scriptSrc.replace(/\/embed\.js(\?.*)?$/, "")
    : "https://app.c8control.com.br";

  // ── Coleta UTMs e click IDs da URL da página pai ─────────────────────────
  function getQueryParams() {
    var params = {};
    var search = window.location.search;
    if (!search) return params;
    search.slice(1).split("&").forEach(function (pair) {
      var parts = pair.split("=");
      if (parts.length === 2) {
        params[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
      }
    });
    return params;
  }

  var utmKeys = ["utm_source","utm_medium","utm_campaign","utm_content","utm_term","fbclid","gclid"];
  var parentParams = getQueryParams();
  var utmQuery = utmKeys
    .filter(function (k) { return parentParams[k]; })
    .map(function (k) { return k + "=" + encodeURIComponent(parentParams[k]); })
    .join("&");

  // ── Constrói URL do iframe ───────────────────────────────────────────────
  var iframeSrc = baseUrl + "/form/" + formPath + "?embed=true";
  if (utmQuery) iframeSrc += "&" + utmQuery;

  // ── Localiza container ───────────────────────────────────────────────────
  function init() {
    var container = document.getElementById(containerId);
    if (!container) {
      // Tenta novamente após 100ms (script pode ter sido inserido antes do DOM)
      setTimeout(init, 100);
      return;
    }

    // Wrapper para responsividade
    var wrapper = document.createElement("div");
    wrapper.id = "c8-embed-wrapper-" + containerId;
    wrapper.style.cssText = [
      "position:relative",
      "width:" + width,
      "overflow:hidden",
      "border-radius:16px",
      fixedHeight ? "height:" + fixedHeight + "px" : "min-height:300px",
    ].join(";");

    // Iframe
    var iframe = document.createElement("iframe");
    iframe.id  = "c8-embed-frame-" + containerId;
    iframe.src = iframeSrc;
    iframe.title = "Formulário C8 Control";
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute("scrolling", "no");
    iframe.setAttribute("allowtransparency", "true");
    iframe.style.cssText = [
      "width:100%",
      "border:none",
      "display:block",
      "background:transparent",
      fixedHeight ? "height:" + fixedHeight + "px" : "height:300px",
    ].join(";");

    // Loading overlay
    var loader = document.createElement("div");
    loader.id  = "c8-embed-loader-" + containerId;
    loader.style.cssText = [
      "position:absolute",
      "inset:0",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "background:#0F172A",
      "border-radius:16px",
      "transition:opacity 0.3s",
    ].join(";");
    loader.innerHTML = [
      '<div style="',
        "width:32px;height:32px;border-radius:50%;",
        "border:3px solid rgba(99,102,241,0.2);",
        "border-top-color:#6366f1;",
        "animation:c8spin 0.7s linear infinite",
      '">&nbsp;</div>',
      '<style>@keyframes c8spin{to{transform:rotate(360deg)}}</style>',
    ].join("");

    // Ao carregar, remove loader e ajusta altura
    iframe.addEventListener("load", function () {
      setTimeout(function () {
        loader.style.opacity = "0";
        setTimeout(function () { loader.remove(); }, 300);
      }, 200);
    });

    wrapper.appendChild(iframe);
    wrapper.appendChild(loader);
    container.appendChild(wrapper);

    // ── Auto-resize via postMessage ──────────────────────────────────────
    // A LeadFormPage envia { type: "c8-resize", height: number } ao mudar tamanho
    if (!fixedHeight) {
      window.addEventListener("message", function (event) {
        // Validação de origem — aceita apenas da mesma base URL
        if (event.origin && baseUrl && !baseUrl.startsWith("http")) return;
        if (event.origin && baseUrl.indexOf(event.origin) < 0 && event.origin.indexOf(baseUrl) < 0) return;

        var data = event.data;
        if (!data || data.type !== "c8-resize") return;
        if (data.formPath && data.formPath !== formPath) return;

        var newHeight = Math.max(200, parseInt(data.height, 10) || 400);
        iframe.style.height = newHeight + "px";
        wrapper.style.minHeight = newHeight + "px";
      });
    }

    // ── Encaminha evento de conversão para o pixel da página pai ─────────
    // A LeadFormPage envia { type: "c8-conversion", eventName: string }
    window.addEventListener("message", function (event) {
      var data = event.data;
      if (!data || data.type !== "c8-conversion") return;

      var eventName = data.eventName || "Lead";

      // fbq na página pai (se existir)
      if (typeof window.fbq === "function") {
        window.fbq("track", eventName);
      }

      // dataLayer/gtag na página pai (se existir)
      if (window.dataLayer && Array.isArray(window.dataLayer)) {
        var ga4Map = {
          Lead: "generate_lead",
          Contact: "contact",
          Schedule: "book_appointment",
          Purchase: "purchase",
          CompleteRegistration: "sign_up",
        };
        window.dataLayer.push({
          event: ga4Map[eventName] || eventName.toLowerCase(),
          c8_form_path: formPath,
        });
      }
    });
  }

  // Inicia quando DOM estiver pronto
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
