import mongoose, { Schema } from "mongoose";

const ROLES = ["admin", "sub_admin"] as const;

const adminSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true, index: true },
    /** When role is sub_admin, checked against ADMIN_PERMISSIONS values; admin role ignores this. */
    permissions: { type: [String], default: [] },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export type AdminDoc = mongoose.InferSchemaType<typeof adminSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Admin = mongoose.model("Admin", adminSchema);
