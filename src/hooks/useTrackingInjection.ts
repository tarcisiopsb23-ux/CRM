import { useEffect } from 'react';

const GTM_ID_REGEX = /^GTM-[A-Z0-9]+$/;
const META_PIXEL_ID_REGEX = /^\d{15,16}$/;

interface TrackingInjectionParams {
  gtmId?: string | null;
  metaPixelId?: string | null;
}

export function useTrackingInjection({ gtmId, metaPixelId }: TrackingInjectionParams) {
  // GTM injection
  useEffect(() => {
    if (!gtmId || !GTM_ID_REGEX.test(gtmId)) return;

    // Avoid duplicates
    if (document.getElementById('gtm-script')) return;

    // <head> script
    const headScript = document.createElement('script');
    headScript.id = 'gtm-script';
    headScript.innerHTML = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');`;
    document.head.appendChild(headScript);

    // <body> noscript
    const bodyNoscript = document.createElement('noscript');
    bodyNoscript.id = 'gtm-noscript';
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.googletagmanager.com/ns.html?id=${gtmId}`;
    iframe.height = '0';
    iframe.width = '0';
    iframe.style.display = 'none';
    iframe.style.visibility = 'hidden';
    bodyNoscript.appendChild(iframe);
    document.body.insertBefore(bodyNoscript, document.body.firstChild);

    return () => {
      document.getElementById('gtm-script')?.remove();
      document.getElementById('gtm-noscript')?.remove();
    };
  }, [gtmId]);

  // Meta Pixel injection
  useEffect(() => {
    if (!metaPixelId || !META_PIXEL_ID_REGEX.test(metaPixelId)) return;

    // Avoid duplicates
    if (document.getElementById('meta-pixel-script')) return;

    const script = document.createElement('script');
    script.id = 'meta-pixel-script';
    script.innerHTML = `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${metaPixelId}');
fbq('track', 'PageView');`;
    document.head.appendChild(script);

    const noscript = document.createElement('noscript');
    noscript.id = 'meta-pixel-noscript';
    const img = document.createElement('img');
    img.height = 1;
    img.width = 1;
    img.style.display = 'none';
    img.src = `https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`;
    noscript.appendChild(img);
    document.head.appendChild(noscript);

    return () => {
      document.getElementById('meta-pixel-script')?.remove();
      document.getElementById('meta-pixel-noscript')?.remove();
    };
  }, [metaPixelId]);
}
