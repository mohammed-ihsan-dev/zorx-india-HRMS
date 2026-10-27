import mongoose from 'mongoose';

// A company holiday. `date` is UTC midnight of the calendar day, the same
// convention as Attendance.date, so a holiday and a day's attendance share a key.
const holidaySchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

holidaySchema.index({ date: 1 }, { unique: true });

export const Holiday = mongoose.model('Holiday', holidaySchema);
