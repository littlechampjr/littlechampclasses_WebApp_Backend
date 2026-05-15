import mongoose, { Schema } from "mongoose";

const adminAuditLogSchema = new Schema(
  {
    actorAdminId: { type: Schema.Types.ObjectId, ref: "Admin", required: true, index: true },
    action: { type: String, required: true, trim: true, maxlength: 120, index: true },
    entityType: { type: String, required: true, trim: true, maxlength: 80, index: true },
    entityId: { type: String, default: "", trim: true, maxlength: 64, index: true },
    summary: { type: String, default: "", trim: true, maxlength: 4000 },
    ip: { type: String, default: "", trim: true, maxlength: 64 },
  },
  { timestamps: true },
);

adminAuditLogSchema.index({ createdAt: -1 });

export type AdminAuditLogDoc = mongoose.InferSchemaType<typeof adminAuditLogSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const AdminAuditLog = mongoose.model("AdminAuditLog", adminAuditLogSchema);
