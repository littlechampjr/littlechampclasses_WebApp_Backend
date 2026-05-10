import { env } from "../../env.js";
import type { SmsPayload, SmsSender } from "./smsSender.js";

/** E.164 → digits only, e.g. +919044471115 → 919044471115 */
function mobilesParam(toE164: string): string {
  return toE164.replace(/\D/g, "");
}

function assertHttpSmsConfig(): void {
  const missing: string[] = [];
  if (!env.smsApiUrl) missing.push("SMS_API_URL");
  if (!env.smsAuthKey) missing.push("SMS_AUTH_KEY");
  if (!env.smsSenderId) missing.push("SMS_SENDER");
  if (!env.smsRoute) missing.push("SMS_ROUTE");
  if (!env.smsDltTemplateId) missing.push("SMS_DLT_TEMPLATE_ID");
  if (missing.length > 0) {
    throw new Error(`SMS_PROVIDER=http but missing env: ${missing.join(", ")}`);
  }
}

/**
 * GET SMS API: base URL + query (authkey, mobiles, message, sender, route, country, DLT_TE_ID).
 * Message is URL-encoded (e.g. # → %23).
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

    const base = env.smsApiUrl.replace(/[?&]$/, "");
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
