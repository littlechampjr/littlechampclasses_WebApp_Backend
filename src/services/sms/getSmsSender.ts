import { env } from "../../env.js";
import { MockSmsSender } from "./mockSms.js";
import type { SmsSender } from "./smsSender.js";

export function getSmsSender(): SmsSender {
  if (env.smsProvider === "mock" || !env.smsProvider) {
    return new MockSmsSender();
  }
  return new MockSmsSender();
}
