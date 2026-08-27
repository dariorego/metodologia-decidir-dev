// Gera ícone e splash do app sem dependência externa: desenha um SVG
// (marca "P" teal sobre fundo claro) e converte com o `sips` do macOS.
import { writeFileSync } from "node:fs";

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="224" fill="#0f766e"/>
  <circle cx="512" cy="512" r="356" fill="none" stroke="#5eead4" stroke-width="26" opacity="0.55"/>
  <circle cx="512" cy="512" r="300" fill="#115e59"/>
  <path d="M512 268 v244 l168 104" fill="none" stroke="#ccfbf1" stroke-width="42"
        stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="512" cy="512" r="30" fill="#ccfbf1"/>
</svg>`;

const SPLASH = `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
  <rect width="2732" height="2732" fill="#0f766e"/>
  <circle cx="1366" cy="1256" r="300" fill="none" stroke="#5eead4" stroke-width="20" opacity="0.5"/>
  <circle cx="1366" cy="1256" r="240" fill="#115e59"/>
  <path d="M1366 1060 v196 l134 84" fill="none" stroke="#ccfbf1" stroke-width="34"
        stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="1366" cy="1256" r="24" fill="#ccfbf1"/>
  <text x="1366" y="1700" font-family="system-ui,-apple-system,sans-serif" font-size="104"
        font-weight="600" fill="#ffffff" text-anchor="middle">Ponto Residentes</text>
  <text x="1366" y="1790" font-family="system-ui,-apple-system,sans-serif" font-size="58"
        fill="#99f6e4" text-anchor="middle">Controle de jornada</text>
</svg>`;

writeFileSync(new URL("./icon.svg", import.meta.url), ICON);
writeFileSync(new URL("./splash.svg", import.meta.url), SPLASH);
console.log("SVGs gerados");
