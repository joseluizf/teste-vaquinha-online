"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { campaignSchema, donationSchema, updateSchema } from "@/lib/validation";
import { requireAdmin, serverDb } from "@/lib/supabase/server";
import { z } from "zod";
export type ActionResult = { ok: boolean; message: string };
async function run(work: () => Promise<void>): Promise<ActionResult> {
  try {
    await work();
    revalidatePath("/");
    revalidatePath("/admin");
    return { ok: true, message: "Registro salvo com sucesso." };
  } catch (e) {
    if (e instanceof z.ZodError)
      return { ok: false, message: e.issues.map((x) => x.message).join(" ") };
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Não foi possível salvar.",
    };
  }
}
function dbError(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === "23505")
    throw new Error(
      "Referência ou operação já registrada. Confira o histórico antes de repetir.",
    );
  if (error.code === "P0001") throw new Error(error.message);
  throw new Error(
    "Não foi possível salvar. Verifique a configuração e sua permissão. Nenhuma alteração parcial foi aplicada.",
  );
}
export async function login(
  _: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({ email: z.email().max(254), password: z.string().min(8).max(256) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { ok: false, message: "Informe e-mail e senha válidos." };
  try {
    const db = await serverDb();
    const { error } = await db.auth.signInWithPassword(parsed.data);
    if (error)
      return {
        ok: false,
        message:
          "Não foi possível entrar. Confira suas credenciais ou aguarde antes de tentar novamente.",
      };
    try {
      await requireAdmin();
    } catch {
      await db.auth.signOut();
      return { ok: false, message: "Usuário sem autorização administrativa." };
    }
  } catch {
    return {
      ok: false,
      message:
        "Autenticação indisponível. Verifique a configuração do Supabase.",
    };
  }
  redirect("/admin");
}
export async function logout() {
  const db = await serverDb();
  await db.auth.signOut();
  redirect("/admin/login");
}
export async function saveDonation(input: unknown) {
  return run(async () => {
    const db = await requireAdmin();
    const value = donationSchema.parse(input);
    const { error } = await db.rpc("record_donation", { p: value });
    dbError(error);
  });
}
export async function cancelDonation(id: string, version: number) {
  return run(async () => {
    const db = await requireAdmin();
    z.uuid().parse(id);
    z.number().int().positive().parse(version);
    const { error } = await db.rpc("cancel_donation", {
      donation_id: id,
      expected_version: version,
    });
    dbError(error);
  });
}
export async function saveCampaign(input: unknown) {
  return run(async () => {
    const db = await requireAdmin();
    const value = campaignSchema.parse(input);
    const { error } = await db
      .from("campaigns")
      .update({ content: value, updated_at: new Date().toISOString() })
      .eq("id", true);
    dbError(error);
  });
}
export async function saveUpdate(input: unknown) {
  return run(async () => {
    const db = await requireAdmin();
    const value = updateSchema.parse(input);
    const { error } = await db.from("campaign_updates").insert(value);
    dbError(error);
  });
}
export async function removeUpdate(id: string) {
  return run(async () => {
    const db = await requireAdmin();
    z.uuid().parse(id);
    const { error } = await db.from("campaign_updates").delete().eq("id", id);
    dbError(error);
  });
}
