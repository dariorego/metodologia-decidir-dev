// Cria usuários de demonstração e registros de exemplo no Supabase.
// Requer a chave service_role (NUNCA commitar). Uso:
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... npm run seed:demo
// Pré-requisito: a migração supabase/migrations/0001_ponto_schema.sql já aplicada.

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const PASSWORD = "Ponto@2026";

const USERS = [
  { email: "admin.demo@pontoresidentes.app", name: "Carla Mendes", role: "admin" },
  { email: "ana.demo@pontoresidentes.app", name: "Ana Ribeiro", role: "resident", reg: "MR-2043", program: "R2 Clínica Médica", sector: "UTI-AD", entry: "2025-03-01" },
  { email: "bruno.demo@pontoresidentes.app", name: "Bruno Sato", role: "resident", reg: "MR-2118", program: "R1 Cirurgia", sector: "CC", entry: "2026-03-01" },
  { email: "helena.demo@pontoresidentes.app", name: "Helena Costa", role: "resident", reg: "MR-1877", program: "R3 Pediatria", sector: "ENF-B", entry: "2024-03-01", exit: "2027-02-28" },
  { email: "diego.demo@pontoresidentes.app", name: "Diego Alves", role: "resident", reg: "MR-2051", program: "R2 Ortopedia", sector: "PS", entry: "2025-03-01" },
  { email: "paulo.demo@pontoresidentes.app", name: "Paulo Vieira", role: "resident", reg: "MR-1690", program: "R3 Cardiologia", sector: "AMB-3", entry: "2023-03-01", exit: "2026-02-28", status: "inactive" },
];

async function ensureUser(u) {
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find((x) => x.email === u.email);
  if (existing) return existing.id;
  const { data, error } = await sb.auth.admin.createUser({
    email: u.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: u.name },
  });
  if (error) throw error;
  return data.user.id;
}

function recife(dayOffset, hhmm) {
  const now = new Date();
  const local = new Date(now.toLocaleString("en-US", { timeZone: "America/Recife" }));
  local.setDate(local.getDate() - dayOffset);
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, "0");
  const d = String(local.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}T${hhmm}:00-03:00`;
}

async function main() {
  const { data: sectors, error: sErr } = await sb.from("ponto_sectors").select("id, code");
  if (sErr) throw sErr;
  const sectorByCode = Object.fromEntries(sectors.map((s) => [s.code, s.id]));

  const residentIds = {};
  let adminId = null;

  for (const u of USERS) {
    const id = await ensureUser(u);
    await sb.from("ponto_profiles").upsert({ id, full_name: u.name, role: u.role });
    if (u.role === "admin") {
      adminId = id;
      continue;
    }
    const { data: r, error } = await sb
      .from("ponto_residents")
      .upsert(
        {
          profile_id: id,
          registration_number: u.reg,
          program: u.program,
          status: u.status ?? "active",
          default_sector_id: sectorByCode[u.sector] ?? null,
          entry_date: u.entry,
          exit_date: u.exit ?? null,
        },
        { onConflict: "profile_id" }
      )
      .select("id")
      .single();
    if (error) throw error;
    residentIds[u.email] = { id: r.id, profileId: id, sector: sectorByCode[u.sector] };
    console.log(`residente ok: ${u.name}`);
  }

  // Registros de exemplo (apenas se o residente ainda não tiver nenhum)
  const sample = [
    // Ana: jornadas completas + jornada de 2 dias atrás SEM saída (aciona justificativa)
    { who: "ana.demo@pontoresidentes.app", days: [
      { off: 6, ev: [["clock_in", "07:04"], ["break_start", "12:02"], ["break_end", "12:44"], ["clock_out", "19:20"]] },
      { off: 5, ev: [["clock_in", "07:11"], ["break_start", "12:20"], ["break_end", "12:58"], ["clock_out", "18:44"]] },
      { off: 4, ev: [["clock_in", "07:00"], ["break_start", "11:58"], ["break_end", "12:40"], ["clock_out", "19:05"]] },
      { off: 2, ev: [["clock_in", "19:12"]] },
    ] },
    { who: "bruno.demo@pontoresidentes.app", days: [
      { off: 1, ev: [["clock_in", "06:50"], ["break_start", "12:10"], ["break_end", "12:50"], ["clock_out", "19:02"]] },
      { off: 0, ev: [["clock_in", "06:48"]] },
    ] },
    { who: "helena.demo@pontoresidentes.app", days: [
      { off: 1, ev: [["clock_in", "07:05"], ["clock_out", "18:30"]] },
      { off: 0, ev: [["clock_in", "07:02"], ["break_start", "12:05"]] },
    ] },
    { who: "diego.demo@pontoresidentes.app", days: [
      { off: 3, ev: [["clock_in", "07:00"], ["clock_out", "19:00"]] },
    ] },
  ];

  for (const s of sample) {
    const r = residentIds[s.who];
    const { count } = await sb
      .from("ponto_time_entries")
      .select("id", { count: "exact", head: true })
      .eq("resident_id", r.id);
    if (count) {
      console.log(`registros já existem para ${s.who}, pulando`);
      continue;
    }
    const rows = [];
    for (const d of s.days) {
      for (const [type, hhmm] of d.ev) {
        rows.push({
          resident_id: r.id,
          event_type: type,
          event_datetime: recife(d.off, hhmm),
          sector_id: r.sector,
          origin: "automatic",
          // Batidas automáticas exigem geolocalização (trigger ponto_fn_check_sequence).
          // Coordenadas do IMIP (Recife) com pequena variação por batida.
          latitude: -8.0578 + (Math.random() - 0.5) * 0.001,
          longitude: -34.8961 + (Math.random() - 0.5) * 0.001,
          created_by: r.profileId,
        });
      }
    }
    const { error } = await sb.from("ponto_time_entries").insert(rows);
    if (error) throw error;
    console.log(`registros ok: ${s.who} (${rows.length})`);
  }

  console.log("\nUsuários de demonstração (senha: " + PASSWORD + "):");
  for (const u of USERS) console.log(`  ${u.role.padEnd(9)} ${u.email}`);
  if (!adminId) console.log("atenção: admin não criado");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
