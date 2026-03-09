import { chromium } from '@playwright/test';

const EMAIL = 'tarcisiopsb23@gmail.com';
const PASSWORD = 'Celiz1618*';
const URL = 'http://localhost:8081';

const logs = [];

function stamp() {
  return new Date().toISOString().substring(11, 23);
}

function tag(type) {
  const colors = { AUTH: '\x1b[36m', ROUTE: '\x1b[33m', ERROR: '\x1b[31m', NET: '\x1b[35m', INFO: '\x1b[37m' };
  return (colors[type] || '') + `[${type}]` + '\x1b[0m';
}

const browser = await chromium.launch({ headless: false, slowMo: 300 });
const ctx = await browser.newContext();
const page = await ctx.newPage();

// Captura logs do console do navegador
page.on('console', msg => {
  const text = msg.text();
  const type = msg.type();
  let category = 'INFO';
  if (text.includes('[Auth]'))        category = 'AUTH';
  else if (text.includes('[Protect')) category = 'ROUTE';
  else if (type === 'error')          category = 'ERROR';
  else if (type === 'warning')        category = 'WARN';
  const line = `${stamp()} ${tag(category)} ${text}`;
  logs.push(line);
  console.log(line);
});

// Captura erros JavaScript não tratados
page.on('pageerror', err => {
  const line = `${stamp()} ${tag('ERROR')} JS Exception: ${err.message}`;
  logs.push(line);
  console.log(line);
});

// Captura falhas de rede para o Supabase
page.on('response', res => {
  if (res.url().includes('supabase') && res.status() >= 400) {
    const line = `${stamp()} ${tag('NET')} ${res.status()} ${res.url().replace(/.*supabase\.co/, '')}`;
    logs.push(line);
    console.log(line);
  }
});

console.log('\n\x1b[32m=== INICIANDO TESTE DE LOGIN ===\x1b[0m\n');

// 1. Abre a app
console.log(`${stamp()} Abrindo ${URL} ...`);
await page.goto(URL, { waitUntil: 'networkidle' });
console.log(`${stamp()} URL atual: ${page.url()}`);

// 2. Preenche login
console.log(`\n${stamp()} Preenchendo formulario de login...`);
await page.fill('input[type="email"], input[name="email"]', EMAIL);
await page.fill('input[type="password"], input[name="password"]', PASSWORD);

// 3. Clica em entrar
await page.click('button[type="submit"]');
console.log(`${stamp()} Submit clicado — aguardando navegacao...`);

// 4. Aguarda navegação ou mensagem de erro
try {
  await page.waitForURL(url => !url.includes('/login'), { timeout: 10000 });
  console.log(`\n${stamp()} \x1b[32mNavegou para: ${page.url()}\x1b[0m`);
} catch {
  console.log(`\n${stamp()} \x1b[33mAinda em /login apos 10s — verificando erro...\x1b[0m`);
  const errText = await page.locator('text=/erro|inválid|incorret|not found/i').first().textContent().catch(() => null);
  if (errText) console.log(`${stamp()} Mensagem na tela: "${errText}"`);
}

// 5. Aguarda estado final do Auth (loading resolvido)
await page.waitForTimeout(3000);

// 6. Checa se "Perfil não encontrado" aparece
const profileErr = await page.locator('text=Perfil não encontrado').isVisible().catch(() => false);
const loading     = await page.locator('text=Carregando').isVisible().catch(() => false);
const dashboard   = await page.locator('text=/dashboard|início|kanban/i').first().isVisible().catch(() => false);

console.log('\n\x1b[32m=== RESULTADO FINAL ===\x1b[0m');
console.log(`URL final         : ${page.url()}`);
console.log(`"Perfil não enc." : ${profileErr ? '\x1b[31mVISÍVEL\x1b[0m' : '\x1b[32mnão visível\x1b[0m'}`);
console.log(`"Carregando..."   : ${loading     ? '\x1b[33mVISÍVEL (loading preso)\x1b[0m' : '\x1b[32mnão visível\x1b[0m'}`);
console.log(`Dashboard/Kanban  : ${dashboard   ? '\x1b[32mVISÍVEL\x1b[0m' : '\x1b[33mnão visível\x1b[0m'}`);

// 7. Filtra logs de Auth para resumo
const authLogs = logs.filter(l => l.includes('[Auth]') || l.includes('[ROUTE]') || l.includes('[ERROR]'));
if (authLogs.length) {
  console.log('\n\x1b[36m=== LOGS DE AUTH CAPTURADOS ===\x1b[0m');
  authLogs.forEach(l => console.log(l));
}

await page.waitForTimeout(2000);
await browser.close();
