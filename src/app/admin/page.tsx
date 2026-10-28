import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin, configured } from "@/lib/supabase/server";
import { Admin } from "@/components/admin";
import { getSnapshot } from "@/lib/data";
import { logout } from "./actions";
import type { Donation, Audit } from "@/lib/admin-model";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Administração",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!configured())
    return (
      <main id="conteudo" className="legal">
        <h1>Conecte o Supabase</h1>
        <p>
          Configure as variáveis indicadas no README e execute a migration para
          habilitar a área administrativa.
        </p>
        <Link href="/">Voltar para a campanha</Link>
      </main>
    );
  let db;
  try {
    db = await requireAdmin();
  } catch {
    redirect("/admin/login");
  }
  const params = await searchParams;
  const page = Math.max(0, Math.min(100000, Number(params.page) || 0));
  const q =
    typeof params.q === "string"
      ? params.q.replace(/[^\p{L}\p{N} @_-]/gu, "").slice(0, 100)
      : "";
  const from =
    typeof params.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.from)
      ? params.from
      : "";
  const to =
    typeof params.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.to)
      ? params.to
      : "";
  let query = db
    .from("donations")
    .select("*", { count: "exact" })
    .order("received_at", { ascending: false })
    .order("id")
    .range(page * 30, page * 30 + 29);
  if (q)
    query = query.or(
      `donor_public_name.ilike.%${q}%,payment_reference.ilike.%${q}%`,
    );
  if (from) query = query.gte("received_at", from + "T00:00:00-04:00");
  if (to) query = query.lte("received_at", to + "T23:59:59.999-04:00");
  const [donations, audit, snapshot, privateCampaign] = await Promise.all([
    query,
    db
      .from("audit_logs")
      .select("id,actor,table_name,record_id,operation,created_at")
      .order("id", { ascending: false })
      .limit(60),
    getSnapshot(),
    db.from("campaigns").select("content").eq("id", true).single(),
  ]);
  if (donations.error || audit.error || privateCampaign.error)
    throw new Error("Falha ao carregar registros privados.");
  const link = (p: number) =>
    "/admin?" + new URLSearchParams({ page: String(p), q, from, to });
  return (
    <main id="conteudo" className="admin-shell">
      <header className="admin-header">
        <h1>Painel da campanha</h1>
        <div>
          <Link className="outline" href="/">
            Ver campanha ↗
          </Link>
          <form action={logout}>
            <button className="outline">Sair</button>
          </form>
        </div>
      </header>
      <Admin
        snapshot={{ ...snapshot, campaign: privateCampaign.data!.content }}
        donations={(donations.data || []) as Donation[]}
        audit={(audit.data || []) as Audit[]}
      />
      <div className="admin-panel">
        <h2>Consultar histórico</h2>
        <form className="filter-row">
          <label>
            Nome público ou referência
            <input name="q" defaultValue={q} />
          </label>
          <label>
            Recebido de (Cuiabá)
            <input name="from" type="date" defaultValue={from} />
          </label>
          <label>
            Até
            <input name="to" type="date" defaultValue={to} />
          </label>
          <button className="outline">Filtrar</button>
        </form>
        <p>
          {donations.count} registros · página {page + 1} · até 30 por página
        </p>
        <div className="share-buttons">
          {page > 0 && (
            <Link href={link(page - 1)} className="outline">
              Anterior
            </Link>
          )}
          {(page + 1) * 30 < (donations.count || 0) && (
            <Link href={link(page + 1)} className="outline">
              Próxima
            </Link>
          )}
          <a className="outline" href="/admin/export">
            Exportar histórico completo (CSV privado)
          </a>
        </div>
      </div>
    </main>
  );
}
