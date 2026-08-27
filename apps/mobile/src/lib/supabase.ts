import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Preferences } from "@capacitor/preferences";

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!URL || !ANON) {
  throw new Error(
    "VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são obrigatórios no build do app."
  );
}

/**
 * Armazenamento da sessão em Preferences (SharedPreferences no Android).
 * localStorage do WebView pode ser limpo pelo sistema; Preferences sobrevive,
 * então o residente não é deslogado entre plantões.
 */
const capacitorStorage = {
  async getItem(key: string) {
    const { value } = await Preferences.get({ key });
    return value ?? null;
  },
  async setItem(key: string, value: string) {
    await Preferences.set({ key, value });
  },
  async removeItem(key: string) {
    await Preferences.remove({ key });
  },
};

export const supabase: SupabaseClient = createClient(URL, ANON, {
  auth: {
    storage: capacitorStorage,
    persistSession: true,
    autoRefreshToken: true,
    // Não há redirect de OAuth no app: evita o parser de URL do WebView.
    detectSessionInUrl: false,
  },
});
