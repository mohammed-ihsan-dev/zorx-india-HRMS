import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLE_VALUES, USER_STATUS, PERMISSION_VALUES } from '../utils/constants.js';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ROLE_VALUES,
      required: true,
      default: 'EMPLOYEE',
    },
    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.ACTIVE,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      default: null,
    },
    // Explicit permission grants on top of the role's defaults (see
    // utils/permissions.js). Empty for a normal user of any role — e.g. a
    // "Creator" is simply role: EMPLOYEE with ['CONTENT_CALENDAR_MANAGE'] here.
    permissions: {
      type: [String],
      enum: PERMISSION_VALUES,
      default: [],
    },
    mustChangePassword: {
      type: Boolean,
      default: false,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = function comparePassword(plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

userSchema.statics.hashPassword = function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, 12);
};

export const User = mongoose.model('User', userSchema);
