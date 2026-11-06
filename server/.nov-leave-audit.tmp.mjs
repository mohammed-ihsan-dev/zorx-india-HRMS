import 'dotenv/config';
import mongoose from 'mongoose';
import { getLeaveSummary } from './src/services/leaveService.js';
await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB });
const db = mongoose.connection.db;
const supers = (await db.collection('users').find({ role: 'SUPER_ADMIN' }).project({ employeeId: 1 }).toArray()).map((u) => String(u.employeeId));
const emps = (await db.collection('employees').find({}).sort({ firstName: 1 }).toArray()).filter((e) => !supers.includes(String(e._id)));
const ref = new Date('2026-11-06T12:00:00Z');
const d = (x) => x.toISOString().slice(0, 10);
console.log('employee'.padEnd(20), 'id'.padEnd(25), 'CL credited/approved/pending/avail', '| Oct CL used', '| Nov CL used', '| SL avail', '| leaves since Oct');
for (const e of emps) {
  const s = (await getLeaveSummary(e, ref)).types;
  const leaves = await db.collection('leaves').find({ employeeId: e._id, startDate: { $gte: new Date('2026-10-01') } }).sort({ startDate: 1 }).toArray();
  const used = (m, t) => leaves.filter((l) => l.leaveType === t && ['APPROVED', 'PENDING'].includes(l.status) && d(l.startDate).startsWith(m)).reduce((a, l) => a + l.days, 0);
  const list = leaves.map((l) => `${l.leaveType[0]}${l.leaveType[1]} ${d(l.startDate)}${l.endDate - l.startDate ? '→' + d(l.endDate) : ''} ${l.days}d ${l.status}${l.duration === 'HALF_DAY' ? ' half' : ''}`).join('; ');
  console.log(`${e.firstName} ${e.lastName || ''}`.trim().padEnd(20), String(e._id), `${s.CASUAL.credited}/${s.CASUAL.approved}/${s.CASUAL.pending}/${s.CASUAL.available}`.padEnd(20), '|', used('2026-10', 'CASUAL'), '|', used('2026-11', 'CASUAL'), '|', s.SICK.available, '|', list || '—');
}
await mongoose.disconnect();
