import "server-only";
import { createClient } from "@supabase/supabase-js";
import { emptySnapshot, type Snapshot } from "./model";
import { configured } from "./supabase/server";
export async function getSnapshot(): Promise<Snapshot> {
  if (!configured()) return emptySnapshot;
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { persistSession: false },
      global: {
        fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }),
      },
    },
  );
  const { data, error } = await db.rpc("public_snapshot");
  if (error)
    throw new Error("Não foi possível atualizar os dados da campanha.");
  return { ...data, configured: true } as Snapshot;
}
