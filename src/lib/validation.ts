import { z } from "zod";
import { cents } from "./model";
const text = (max: number) => z.string().trim().max(max);
const url = z.union([
  z.literal(""),
  z.url().refine((v) => v.startsWith("https://"), "Utilize HTTPS."),
]);
export const campaignSchema = z
  .object({
    contact_email: z.union([z.literal(""), z.email().max(254)]),
    beneficiary: text(120),
    summary: text(500),
    story: text(12000),
    message: text(2000),
    expenses: text(4000),
    photo_url: url,
    gallery_urls: z
      .array(z.url().refine((v) => v.startsWith("https://")))
      .max(8),
    publication_consent: z.boolean(),
    goal_cents: z.number().int().min(1).max(100000000),
    pix_key: text(77),
    pix_name: text(25),
    pix_city: text(15),
    pix_enabled: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.pix_enabled && (!v.pix_key || !v.pix_name || !v.pix_city))
      ctx.addIssue({
        code: "custom",
        message: "Preencha chave Pix, titular e cidade.",
      });
    if (
      !v.publication_consent &&
      (v.beneficiary ||
        v.summary ||
        v.story ||
        v.message ||
        v.expenses ||
        v.photo_url ||
        v.gallery_urls.length)
    )
      ctx.addIssue({
        code: "custom",
        message: "Registre autorização antes de publicar dados pessoais.",
      });
    if (v.pix_key && !isPixKey(v.pix_key))
      ctx.addIssue({
        code: "custom",
        message:
          "Chave Pix inválida. Use CPF/CNPJ sem pontuação, telefone +55, e-mail ou chave aleatória.",
      });
  });
export function isPixKey(key: string) {
  return /^\d{11}$|^\d{14}$|^\+[1-9]\d{9,14}$|^[^\s@]+@[^\s@]+\.[^\s@]+$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    key,
  );
}
export const donationSchema = z
  .object({
    amount: z.string().transform((v, ctx) => {
      try {
        return cents(v);
      } catch (e) {
        ctx.addIssue({ code: "custom", message: (e as Error).message });
        return z.NEVER;
      }
    }),
    received_at: z.iso
      .datetime({ offset: true })
      .refine(
        (v) => Date.parse(v) <= Date.now() + 60000,
        "Data não pode estar no futuro.",
      ),
    is_anonymous: z.boolean(),
    donor_public_name: text(100),
    consent_note: text(1000),
    payment_reference: text(150),
    admin_notes: text(2000),
    request_id: z.uuid(),
    id: z.union([z.literal(""), z.uuid()]),
    version: z.number().int().min(0),
  })
  .superRefine((v, ctx) => {
    if (!v.is_anonymous && (!v.donor_public_name || !v.consent_note))
      ctx.addIssue({
        code: "custom",
        message: "Nome público exige registro do consentimento.",
      });
  });
export const updateSchema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(3).max(6000),
  document_url: url,
  publication_consent: z.literal(true),
});
