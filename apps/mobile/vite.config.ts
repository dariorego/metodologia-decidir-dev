import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Capacitor serve os arquivos de file:// — caminhos relativos são obrigatórios.
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
});
