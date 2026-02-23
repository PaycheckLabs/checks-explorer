export const SERIAL_REGEX =
  /^[A-Z]{3}-[0-9]{4}[A-Z]{2}-[A-Z]{2}[0-9]{2}$/;

export function normalizeSerial(raw: string): string {
  return String(raw || "").trim().toUpperCase();
}

export function isValidSerialFormat(serial: string): boolean {
  return SERIAL_REGEX.test(serial);
}
