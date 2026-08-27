// Testa o requisito "Offline" da sprint 02:
// detectar ausência de rede, guardar pendente, sincronizar ao voltar, não duplicar.
import { chromium, devices } from "playwright";

const BASE = "http://localhost:4173";
const EMAIL = "bruno.demo@pontoresidentes.app";
const PASS = "Ponto@2026";
let failures = 0;
const check = (c, l) => { console.log(`${c ? "  OK " : "  FALHA "} ${l}`); if (!c) failures++; };

const browser = await chromium.launch();
const ctx = await browser.newContext({
  ...devices["Pixel 7"], locale: "pt-BR", timezoneId: "America/Recife",
  permissions: ["geolocation"],
  geolocation: { latitude: -8.0578, longitude: -34.8961, accuracy: 15 },
});
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: "networkidle" });
await page.fill("#email", EMAIL);
await page.fill("#senha", PASS);
await page.click("button[type=submit]");
await page.waitForSelector("text=Batidas de hoje", { timeout: 30000 });
console.log("\n1) Logado. Estado inicial carregado.");

const before = await page.locator("text=/^(Início de jornada|Início de intervalo|Fim de intervalo|Fim de jornada)$/").count();
console.log(`   batidas hoje antes do teste: ${before}`);

// ---- 1b. Aquece os chunks do Capacitor com uma batida ONLINE.
// No APK tudo e local (file://), mas servido por HTTP o setOffline do
// Playwright bloqueia ate o localhost e o plugin web nao carregaria.
console.log("\n1b) BATIDA ONLINE (aquece o plugin de GPS)");
{
  const warm = page.locator("button", { hasText: "Iniciar intervalo" }).first();
  await warm.waitFor({ state: "visible", timeout: 15000 });
  await warm.click();
  await page.waitForTimeout(4000);
  check((await page.locator("text=Em intervalo").count()) > 0, "batida online registrada");
}
const baseline = await page.locator("text=/^(Início de jornada|Início de intervalo|Fim de intervalo|Fim de jornada)$/").count();
console.log(`   batidas apos a online: ${baseline}`);

// ---- 2. Corta a rede
console.log("\n2) SEM CONEXÃO");
await ctx.setOffline(true);
await page.waitForTimeout(1200);
check((await page.locator("header >> text=offline").count()) > 0, "app detecta e sinaliza 'offline'");

// ---- 3. Bate o ponto offline
console.log("\n3) BATIDA OFFLINE");
const primary = page.locator("button", { hasText: "Voltar do intervalo" }).first();
  await primary.waitFor({ state: "visible", timeout: 15000 });
await primary.click();
await page.waitForTimeout(3000);
const pendingBanner = await page.locator("text=/aguardando sincronização/").count();
check(pendingBanner > 0, "batida entra na fila e o app avisa que está pendente");
const after = await page.locator("text=/^(Início de jornada|Início de intervalo|Fim de intervalo|Fim de jornada)$/").count();
check(after === baseline + 1, "batida aparece na linha do tempo mesmo sem rede");
await page.screenshot({ path: "/tmp/ponto-shots/06-offline.png" });

// ---- 4. Volta a rede: sincroniza sozinho
console.log("\n4) CONEXÃO RESTABELECIDA");
await ctx.setOffline(false);
await page.evaluate(() => window.dispatchEvent(new Event("online")));
await page.waitForTimeout(6000);
const stillPending = await page.locator("text=/aguardando sincronização/").count();
check(stillPending === 0, "fila esvaziou sozinha ao voltar a conexão");
await page.screenshot({ path: "/tmp/ponto-shots/07-sincronizado.png" });

// ---- 5. Sem duplicata no servidor
console.log("\n5) SEM DUPLICATAS");
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("text=Batidas de hoje", { timeout: 30000 });
await page.waitForTimeout(2500);
const final = await page.locator("text=/^(Início de jornada|Início de intervalo|Fim de intervalo|Fim de jornada)$/").count();
check(final === baseline + 1, `servidor tem exatamente ${baseline + 1} batidas (recarregado do zero): ${final}`);

console.log(`\n=== ${failures === 0 ? "OFFLINE OK" : failures + " FALHA(S)"} ===`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
