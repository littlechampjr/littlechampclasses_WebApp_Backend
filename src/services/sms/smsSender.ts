export type SmsPayload = {
  toE164: string;
  body: string;
};

export interface SmsSender {
  send(payload: SmsPayload): Promise<void>;
}
