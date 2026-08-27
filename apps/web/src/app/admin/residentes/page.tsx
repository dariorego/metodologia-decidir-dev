"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createClient as createBareClient } from "@supabase/supabase-js";
import {
  localDateBR,
  type Resident,
  type ResidentStatus,
  type Sector,
} from "@/lib/domain";
import {
  Avatar,
  Badge,
  Pill,
  Toast,
  btnGhost,
  btnPrimary,
  inputCls,
  labelCls,
} from "@/components/ui";

type Filter = "active" | "inactive" | "all";

interface FormState {
  id?: string;
  profile_id?: string;
  full_name: string;
  email: string;
  password: string;
  registration_number: string;
  program: string;
  status: ResidentStatus;
  default_sector_id: string;
  entry_date: string;
  exit_date: string;
}

const EMPTY: FormState = {
  full_name: "",
  email: "",
  password: "",
  registration_number: "",
  program: "",
  status: "active",
  default_sector_id: "",
  entry_date: "",
  exit_date: "",
};

export default function ResidentesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"new" | "edit" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const load = useCallback(async () => {
    const [r, s] = await Promise.all([
      supabase
        .from("ponto_residents")
        .select("*, ponto_profiles(id, full_name, role)")
        .order("created_at"),
      supabase.from("ponto_sectors").select("*").eq("active", true).order("name"),
    ]);
    setResidents((r.data ?? []) as Resident[]);
    setSectors((s.data ?? []) as Sector[]);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const activeCount = residents.filter((r) => r.status === "active").length;
  const filtered = residents.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    const hay = `${r.ponto_profiles?.full_name ?? ""} ${r.registration_number}`;
    return hay.toLowerCase().includes(search.toLowerCase());
  });

  function openNew() {
    setForm(EMPTY);
    setError(null);
    setModal("new");
  }

  function openEdit(r: Resident) {
    setForm({
      id: r.id,
      profile_id: r.profile_id,
      full_name: r.ponto_profiles?.full_name ?? "",
      email: "",
      password: "",
      registration_number: r.registration_number,
      program: r.program ?? "",
      status: r.status,
      default_sector_id: r.default_sector_id ?? "",
      entry_date: r.entry_date,
      exit_date: r.exit_date ?? "",
    });
    setError(null);
    setModal("edit");
  }

  async function save() {
    setError(null);
    if (!form.full_name || !form.registration_number || !form.entry_date) {
      setError("Preencha nome, matrícula e data de entrada.");
      return;
    }
    setBusy(true);

    if (modal === "new") {
      if (!form.email || form.password.length < 8) {
        setError("Informe e-mail e uma senha provisória com ao menos 8 caracteres.");
        setBusy(false);
        return;
      }
      // Cliente isolado: cria o usuário no Auth sem tocar na sessão do admin
      const bare = createBareClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
      const { data: signUp, error: sError } = await bare.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { full_name: form.full_name } },
      });
      if (sError || !signUp.user) {
        setError(sError?.message ?? "Erro ao criar usuário.");
        setBusy(false);
        return;
      }
      const userId = signUp.user.id;

      const { error: pError } = await supabase.from("ponto_profiles").insert({
        id: userId,
        full_name: form.full_name,
        role: "resident",
      });
      if (pError) {
        setError(`Usuário criado, mas falhou o perfil: ${pError.message}`);
        setBusy(false);
        return;
      }
      const { error: rError } = await supabase.from("ponto_residents").insert({
        profile_id: userId,
        registration_number: form.registration_number,
        program: form.program || null,
        status: form.status,
        default_sector_id: form.default_sector_id || null,
        entry_date: form.entry_date,
        exit_date: form.exit_date || null,
      });
      if (rError) {
        setError(`Perfil criado, mas falhou o cadastro: ${rError.message}`);
        setBusy(false);
        return;
      }
      flash(`Residente ${form.full_name} cadastrado`);
    } else {
      const [{ error: pError }, { error: rError }] = await Promise.all([
        supabase
          .from("ponto_profiles")
          .update({ full_name: form.full_name })
          .eq("id", form.profile_id!),
        supabase
          .from("ponto_residents")
          .update({
            registration_number: form.registration_number,
            program: form.program || null,
            status: form.status,
            default_sector_id: form.default_sector_id || null,
            entry_date: form.entry_date,
            exit_date: form.exit_date || null,
          })
          .eq("id", form.id!),
      ]);
      if (pError || rError) {
        setError((pError ?? rError)!.message);
        setBusy(false);
        return;
      }
      flash("Cadastro atualizado");
    }

    setBusy(false);
    setModal(null);
    load();
  }

  return (
    <div className="flex flex-col gap-4.5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[23px] font-semibold tracking-tight">Residentes</h1>
          <p className="text-[13.5px] text-ink-muted">
            {activeCount} ativos · {residents.length - activeCount} inativos ·
            datas de entrada e saída na instituição
          </p>
        </div>
        <button onClick={openNew} className={btnPrimary}>
          Novo residente
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Pill active={filter === "active"} onClick={() => setFilter("active")}>
          Ativos
        </Pill>
        <Pill active={filter === "inactive"} onClick={() => setFilter("inactive")}>
          Inativos
        </Pill>
        <Pill active={filter === "all"} onClick={() => setFilter("all")}>
          Todos
        </Pill>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou matrícula"
          className="ml-auto w-[230px] rounded-[9px] border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-brand-700"
        />
      </div>

      <div className="overflow-x-auto rounded-[14px] border border-line bg-surface">
        <div className="grid min-w-[700px] grid-cols-[1.6fr_1fr_110px_110px_100px_84px] gap-3 border-b border-line bg-surface-raised px-4.5 py-3 text-[11.5px] font-semibold tracking-wider text-ink-muted uppercase">
          <div>Residente</div>
          <div>Programa</div>
          <div>Entrada</div>
          <div>Saída</div>
          <div>Status</div>
          <div />
        </div>
        {filtered.length === 0 && (
          <div className="px-4.5 py-10 text-center text-sm text-ink-faint">
            Nenhum residente encontrado.
          </div>
        )}
        {filtered.map((r) => (
          <div
            key={r.id}
            className="grid min-w-[700px] grid-cols-[1.6fr_1fr_110px_110px_100px_84px] items-center gap-3 border-b border-line px-4.5 py-3"
          >
            <div className="flex items-center gap-2.5">
              <Avatar
                name={r.ponto_profiles?.full_name ?? "?"}
                tone={r.status === "active" ? "ok" : "muted"}
              />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-[13.5px] font-medium">
                  {r.ponto_profiles?.full_name}
                </span>
                <span className="text-[11.5px] text-ink-faint">
                  {r.registration_number}
                </span>
              </div>
            </div>
            <div className="text-[13px] text-ink-soft">{r.program ?? "—"}</div>
            <div className="text-[13px] text-ink-soft tabular-nums">
              {localDateBR(`${r.entry_date}T12:00:00-03:00`)}
            </div>
            <div className="text-[13px] text-ink-muted tabular-nums">
              {r.exit_date ? localDateBR(`${r.exit_date}T12:00:00-03:00`) : "—"}
            </div>
            <div>
              <Badge tone={r.status === "active" ? "ok" : "muted"}>
                {r.status === "active" ? "Ativo" : "Inativo"}
              </Badge>
            </div>
            <button
              onClick={() => openEdit(r)}
              className="cursor-pointer justify-self-start rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-soft transition-colors hover:border-brand-700 hover:text-brand-700"
            >
              Editar
            </button>
          </div>
        ))}
      </div>

      {modal && (
        <div
          className="animate-fade-in fixed inset-0 z-20 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => setModal(null)}
        >
          <div
            className="animate-sheet-in flex max-h-[90vh] w-full max-w-[520px] flex-col gap-4 overflow-auto rounded-[16px] bg-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-lg font-semibold tracking-tight">
              {modal === "new" ? "Novo residente" : "Editar residente"}
            </span>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className={labelCls}>Nome completo</label>
                <input
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className={inputCls}
                />
              </div>
              {modal === "new" && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>E-mail institucional</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Senha provisória</label>
                    <input
                      value={form.password}
                      onChange={(e) =>
                        setForm({ ...form, password: e.target.value })
                      }
                      className={inputCls}
                      placeholder="mín. 8 caracteres"
                    />
                  </div>
                </>
              )}
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Matrícula</label>
                <input
                  value={form.registration_number}
                  onChange={(e) =>
                    setForm({ ...form, registration_number: e.target.value })
                  }
                  className={inputCls}
                  placeholder="ex.: MR-2043"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Programa</label>
                <input
                  value={form.program}
                  onChange={(e) => setForm({ ...form, program: e.target.value })}
                  className={inputCls}
                  placeholder="ex.: R2 Clínica Médica"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Setor padrão</label>
                <select
                  value={form.default_sector_id}
                  onChange={(e) =>
                    setForm({ ...form, default_sector_id: e.target.value })
                  }
                  className={inputCls}
                >
                  <option value="">—</option>
                  {sectors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Status</label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm({ ...form, status: e.target.value as ResidentStatus })
                  }
                  className={inputCls}
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Data de entrada</label>
                <input
                  type="date"
                  value={form.entry_date}
                  onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Data de saída</label>
                <input
                  type="date"
                  value={form.exit_date}
                  onChange={(e) => setForm({ ...form, exit_date: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-[10px] border border-warn-300 bg-warn-50 px-3.5 py-3 text-[13px] text-warn-900">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={save} disabled={busy} className={btnPrimary}>
                {busy ? "Salvando…" : "Salvar"}
              </button>
              <button onClick={() => setModal(null)} className={btnGhost}>
                Cancelar
              </button>
            </div>
            {modal === "new" && (
              <p className="text-xs leading-relaxed text-ink-faint">
                O residente entra com o e-mail e a senha provisória. Se o projeto
                exigir confirmação de e-mail, ele recebe o link antes do primeiro
                acesso.
              </p>
            )}
          </div>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}
