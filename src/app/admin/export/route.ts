import { requireAdmin } from "@/lib/supabase/server";
import { csvCell } from "@/lib/csv";
export const dynamic = "force-dynamic";
export async function GET() {
  let db;
  try {
    db = await requireAdmin();
  } catch {
    return new Response("Não autorizado", { status: 401 });
  }
  const lines = [
    "id;valor_centavos;status;recebido_em;nome_publico;anonimo;referencia;observacoes",
  ];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("donations")
      .select(
        "id,amount_cents,status,received_at,donor_public_name,is_anonymous,payment_reference,admin_notes",
      )
      .order("created_at")
      .order("id")
      .range(from, from + 999);
    if (error) return new Response("Falha ao exportar", { status: 500 });
    for (const d of data)
      lines.push(
        [
          d.id,
          d.amount_cents,
          d.status,
          d.received_at,
          d.donor_public_name,
          d.is_anonymous,
          d.payment_reference,
          d.admin_notes,
        ]
          .map(csvCell)
          .join(";"),
      );
    if (data.length < 1000) break;
  }
  return new Response("\uFEFF" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="doacoes-privado.csv"',
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
