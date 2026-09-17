import { Employee } from '../models/Employee.js';
import { Attendance } from '../models/Attendance.js';
import { Leave } from '../models/Leave.js';
import { Task } from '../models/Task.js';
import { Announcement } from '../models/Announcement.js';
import { AuditLog } from '../models/AuditLog.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { getStartOfDayUTC } from '../utils/dateUtils.js';
import { ATTENDANCE_STATUS, LEAVE_STATUS, TASK_STATUS } from '../utils/constants.js';

export const getAdminDashboard = asyncHandler(async (req, res) => {
  const today = getStartOfDayUTC(new Date());

  const [totalEmployees, todayAttendance, pendingLeaves, taskStats, recentAudit, announcements] = await Promise.all([
    Employee.countDocuments({ status: 'ACTIVE' }),
    Attendance.find({ date: today }),
    Leave.countDocuments({ status: LEAVE_STATUS.PENDING }),
    Task.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    AuditLog.find().sort({ createdAt: -1 }).limit(10).populate('actorId', 'email role'),
    Announcement.find({ publishDate: { $lte: new Date() } }).sort({ publishDate: -1 }).limit(5),
  ]);

  const present = todayAttendance.filter((a) => a.checkIn).length;
  const currentlyWorking = todayAttendance.filter((a) => a.checkIn && !a.checkOut).length;
  const late = todayAttendance.filter((a) => a.status === ATTENDANCE_STATUS.LATE).length;
  const onLeaveToday = await Leave.countDocuments({
    status: LEAVE_STATUS.APPROVED,
    startDate: { $lte: today },
    endDate: { $gte: today },
  });
  const absent = Math.max(0, totalEmployees - present - onLeaveToday);

  const taskStatusMap = Object.fromEntries(taskStats.map((t) => [t._id, t.count]));

  sendSuccess(res, {
    data: {
      totalEmployees,
      present,
      currentlyWorking,
      onLeave: onLeaveToday,
      absent,
      late,
      taskStats: {
        todo: taskStatusMap[TASK_STATUS.TODO] || 0,
        inProgress: taskStatusMap[TASK_STATUS.IN_PROGRESS] || 0,
        inReview: taskStatusMap[TASK_STATUS.IN_REVIEW] || 0,
        completed: taskStatusMap[TASK_STATUS.COMPLETED] || 0,
        cancelled: taskStatusMap[TASK_STATUS.CANCELLED] || 0,
      },
      recentActivity: recentAudit,
      announcements,
    },
  });
});
