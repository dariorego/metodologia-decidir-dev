import { useState } from "react";
import { supabase } from "../lib/supabase";
import { Button, Spinner } from "../components/ui";
import { AlertIcon } from "../components/icons";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (authError) {
      setError(
        authError.message === "Invalid login credentials"
          ? "E-mail ou senha inválidos."
          : /network|fetch/i.test(authError.message)
            ? "Sem conexão. O primeiro login exige internet."
            : authError.message
      );
      setBusy(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: resident } = await supabase
      .from("ponto_residents")
      .select("id")
      .eq("profile_id", user!.id)
      .maybeSingle();

    if (!resident) {
      setError(
        "Este login não tem cadastro de residente. O app é exclusivo para residentes — a administração usa o sistema web."
      );
      await supabase.auth.signOut();
      setBusy(false);
      return;
    }
    // A sessão dispara onAuthStateChange no App e troca de tela.
  }

  return (
    <div className="safe-top safe-bottom flex min-h-full flex-col justify-center bg-surface-sunken px-6 py-10">
      <div className="mx-auto flex w-full max-w-[420px] flex-col gap-7">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-brand-700 text-[30px] font-bold text-white shadow-brand">
            P
          </div>
          <div className="flex flex-col items-center gap-1">
            <h1 className="text-[22px] font-semibold tracking-tight">
              Ponto Residentes
            </h1>
            <p className="text-center text-[13.5px] text-ink-muted">
              Entre com as credenciais da instituição.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-[13px] font-semibold text-ink-soft">
              E-mail institucional
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@instituicao.org.br"
              className="min-h-[52px] rounded-field border border-line bg-surface px-4 text-[15px] outline-none focus:border-brand-700"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="senha" className="text-[13px] font-semibold text-ink-soft">
              Senha
            </label>
            <input
              id="senha"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="min-h-[52px] rounded-field border border-line bg-surface px-4 text-[15px] outline-none focus:border-brand-700"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="flex gap-2.5 rounded-field border border-warn-300 bg-warn-50 px-3.5 py-3 text-[13px] leading-relaxed text-warn-900"
            >
              <AlertIcon className="mt-0.5 h-4 w-4 flex-none text-warn-700" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" full disabled={busy} className="mt-1">
            {busy ? <Spinner /> : null}
            {busy ? "Entrando…" : "Entrar"}
          </Button>
        </form>

        <p className="text-center text-[12px] leading-relaxed text-ink-faint">
          Depois do primeiro login a sessão fica salva no aparelho e o app
          funciona mesmo sem conexão.
        </p>
      </div>
    </div>
  );
}
