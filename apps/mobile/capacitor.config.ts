import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "br.org.imip.pontoresidentes",
  appName: "Ponto Residentes",
  webDir: "dist",
  android: {
    // O app não carrega conteúdo remoto arbitrário: só o bundle local
    // e as chamadas HTTPS ao Supabase/OpenStreetMap.
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#0f766eff",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    Geolocation: {},
  },
};

export default config;
