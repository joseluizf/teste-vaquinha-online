import { getSnapshot } from "@/lib/data";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(await getSnapshot(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Dados temporariamente indisponíveis." },
      { status: 503 },
    );
  }
}
