import type { SmsSender, SmsPayload } from "./smsSender.js";

export class MockSmsSender implements SmsSender {
  async send(payload: SmsPayload): Promise<void> {
    console.info("[mock-sms]", payload.toE164, payload.body);
  }
}
