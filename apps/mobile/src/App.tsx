import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Network } from "@capacitor/network";
import { App as CapApp } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Preferences } from "@capacitor/preferences";

import { supabase } from "./lib/supabase";
import {
  daysAgoISO,
  localDate,
  type Resident,
  type Sector,
  type TimeEntry,
} from "./lib/domain";
import {
  enqueue,
  flushQueue,
  readQueue,
  type PendingPunch,
} from "./lib/queue";
import { Login } from "./screens/Login";
import { Ponto } from "./screens/Ponto";
import { Mapa } from "./screens/Mapa";
import { Historico } from "./screens/Historico";
import { Toast, Spinner } from "./components/ui";
import {
  ClockIcon,
  ListIcon,
  LogoutIcon,
  MapPinIcon,
  RefreshIcon,
  SignalIcon,
  WifiOffIcon,
} from "./components/icons";

type Tab = "ponto" | "mapa" | "historico";

/** Cache local dos dados, para o app abrir com conteúdo mesmo sem rede. */
const CACHE_KEY = "ponto.cache.v1";
type Cache = { resident: Resident; sectors: Sector[]; entries: TimeEntry[] };

async function readCache(): Promise<Cache | null> {
  const { value } = await Preferences.get({ key: CACHE_KEY });
  if (!value) return null;
  try {
    return JSON.parse(value) as Cache;
  } catch {
    return null;
  }
}

async function writeCache(c: Cache): Promise<void> {
  await Preferences.set({ key: CACHE_KEY, value: JSON.stringify(c) });
}

/**
 * Converte a fila offline em eventos "provisórios" para a interface.
 * O residente vê a batida imediatamente, marcada como pendente, em vez de
 * achar que o registro se perdeu.
 */
