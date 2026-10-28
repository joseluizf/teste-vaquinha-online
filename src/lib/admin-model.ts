export type Donation = {
  id: string;
  amount_cents: number;
  status: string;
  donor_public_name: string;
  is_anonymous: boolean;
  consent_note: string;
  received_at: string;
  payment_reference: string | null;
  admin_notes: string;
  version: number;
  created_at: string;
};
export type Audit = {
  id: number;
  actor: string;
  table_name: string;
  record_id: string;
  operation: string;
  created_at: string;
};
