import { isPixKey } from "./validation";
function field(id: string, value: string) {
  const length = new TextEncoder().encode(value).length;
  if (length > 99) throw new Error("Campo Pix muito longo.");
  return id + String(length).padStart(2, "0") + value;
}
export function crc16(value: string) {
  let crc = 0xffff;
  for (const b of new TextEncoder().encode(value)) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .trim();
export function pixPayload(
  key: string,
  name: string,
  city: string,
  amount?: number,
) {
  if (!isPixKey(key) || !normalize(name) || !normalize(city))
    throw new Error("Dados Pix incompletos.");
  if (
    amount !== undefined &&
    (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000)
  )
    throw new Error("Valor Pix inválido.");
  const payload =
    field("00", "01") +
    field("26", field("00", "BR.GOV.BCB.PIX") + field("01", key)) +
    field("52", "0000") +
    field("53", "986") +
    (amount ? field("54", (amount / 100).toFixed(2)) : "") +
    field("58", "BR") +
    field("59", normalize(name).slice(0, 25)) +
    field("60", normalize(city).slice(0, 15)) +
    field("62", field("05", "***")) +
    "6304";
  return payload + crc16(payload);
}
