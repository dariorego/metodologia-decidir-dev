// Teste do fluxo completo exigido pela sprint 02:
// Login -> Entrada -> Intervalo -> Fim -> Novo Intervalo -> Fim -> Saída -> Histórico -> Mapa
import { chromium, devices } from "playwright";

const BASE = "http://localhost:4173";
const EMAIL = "diego.demo@pontoresidentes.app";
const PASS = "Ponto@2026";
const shots = "/tmp/ponto-shots";

const log = (s) => console.log(s);
let failures = 0;
function check(cond, label) {
  log(`${cond ? "  OK " : "  FALHA "} ${label}`);
  if (!cond) failures++;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  ...devices["Pixel 7"],
  locale: "pt-BR",
  timezoneId: "America/Recife",
  permissions: ["geolocation"],
  geolocation: { latitude: -8.0578, longitude: -34.8961, accuracy: 12 },
});
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(BASE, { waitUntil: "networkidle" });

// ---- LOGIN
log("\n1) LOGIN");
await page.fill("#email", EMAIL);
await page.fill("#senha", PASS);
await page.click('button[type=submit]');
await page.waitForSelector("text=Batidas de hoje", { timeout: 30000 });
check(true, "autenticou e abriu a tela de ponto");
await page.screenshot({ path: `${shots}/01-ponto.png` });

async function punchPrimary(expectLabel) {
  const btn = page.locator("button", { hasText: expectLabel }).first();
  await btn.waitFor({ state: "visible", timeout: 20000 });
  await btn.click();
  // espera sair do estado ocupado
  await page.waitForTimeout(2500);
}

async function timelineCount() {
  return page.locator("text=/^(Início de jornada|Início de intervalo|Fim de intervalo|Fim de jornada)$/").count();
}

// ---- ENTRADA
log("\n2) ENTRADA DA JORNADA");
await punchPrimary("Iniciar jornada");
check((await page.locator("text=Em jornada").count()) > 0, "status virou 'Em jornada'");
check((await timelineCount()) === 1, "1 batida na linha do tempo");

// ---- INTERVALO 1
log("\n3) INTERVALO 1");
await punchPrimary("Iniciar intervalo");
check((await page.locator("text=Em intervalo").count()) > 0, "status virou 'Em intervalo'");
// regra: saída bloqueada com intervalo aberto
const blocked = await page.locator("text=Encerre o intervalo antes de registrar a saída").count();
check(blocked > 0, "saída bloqueada com intervalo aberto (regra 4)");
await page.screenshot({ path: `${shots}/02-intervalo.png` });

log("\n4) FIM DO INTERVALO 1");
await punchPrimary("Voltar do intervalo");
check((await page.locator("text=Em jornada").count()) > 0, "voltou para 'Em jornada'");

// ---- INTERVALO 2 (a sprint exige vários intervalos)
log("\n5) INTERVALO 2");
await punchPrimary("Iniciar intervalo");
check((await page.locator("text=Em intervalo").count()) > 0, "segundo intervalo aberto");

log("\n6) FIM DO INTERVALO 2");
await punchPrimary("Voltar do intervalo");
check((await timelineCount()) === 5, "5 batidas registradas");

// ---- SAÍDA
log("\n7) SAÍDA DA JORNADA");
const saida = page.locator("button", { hasText: "Encerrar jornada" }).first();
await saida.click();
await page.waitForTimeout(2500);
check((await page.locator("text=Jornada encerrada").count()) > 0, "jornada encerrada");
// regra 6: após a saída, nenhuma ação nova
const podeIniciar = await page.locator("button", { hasText: "Iniciar intervalo" }).count();
check(podeIniciar === 0, "nenhuma batida nova permitida após a saída (regra 6)");
await page.screenshot({ path: `${shots}/03-encerrada.png` });

// ---- MAPA
log("\n8) MAPA DAS BATIDAS");
await page.locator("nav button", { hasText: "Mapa" }).click();
await page.waitForSelector(".leaflet-container", { timeout: 20000 });
await page.waitForTimeout(2000);
const markers = await page.locator(".punch-map-label").count();
check(markers === 6, `6 marcadores no mapa (encontrados: ${markers})`);
await page.screenshot({ path: `${shots}/04-mapa.png` });

// ---- HISTÓRICO
log("\n9) HISTÓRICO");
await page.locator("nav button", { hasText: "Histórico" }).click();
await page.waitForTimeout(1200);
check((await page.locator("text=Horas no mês").count()) > 0, "histórico com resumo do mês");
await page.locator("text=Consolidado").first().click();
await page.waitForTimeout(1500);
check((await page.locator("text=Início do intervalo").count()) > 0, "detalhe do dia expande as batidas");
await page.screenshot({ path: `${shots}/05-historico.png` });

log(`\nErros de console: ${errors.length}`);
errors.slice(0, 5).forEach((e) => log("  " + e.slice(0, 160)));

log(`\n=== ${failures === 0 ? "TODAS AS VERIFICAÇÕES PASSARAM" : failures + " FALHA(S)"} ===`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