function pendingAsEntries(pending: PendingPunch[]): TimeEntry[] {
  return pending.map((p) => ({
    id: `pending:${p.id}`,
    resident_id: p.resident_id,
    event_type: p.event_type,
    event_datetime: p.recorded_at,
    sector_id: p.sector_id,
    origin: "automatic" as const,
    latitude: p.latitude,
    longitude: p.longitude,
    justification_id: null,
    created_by: p.created_by,
    is_offline: true,
  }));
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [tab, setTab] = useState<Tab>("ponto");

  const [resident, setResident] = useState<Resident | null>(null);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [serverEntries, setServerEntries] = useState<TimeEntry[]>([]);
  const [pending, setPending] = useState<PendingPunch[]>([]);

  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "warn" } | null>(null);
  const toastTimer = useRef<number | null>(null);

  const flash = useCallback((msg: string, tone: "ok" | "warn" = "ok") => {
    setToast({ msg, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3400);
  }, []);

  /* ---------------- Sessão ---------------- */
  useEffect(() => {
    (async () => {
      try {
        await StatusBar.setStyle({ style: Style.Light });
        await StatusBar.setBackgroundColor({ color: "#0f766e" });
      } catch {
        /* StatusBar não existe no navegador */
      }
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setBooting(false);
      try {
        await SplashScreen.hide();
      } catch {
        /* idem */
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  /* ---------------- Rede ---------------- */
  useEffect(() => {
    let handle: { remove: () => void } | null = null;
    (async () => {
      setOnline((await Network.getStatus()).connected);
      handle = await Network.addListener("networkStatusChange", (s) => {
        setOnline(s.connected);
        if (s.connected) void sync();
      });
    })();
    return () => {
      handle?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- Carga de dados ---------------- */
  const loadFromServer = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: r } = await supabase
      .from("ponto_residents")
      .select("*")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (!r) return;

    const [{ data: s }, { data: e }] = await Promise.all([
      supabase.from("ponto_sectors").select("*").eq("active", true).order("name"),
      supabase
        .from("ponto_time_entries")
        .select("*, ponto_sectors(name)")
        .eq("resident_id", r.id)
        .gte("event_datetime", daysAgoISO(60))
        .order("event_datetime", { ascending: true }),
    ]);

    const cache: Cache = {
      resident: r as Resident,
      sectors: (s ?? []) as Sector[],
      entries: (e ?? []) as TimeEntry[],
    };
    setResident(cache.resident);
    setSectors(cache.sectors);
    setServerEntries(cache.entries);
    await writeCache(cache);
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await flushQueue();
      setPending(await readQueue());
      if (result.rejected.length) {
        // Batida recusada por regra: precisa ser dita, não pode sumir calada.
        flash(
          `Batida não aceita pelo servidor: ${result.rejected[0].message}`,
          "warn"
        );
      } else if (result.synced > 0) {
        flash(
          result.synced === 1
            ? "1 batida sincronizada."
            : `${result.synced} batidas sincronizadas.`
        );
      }
      await loadFromServer();
    } catch {
      /* offline: mantém a fila */
    } finally {
      setSyncing(false);
    }
  }, [flash, loadFromServer]);

  useEffect(() => {
    if (!session) {
      setResident(null);
      setServerEntries([]);
      return;
    }
    (async () => {
      const c = await readCache();
      if (c) {
        setResident(c.resident);
        setSectors(c.sectors);
        setServerEntries(c.entries);
      }
      setPending(await readQueue());
      await sync();
    })();
  }, [session, sync]);

  // Ao voltar do segundo plano, revalida e tenta sincronizar.
  useEffect(() => {
    let handle: { remove: () => void } | null = null;
    (async () => {
      handle = await CapApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive && session) void sync();
      });
    })();
    return () => {
      handle?.remove();
    };
  }, [session, sync]);

  /* ---------------- Registrar batida ---------------- */
  const onPunch = useCallback(
    async (p: PendingPunch) => {
      await enqueue(p);
      setPending(await readQueue());

      if (!(await Network.getStatus()).connected) {
        flash("Sem conexão — batida salva e será enviada automaticamente.", "warn");
        return;
      }
      const result = await flushQueue();
      setPending(await readQueue());
      if (result.rejected.length) {
        flash(result.rejected[0].message, "warn");
      } else if (result.synced > 0) {
        flash("Batida registrada.");
      } else if (result.remaining > 0) {
        flash("Batida salva. Aguardando conexão para sincronizar.", "warn");
      }
      await loadFromServer();
    },
    [flash, loadFromServer]
  );

  /* ---------------- Render ---------------- */
  if (booting) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-sunken">
        <Spinner className="h-8 w-8 text-brand-700" />
      </div>
    );
  }

  if (!session) return <Login />;

  if (!resident) {
    return (
      <div className="safe-top flex h-full flex-col items-center justify-center gap-4 bg-surface-sunken px-8 text-center">
        <Spinner className="h-7 w-7 text-brand-700" />
        <p className="text-[14px] text-ink-muted">
          {online
            ? "Carregando seus dados…"
            : "Sem conexão e sem dados salvos neste aparelho. Conecte-se uma vez para usar o app offline."}
        </p>
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-[13px] font-medium text-brand-700"
        >
          Sair
        </button>
      </div>
    );
  }

  // A interface mistura o que veio do servidor com o que ainda está na fila.
  const pendingEntries = pendingAsEntries(pending);
  const allEntries = [...serverEntries, ...pendingEntries].sort(
    (a, b) =>
      new Date(a.event_datetime).getTime() - new Date(b.event_datetime).getTime()
  );
  const todayEntries = allEntries.filter(
    (e) => localDate(e.event_datetime) === localDate(new Date())
  );

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "ponto", label: "Ponto", icon: <ClockIcon className="h-5 w-5" /> },
    { key: "mapa", label: "Mapa", icon: <MapPinIcon className="h-5 w-5" /> },
    { key: "historico", label: "Histórico", icon: <ListIcon className="h-5 w-5" /> },
  ];

  return (
    <div className="flex h-full flex-col bg-surface-sunken">
      {/* Cabeçalho com indicadores de GPS/rede/sincronização */}
      <header className="safe-top flex-none border-b border-line bg-surface">
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-brand-700 text-[13px] font-bold text-white">
            P
          </div>
          <span className="truncate text-[14px] font-semibold">Ponto Residentes</span>

          <div className="ml-auto flex items-center gap-2">
            {syncing ? (
              <span className="flex items-center gap-1 text-[11.5px] text-brand-700">
                <RefreshIcon className="animate-spin-slow h-3.5 w-3.5" />
                sync
              </span>
            ) : online ? (
              <SignalIcon className="h-4 w-4 text-brand-700" />
            ) : (
              <span className="flex items-center gap-1 text-[11.5px] font-medium text-warn-700">
                <WifiOffIcon className="h-4 w-4" />
                offline
              </span>
            )}
            <button
              onClick={() => supabase.auth.signOut()}
              aria-label="Sair"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted active:bg-surface-raised"
            >
              <LogoutIcon className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        {pending.length > 0 && (
          <button
            onClick={() => void sync()}
            className="flex w-full items-center gap-2 border-t border-warn-300 bg-warn-50 px-4 py-2 text-left text-[12.5px] text-warn-800"
          >
            <RefreshIcon className={`h-4 w-4 ${syncing ? "animate-spin-slow" : ""}`} />
            {pending.length}{" "}
            {pending.length === 1
              ? "batida aguardando sincronização"
              : "batidas aguardando sincronização"}
            <span className="ml-auto font-semibold">
              {online ? "tocar para enviar" : "sem conexão"}
            </span>
          </button>
        )}
      </header>

      <main className="flex-1 overflow-y-auto pt-3.5">
        {tab === "ponto" && (
          <Ponto
            resident={resident}
            sectors={sectors}
            entries={allEntries}
            userId={session.user.id}
            online={online}
            pendingCount={pending.length}
            syncing={syncing}
            onPunch={onPunch}
            onOpenMap={() => setTab("mapa")}
            flash={flash}
          />
        )}
        {tab === "mapa" && <Mapa entries={todayEntries} />}
        {tab === "historico" && <Historico entries={allEntries} />}
      </main>

      {/* Navegação inferior: alcance com o polegar */}
      <nav className="safe-bottom flex-none border-t border-line bg-surface">
        <div className="flex">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
              className={`flex min-h-[58px] flex-1 flex-col items-center justify-center gap-1 text-[11.5px] font-medium ${
                tab === t.key ? "text-brand-700" : "text-ink-faint"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <Toast message={toast?.msg ?? null} tone={toast?.tone} />
    </div>
  );
}
