"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "E-mail ou senha inválidos."
          : error.message
      );
      setLoading(false);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("ponto_profiles")
      .select("role")
      .eq("id", user!.id)
      .single();

    if (!profile) {
      setError("Usuário sem perfil no Ponto Residentes. Fale com a administração.");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }
    router.replace(profile.role === "admin" ? "/admin/agora" : "/ponto");
    router.refresh();
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="hidden flex-col justify-between bg-teal-700 p-14 text-teal-50 lg:flex">
        <Logo dark />
        <div className="flex max-w-[420px] flex-col gap-4">
          <h1 className="font-serif text-[44px] leading-[1.08] tracking-tight">
            Um registro por evento. Nada de planilha no fim do mês.
          </h1>
          <p className="text-[15px] leading-relaxed text-teal-200">
            Início de jornada, intervalo, retorno e saída — com setor, trilha de
            auditoria e justificativa quando a jornada anterior fica aberta.
          </p>
        </div>
        <div className="flex gap-7 text-[12.5px] text-teal-300">
          <span>LGPD · dados em trânsito e em repouso</span>
          <span>v1.0 · MVP</span>
        </div>
      </div>

      <div className="flex items-center justify-center p-10">
        <form
          onSubmit={handleLogin}
          className="flex w-full max-w-[360px] flex-col gap-5"
        >
          <div className="mb-2 lg:hidden">
            <Logo />
          </div>
          <div className="flex flex-col gap-1.5">
            <h2 className="text-2xl font-semibold tracking-tight">Entrar</h2>
            <p className="text-sm text-stone-500">
              Use suas credenciais da instituição.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[12.5px] font-medium text-stone-600">
                E-mail institucional
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-[10px] border border-stone-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-teal-700"
                placeholder="nome@instituicao.org.br"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12.5px] font-medium text-stone-600">
                Senha
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-[10px] border border-stone-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-teal-700"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-[10px] border border-amber-300 bg-amber-50 px-3.5 py-3 text-[13px] text-amber-900">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="cursor-pointer rounded-[10px] bg-teal-700 py-3.5 text-[14.5px] font-semibold text-white transition-colors hover:bg-teal-800 disabled:bg-stone-300"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
          <p className="text-center text-[12.5px] text-stone-400">
            O perfil (residente ou administração) é definido pelo cadastro.
          </p>
        </form>
      </div>
    </div>
  );
}
