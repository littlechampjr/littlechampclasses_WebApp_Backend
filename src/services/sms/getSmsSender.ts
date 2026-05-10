import { env } from "../../env.js";
import { HttpQuerySmsSender } from "./httpQuerySmsSender.js";
import { MockSmsSender } from "./mockSms.js";
import type { SmsSender } from "./smsSender.js";

export function getSmsSender(): SmsSender {
  if (env.smsProvider === "mock") {
    return new MockSmsSender();
  }
  if (env.smsProvider === "http" || env.smsProvider === "digicoders") {
    return new HttpQuerySmsSender();
  }
  return new MockSmsSender();
}
