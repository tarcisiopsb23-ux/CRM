param(
  [Parameter(Mandatory=$true)][string]$Email,
  [Parameter(Mandatory=$true)][string]$Password
)

$supabaseUrl = "https://owwaulaenabbdalycusx.supabase.co"
$anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93d2F1bGFlbmFiYmRhbHljdXN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4Nzc3NzgsImV4cCI6MjA4NTQ1Mzc3OH0.VKuc4gbKlqjwFnoFJtkAfmzkJxnvz1W1zIfgm2JIvFo"

$baseHeaders = @{ "apikey" = $anonKey; "Content-Type" = "application/json" }

# --- LOGIN ---
Write-Host "`n[1] Fazendo login como $Email..." -ForegroundColor Cyan
$loginBody = "{`"email`":`"$Email`",`"password`":`"$Password`"}"
try {
  $login = Invoke-WebRequest -Uri "$supabaseUrl/auth/v1/token?grant_type=password" `
    -Method POST -Headers $baseHeaders -Body $loginBody -UseBasicParsing
  $parsed = $login.Content | ConvertFrom-Json
  $jwt = $parsed.access_token
  $userId = $parsed.user.id
  Write-Host "    OK - user_id: $userId" -ForegroundColor Green
} catch {
  Write-Host "    ERRO no login: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

$authHeaders = @{
  "apikey"        = $anonKey
  "Content-Type"  = "application/json"
  "Authorization" = "Bearer $jwt"
}

# --- RPC get_my_profile ---
Write-Host "`n[2] Testando RPC get_my_profile()..." -ForegroundColor Cyan
$rRpc = Invoke-WebRequest -Uri "$supabaseUrl/rest/v1/rpc/get_my_profile" `
  -Method POST -Headers $authHeaders -Body "{}" -UseBasicParsing
Write-Host "    Status: $($rRpc.StatusCode)"
if ($rRpc.Content -eq "null" -or $rRpc.Content -eq "") {
  Write-Host "    RESULTADO: NULL - perfil nao encontrado via RPC!" -ForegroundColor Red
} else {
  $profile = $rRpc.Content | ConvertFrom-Json
  Write-Host "    RESULTADO: OK" -ForegroundColor Green
  Write-Host "    id:              $($profile.id)"
  Write-Host "    organization_id: $($profile.organization_id)"
  Write-Host "    role:            $($profile.role)"
  Write-Host "    email:           $($profile.email)"
}

# --- SELECT direto ---
Write-Host "`n[3] Testando SELECT direto em profiles..." -ForegroundColor Cyan
$rSel = Invoke-WebRequest -Uri "$supabaseUrl/rest/v1/profiles?select=id,organization_id,role,email&limit=5" `
  -Method GET -Headers $authHeaders -UseBasicParsing
Write-Host "    Status: $($rSel.StatusCode)"
$rows = $rSel.Content | ConvertFrom-Json
if ($rows.Count -eq 0) {
  Write-Host "    RESULTADO: array vazio - RLS bloqueando SELECT!" -ForegroundColor Red
} else {
  Write-Host "    RESULTADO: $($rows.Count) perfil(is) retornado(s)" -ForegroundColor Green
  $rows | ForEach-Object { Write-Host "    -> id=$($_.id) org=$($_.organization_id) role=$($_.role)" }
}

# --- Verifica policies no banco ---
Write-Host "`n[4] Verificando policies RLS de profiles..." -ForegroundColor Cyan
$rPol = Invoke-WebRequest -Uri "$supabaseUrl/rest/v1/rpc/get_my_profile" `
  -Method POST -Headers $authHeaders -Body "{}" -UseBasicParsing
# Usa pg_catalog via RPC nao eh possivel via REST anonimo, mas lista o resumo esperado
Write-Host "    Policies esperadas (conforme migrations aplicadas):"
Write-Host "    profiles_select  -> SELECT  (id = auth.uid() OR mesma org)" -ForegroundColor Yellow
Write-Host "    profiles_insert  -> INSERT  (id = auth.uid())              [00018]" -ForegroundColor Yellow
Write-Host "    profiles_update  -> UPDATE  (id = auth.uid())              [00018]" -ForegroundColor Yellow

Write-Host "`n=== Resumo ===" -ForegroundColor Cyan
if ($rRpc.Content -ne "null" -and $rRpc.Content -ne "") {
  Write-Host "RPC get_my_profile : OK" -ForegroundColor Green
} else {
  Write-Host "RPC get_my_profile : FALHOU (perfil inexistente no banco)" -ForegroundColor Red
}
if ($rows.Count -gt 0) {
  Write-Host "SELECT profiles    : OK" -ForegroundColor Green
} else {
  Write-Host "SELECT profiles    : FALHOU (RLS bloqueando)" -ForegroundColor Red
}
