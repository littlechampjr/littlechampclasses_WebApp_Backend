import { AdminAuditLog } from "../models/AdminAuditLog.js";

export async function writeAdminAudit(params: {
  actorAdminId: string;
  action: string;
  entityType: string;
  entityId?: string;
  summary?: string;
  ip?: string;
}): Promise<void> {
  await AdminAuditLog.create({
    actorAdminId: params.actorAdminId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId ?? "",
    summary: params.summary ?? "",
    ip: params.ip ?? "",
  });
}
