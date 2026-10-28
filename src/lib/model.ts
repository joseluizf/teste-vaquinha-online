export type Campaign = {
  contact_email: string;
  beneficiary: string;
  summary: string;
  story: string;
  message: string;
  expenses: string;
  photo_url: string;
  gallery_urls: string[];
  publication_consent: boolean;
  goal_cents: number;
  pix_key: string;
  pix_name: string;
  pix_city: string;
  pix_enabled: boolean;
};
export type PublicDonation = {
  id: string;
  amount_cents: number;
  received_at: string;
  name: string;
};
export type Update = {
  id: string;
  title: string;
  body: string;
  document_url: string;
  created_at: string;
};
export type Snapshot = {
  campaign: Campaign;
  total_cents: number;
  count: number;
  updated_at: string | null;
  donations: PublicDonation[];
  updates: Update[];
  configured: boolean;
};
export const emptyCampaign: Campaign = {
  contact_email: "",
  beneficiary: "",
  summary: "",
  story: "",
  message: "",
  expenses: "",
  photo_url: "",
  gallery_urls: [],
  publication_consent: false,
  goal_cents: 10000000,
  pix_key: "",
  pix_name: "",
  pix_city: "",
  pix_enabled: false,
};
export const emptySnapshot: Snapshot = {
  campaign: emptyCampaign,
  total_cents: 0,
  count: 0,
  updated_at: null,
  donations: [],
  updates: [],
  configured: false,
};
export const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
export function indicators(total: number, goal: number) {
  return {
    percent: goal > 0 ? (total / goal) * 100 : 0,
    remaining: Math.max(0, goal - total),
    fill: Math.min(100, goal > 0 ? (total / goal) * 100 : 0),
  };
}
export function cents(value: string) {
  if (!/^\d{1,9}([.,]\d{1,2})?$/.test(value.trim()))
    throw new Error("Informe um valor com até duas casas decimais.");
  const [whole, decimal = ""] = value.trim().replace(",", ".").split(".");
  const n = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  if (n <= 0 || n > 100000000)
    throw new Error("Valor deve ser entre R$ 0,01 e R$ 1.000.000,00.");
  return n;
}
