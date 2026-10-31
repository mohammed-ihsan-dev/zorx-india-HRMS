import mongoose from 'mongoose';
import { EMPLOYMENT_TYPE, WORK_MODE } from '../utils/constants.js';

const employeeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    employeeCode: { type: String, default: '', trim: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, default: '', trim: true },
    profileImage: { type: String, default: '' },
    phone: { type: String, default: '' },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    designation: { type: String, default: '' },
    joiningDate: { type: Date, required: true },
    dateOfBirth: { type: Date, default: null },
    employmentType: {
      type: String,
      enum: Object.values(EMPLOYMENT_TYPE),
      default: EMPLOYMENT_TYPE.FULL_TIME,
    },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    address: { type: String, default: '' },
    emergencyContact: {
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
      relation: { type: String, default: '' },
    },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    // Documents created before this field existed have no value and are OFFICE.
    workMode: { type: String, enum: Object.values(WORK_MODE), default: WORK_MODE.OFFICE },
    // Optional "HH:mm" official check-in time for this employee only, used for
    // late calculation. null = the office's workingStartTime.
    workingStartTime: { type: String, default: null },
    // Optional personal schedule (HR/Admin only), all in the office timezone like
    // workingStartTime; null = the office's. Used for remote staff in another timezone.
    workingEndTime: { type: String, default: null },
    dailyTargetMinutes: { type: Number, default: null, min: 60, max: 720 },
    // Start of "overtime after N PM" for this employee (default 19:00 company time).
    overtimeCutoffTime: { type: String, default: null },
    // Optional own attendance site (HR/Admin only). When active, this employee's
    // check-in/out is GPS-validated against it instead of the main office.
    // Missing = the main office, as before (no default, older records unchanged).
    attendanceLocation: {
      type: new mongoose.Schema(
        {
          name: { type: String, required: true, trim: true, maxlength: 120 },
          latitude: { type: Number, required: true, min: -90, max: 90 },
          longitude: { type: Number, required: true, min: -180, max: 180 },
          radiusMeters: { type: Number, required: true, min: 20, max: 5000 },
          active: { type: Boolean, default: true },
        },
        { _id: false }
      ),
      default: undefined,
    },
  },
  { timestamps: true }
);

employeeSchema.index({ departmentId: 1 });
employeeSchema.index({ managerId: 1 });

employeeSchema.virtual('fullName').get(function fullName() {
  return `${this.firstName} ${this.lastName || ''}`.trim();
});

employeeSchema.virtual('avatarUrl').get(function avatarUrl() {
  return this.profileImage || '';
});

employeeSchema.set('toJSON', { virtuals: true });
employeeSchema.set('toObject', { virtuals: true });

export const Employee = mongoose.model('Employee', employeeSchema);
