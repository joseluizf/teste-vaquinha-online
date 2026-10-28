import { test } from "node:test";
import assert from "node:assert/strict";
import { cents, indicators } from "../src/lib/model";
import { crc16, pixPayload } from "../src/lib/pix";
import { donationSchema, campaignSchema } from "../src/lib/validation";
import { emptyCampaign } from "../src/lib/model";
import { csvCell } from "../src/lib/csv";
test("centavos exatos, sem arredondamento silencioso", () => {
  assert.equal(cents("10,01"), 1001);
  assert.equal(cents("0.10"), 10);
  for (const v of ["0", "-1", "1.001", "Infinity", "1e5", "abc"])
    assert.throws(() => cents(v));
});
test("meta ultrapassada mantém percentual real e restante não negativo", () => {
  assert.deepEqual(indicators(15000, 10000), {
    percent: 150,
    remaining: 0,
    fill: 100,
  });
  assert.deepEqual(indicators(0, 10000000), {
    percent: 0,
    remaining: 10000000,
    fill: 0,
  });
});
test("CRC16 CCITT-FALSE e BR Code com valor e campos válidos", () => {
  assert.equal(crc16("123456789"), "29B1");
  const p = pixPayload("test@example.com", "RECEBEDOR TESTE", "CUIABA", 5000);
  assert.ok(p.includes("540550.00"));
  assert.equal(p.slice(-4), crc16(p.slice(0, -4)));
  let pos = 0;
  const fields: Record<string, string> = {};
  while (pos < p.length) {
    const id = p.slice(pos, pos + 2),
      length = Number(p.slice(pos + 2, pos + 4));
    fields[id] = p.slice(pos + 4, pos + 4 + length);
    pos += 4 + length;
  }
  assert.equal(pos, p.length);
  assert.equal(fields["53"], "986");
  assert.equal(fields["58"], "BR");
  assert.ok(fields["26"].includes("BR.GOV.BCB.PIX"));
  assert.equal(fields["62"], "0503***");
  assert.ok(
    !pixPayload("test@example.com", "NOME TESTE", "CIDADE").includes("5405"),
  );
  assert.throws(() => pixPayload("", "", "", 5000));
});
test("validação exige consentimento e impede datas futuras", () => {
  const value = {
    amount: "50",
    received_at: new Date().toISOString(),
    is_anonymous: false,
    donor_public_name: "Teste",
    consent_note: "",
    payment_reference: "",
    admin_notes: "",
    request_id: crypto.randomUUID(),
    id: "",
    version: 0,
  };
  assert.equal(donationSchema.safeParse(value).success, false);
  assert.equal(
    donationSchema.safeParse({ ...value, is_anonymous: true }).success,
    true,
  );
  assert.equal(
    donationSchema.safeParse({
      ...value,
      is_anonymous: true,
      received_at: "2099-01-01T00:00:00Z",
    }).success,
    false,
  );
  assert.equal(
    campaignSchema.safeParse({
      ...emptyCampaign,
      story: "Dados sem autorização",
    }).success,
    false,
  );
  assert.equal(
    campaignSchema.safeParse({ ...emptyCampaign, pix_enabled: true }).success,
    false,
  );
});
test("CSV escapa fórmulas e aspas", () => {
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
  assert.equal(csvCell('a"b'), '"a""b"');
});
