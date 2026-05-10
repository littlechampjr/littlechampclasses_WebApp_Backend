import { env } from "../../env.js";
import type { SmsPayload, SmsSender } from "./smsSender.js";

/** E.164 → digits only, e.g. +919044471115 → 919044471115 */
function mobilesParam(toE164: string): string {
  return toE164.replace(/\D/g, "");
}

/** Strip accidental ?query if .env pasted a full sample URL — credentials must come from env vars. */
function smsEndpointBase(): string {
  const raw = env.smsApiUrl.trim().replace(/[?&]$/, "");
  if (!raw) return "";
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}`.replace(/\/$/, "") || u.origin;
  } catch {
    const beforeQuery = raw.split("?")[0]?.trim() ?? raw;
    return beforeQuery.replace(/[?&]$/, "");
  }
}

function assertHttpSmsConfig(): void {
  const missing: string[] = [];
  if (!smsEndpointBase()) missing.push("SMS_API_URL");
  if (!env.smsAuthKey) missing.push("SMS_AUTH_KEY");
  if (!env.smsSenderId) missing.push("SMS_SENDER");
  if (!env.smsRoute) missing.push("SMS_ROUTE");
  if (!env.smsDltTemplateId) missing.push("SMS_DLT_TEMPLATE_ID");
  if (missing.length > 0) {
    throw new Error(`HTTP SMS is enabled but missing env: ${missing.join(", ")}`);
  }
}

/**
 * DigiCoders / MSG91-style GET: SMS_API_URL?authkey=&mobiles=&message=&sender=&route=&country=&DLT_TE_ID=
 * `mobiles` and `message` come from each send (OTP text from routes).
 */
export class HttpQuerySmsSender implements SmsSender {
  async send(payload: SmsPayload): Promise<void> {
    assertHttpSmsConfig();

    const params = new URLSearchParams({
      authkey: env.smsAuthKey,
      mobiles: mobilesParam(payload.toE164),
      message: payload.body,
      sender: env.smsSenderId,
      route: env.smsRoute,
      country: env.smsCountry,
      DLT_TE_ID: env.smsDltTemplateId,
    });

    const base = smsEndpointBase();
    const sep = base.includes("?") ? "&" : "?";
    const url = `${base}${sep}${params.toString()}`;

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 20_000);
    let res: Response;
    try {
      res = await fetch(url, { method: "GET", signal: ac.signal });
    } finally {
      clearTimeout(t);
    }

    const text = (await res.text()).trim();

    if (!res.ok) {
      throw new Error(`SMS HTTP ${res.status}: ${text.slice(0, 500)}`);
    }

    const lower = text.toLowerCase();
    if (lower.startsWith("error") || lower.includes("authentication failure")) {
      throw new Error(`SMS API rejected: ${text.slice(0, 500)}`);
    }
  }
}
