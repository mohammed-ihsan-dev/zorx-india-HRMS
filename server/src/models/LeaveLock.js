import mongoose from 'mongoose';

// Short-lived per-employee lock that serializes Casual Leave balance checks
// (submission and approval), so two simultaneous requests can never both
// spend the same remaining day. The unique index is what guarantees one
// holder at a time; lockedUntil lets a crashed request's lock be taken over.
const leaveLockSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  token: { type: String, required: true },
  lockedUntil: { type: Date, required: true },
});

leaveLockSchema.index({ employeeId: 1 }, { unique: true });
// Clean-up only (MongoDB's TTL sweep runs about once a minute); correctness
// never depends on it, since an expired lock can always be taken over.
leaveLockSchema.index({ lockedUntil: 1 }, { expireAfterSeconds: 60 });

export const LeaveLock = mongoose.model('LeaveLock', leaveLockSchema);
