// repair_auth_user.mjs
// Usage: node repair_auth_user.mjs <login_key> <password> [force_new]

const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93d2F1bGFlbmFiYmRhbHljdXN4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTg3Nzc3OCwiZXhwIjoyMDg1NDUzNzc4fQ.Wo-u89LNCAoCaI7gicog3uzEyLI9FVjgE5MPfrykzuY";
const BASE_URL    = "https://owwaulaenabbdalycusx.supabase.co";

const login_key  = process.argv[2];
const password   = process.argv[3];
const force_new  = process.argv[4] === "force";

if (!login_key || !password) {
  console.log("Usage: node repair_auth_user.mjs <login_key> <password> [force]");
  process.exit(1);
}

console.log("Repairing:", login_key, "| force_new:", force_new);

const resp = await fetch(`${BASE_URL}/functions/v1/repair-auth-user`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "apikey":        SERVICE_KEY,
    "Authorization": `Bearer ${SERVICE_KEY}`,
  },
  body: JSON.stringify({ login_key, password, force_new }),
  signal: AbortSignal.timeout(25000),
});

const text = await resp.text();
console.log("HTTP:", resp.status);
try { console.log(JSON.stringify(JSON.parse(text), null, 2)); }
catch { console.log(text); }
