/** Normalize user input to E.164 for India (+91 + 10 digits). */
export function normalizeIndianMobile(input: string):
  | { ok: true; e164: string; national10: string }
  | { ok: false; error: string } {
  const digits = input.replace(/\D/g, "");
  let rest = digits;
  if (rest.startsWith("91") && rest.length === 12) {
    rest = rest.slice(2);
  }
  if (rest.length !== 10) {
    return { ok: false, error: "Enter a valid 10-digit mobile number." };
  }
  if (!/^[6-9]/.test(rest)) {
    return { ok: false, error: "Enter a valid Indian mobile number." };
  }
  return { ok: true, e164: `+91${rest}`, national10: rest };
}
