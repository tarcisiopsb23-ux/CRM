// test_login.mjs — testa o login via client-dashboard-auth
// Usage: node test_login.mjs <email> <password> [slug]

const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93d2F1bGFlbmFiYmRhbHljdXN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4Nzc3NzgsImV4cCI6MjA4NTQ1Mzc3OH0.VKuc4gbKlqjwFnoFJtkAfmzkJxnvz1W1zIfgm2JIvFo";
const BASE_URL = "https://owwaulaenabbdalycusx.supabase.co";

const email    = process.argv[2];
const password = process.argv[3];
const slug     = process.argv[4] || null;

if (!email || !password) {
  console.log("Usage: node test_login.mjs <email> <password> [slug]");
  process.exit(1);
}

console.log(`Testing login: ${email} / *** ${slug ? `(slug: ${slug})` : ""}`);
const t0 = Date.now();

const ctrl = new AbortController();
const timer = setTimeout(() => {
  console.log(`[TIMEOUT] ${Date.now() - t0}ms elapsed, aborting`);
  ctrl.abort();
}, 55000);

try {
  const resp = await fetch(`${BASE_URL}/functions/v1/client-dashboard-auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey":        ANON_KEY,
      "Authorization": `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ email, password, ...(slug ? { slug } : {}) }),
    signal: ctrl.signal,
  });

  clearTimeout(timer);
  const elapsed = Date.now() - t0;
  const data = await resp.json();
  console.log(`Status: ${resp.status} (${elapsed}ms)`);

  if (resp.ok) {
    console.log("✓ Login OK");
    console.log("  slug:", data.slug);
    console.log("  mode:", data.mode);
    console.log("  user.email:", data.user?.email);
    console.log("  user.role:", data.user?.role);
    console.log("  session:", data.session ? "present" : "MISSING");
  } else {
    console.log("✗ Login FAILED");
    console.log("  error:", data.error);
    console.log("  detail:", data.detail);
  }
} catch (err) {
  clearTimeout(timer);
  console.error(`Error after ${Date.now() - t0}ms:`, err.message);
}
