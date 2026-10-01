import { Employee } from '../models/Employee.js';
import { Attendance } from '../models/Attendance.js';
import { Leave } from '../models/Leave.js';
import { Task } from '../models/Task.js';
import { Announcement } from '../models/Announcement.js';
import { AuditLog } from '../models/AuditLog.js';
import { Client } from '../models/Client.js';
import { ContentCalendarItem } from '../models/ContentCalendarItem.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { getStartOfDayUTC } from '../utils/dateUtils.js';
import { ATTENDANCE_STATUS, LEAVE_STATUS, TASK_STATUS, CONTENT_CALENDAR_STATUS, TASK_PRIORITY } from '../utils/constants.js';

export const getAdminDashboard = asyncHandler(async (req, res) => {
  const { range = 'all' } = req.query;
  const now = new Date();
  const today = getStartOfDayUTC(now);

  // Calculate start date based on range filter
  let startDate = null;
  if (range === 'today') {
    startDate = today;
  } else if (range === 'week') {
    startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 7);
  } else if (range === 'month' || range === '30days') {
    startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 30);
  } else if (range === '3months') {
    startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 90);
  }

  const calendarMatch = {};
  if (startDate) {
    calendarMatch.date = { $gte: startDate };
  }

  const [
    totalEmployees,
    todayAttendance,
    pendingLeaves,
    taskStats,
    recentAudit,
    announcements,
    totalClients,
    calendarStatusCounts,
    overdueCount,
    progressOverTimeRaw,
    employeeWorkloadRaw,
    clientWorkloadRaw,
    priorityCountsRaw,
    upcomingDeadlinesRaw,
    overdueItemsRaw,
  ] = await Promise.all([
    Employee.countDocuments({ status: 'ACTIVE' }),
    Attendance.find({ date: today }),
    Leave.countDocuments({ status: LEAVE_STATUS.PENDING }),
    Task.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    AuditLog.find().sort({ createdAt: -1 }).limit(8).populate('actorId', 'email role'),
    Announcement.find({ publishDate: { $lte: now } }).sort({ publishDate: -1 }).limit(5),
    Client.countDocuments({ status: 'ACTIVE' }),
    ContentCalendarItem.aggregate([
      { $match: calendarMatch },
      { $group: { _id: '$workStatus', count: { $sum: 1 } } },
    ]),
    ContentCalendarItem.countDocuments({
      ...calendarMatch,
      workStatus: { $ne: CONTENT_CALENDAR_STATUS.COMPLETED },
      deadline: { $lt: now },
    }),
    ContentCalendarItem.aggregate([
      { $match: calendarMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          completed: {
            $sum: { $cond: [{ $eq: ['$workStatus', CONTENT_CALENDAR_STATUS.COMPLETED] }, 1, 0] },
          },
          ongoing: {
            $sum: { $cond: [{ $eq: ['$workStatus', CONTENT_CALENDAR_STATUS.ONGOING] }, 1, 0] },
          },
          remaining: {
            $sum: { $cond: [{ $eq: ['$workStatus', CONTENT_CALENDAR_STATUS.REMAINING] }, 1, 0] },
          },
          total: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    ContentCalendarItem.aggregate([
      { $match: calendarMatch },
      {
        $group: {
          _id: '$assignedEmployee',
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$workStatus', CONTENT_CALENDAR_STATUS.COMPLETED] }, 1, 0] },
          },
          ongoing: {
            $sum: { $cond: [{ $eq: ['$workStatus', CONTENT_CALENDAR_STATUS.ONGOING] }, 1, 0] },
          },
          remaining: {
            $sum: { $cond: [{ $eq: ['$workStatus', CONTENT_CALENDAR_STATUS.REMAINING] }, 1, 0] },
          },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'employees',
          localField: '_id',
          foreignField: '_id',
          as: 'employee',
        },
      },
      { $unwind: { path: '$employee', preserveNullAndEmptyArrays: true } },
    ]),
    ContentCalendarItem.aggregate([
      { $match: calendarMatch },
      {
        $group: {
          _id: '$clientId',
          clientNameFallback: { $first: '$client' },
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$workStatus', CONTENT_CALENDAR_STATUS.COMPLETED] }, 1, 0] },
          },
          ongoing: {
            $sum: { $cond: [{ $eq: ['$workStatus', CONTENT_CALENDAR_STATUS.ONGOING] }, 1, 0] },
          },
          remaining: {
            $sum: { $cond: [{ $eq: ['$workStatus', CONTENT_CALENDAR_STATUS.REMAINING] }, 1, 0] },
          },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'clients',
          localField: '_id',
          foreignField: '_id',
          as: 'clientDoc',
        },
      },
      { $unwind: { path: '$clientDoc', preserveNullAndEmptyArrays: true } },
    ]),
    ContentCalendarItem.aggregate([
      { $match: calendarMatch },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ]),
    ContentCalendarItem.find({
      workStatus: { $ne: CONTENT_CALENDAR_STATUS.COMPLETED },
      deadline: { $gte: today },
    })
      .sort({ deadline: 1 })
      .limit(6)
      .populate('assignedEmployee', 'firstName lastName')
      .populate('clientId', 'name')
      .lean(),
    ContentCalendarItem.find({
      workStatus: { $ne: CONTENT_CALENDAR_STATUS.COMPLETED },
      deadline: { $lt: now },
    })
      .sort({ deadline: 1 })
      .limit(6)
      .populate('assignedEmployee', 'firstName lastName')
      .populate('clientId', 'name')
      .lean(),
  ]);

  // PRESENT / LATE / HALF_DAY are mutually exclusive canonical statuses on a
  // single attendance record (see attendanceService.deriveStatus) — never
  // overlapping subtypes of one another, so each is counted independently
  // rather than all being folded into one "checked in" bucket.
  const attendedCount = todayAttendance.filter((a) => a.checkIn).length; // anyone with a valid record today, any status — used only for Absent below
  const present = todayAttendance.filter((a) => a.status === ATTENDANCE_STATUS.PRESENT).length;
  const late = todayAttendance.filter((a) => a.status === ATTENDANCE_STATUS.LATE).length;
  const halfDay = todayAttendance.filter((a) => a.status === ATTENDANCE_STATUS.HALF_DAY).length;
  const currentlyWorking = todayAttendance.filter((a) => a.checkIn && !a.checkOut).length;
  const onLeaveToday = await Leave.countDocuments({
    status: LEAVE_STATUS.APPROVED,
    startDate: { $lte: today },
    endDate: { $gte: today },
  });
  // Expected-to-work population is today's active employee count (the same
  // definition already used for `totalEmployees`) minus anyone with a valid
  // attendance record today and minus anyone on approved leave today — an
  // employee on approved leave is never also counted as absent.
  const absent = Math.max(0, totalEmployees - attendedCount - onLeaveToday);

  const taskStatusMap = Object.fromEntries(taskStats.map((t) => [t._id, t.count]));

  // Content Calendar Statistics calculation
  const calStatusMap = Object.fromEntries(calendarStatusCounts.map((c) => [c._id, c.count]));
  const completedWork = calStatusMap[CONTENT_CALENDAR_STATUS.COMPLETED] || 0;
  const ongoingWork = calStatusMap[CONTENT_CALENDAR_STATUS.ONGOING] || 0;
  const remainingWork = calStatusMap[CONTENT_CALENDAR_STATUS.REMAINING] || 0;
  const totalWork = completedWork + ongoingWork + remainingWork;
  const completionRate = totalWork > 0 ? Math.round((completedWork / totalWork) * 100) : 0;

  const priorityMap = Object.fromEntries(priorityCountsRaw.map((p) => [p._id, p.count]));
  const priorityDistribution = [
    { priority: 'URGENT', count: priorityMap[TASK_PRIORITY.URGENT] || 0 },
    { priority: 'HIGH', count: priorityMap[TASK_PRIORITY.HIGH] || 0 },
    { priority: 'MEDIUM', count: priorityMap[TASK_PRIORITY.MEDIUM] || 0 },
    { priority: 'LOW', count: priorityMap[TASK_PRIORITY.LOW] || 0 },
  ];

  const employeeWorkload = employeeWorkloadRaw.map((item) => {
    const emp = item.employee;
    const name = emp ? `${emp.firstName} ${emp.lastName || ''}`.trim() : 'Unassigned';
    return {
      employeeId: item._id,
      employeeName: name,
      total: item.total,
      completed: item.completed,
      ongoing: item.ongoing,
      remaining: item.remaining,
    };
  });

  const clientWorkload = clientWorkloadRaw.map((item) => {
    const name = item.clientDoc?.name || item.clientNameFallback || 'General';
    return {
      clientId: item._id,
      clientName: name,
      total: item.total,
      completed: item.completed,
      ongoing: item.ongoing,
      remaining: item.remaining,
    };
  });

  const progressOverTime = progressOverTimeRaw.map((item) => ({
    date: item._id,
    completed: item.completed,
    ongoing: item.ongoing,
    remaining: item.remaining,
    total: item.total,
  }));

  const upcomingDeadlines = upcomingDeadlinesRaw.map((item) => ({
    id: item._id,
    work: item.work,
    clientName: item.clientId?.name || item.client || 'N/A',
    employeeName: item.assignedEmployee ? `${item.assignedEmployee.firstName} ${item.assignedEmployee.lastName || ''}`.trim() : 'Unassigned',
    deadline: item.deadline,
    priority: item.priority,
    workStatus: item.workStatus,
  }));

  const overdueWorkList = overdueItemsRaw.map((item) => ({
    id: item._id,
    work: item.work,
    clientName: item.clientId?.name || item.client || 'N/A',
    employeeName: item.assignedEmployee ? `${item.assignedEmployee.firstName} ${item.assignedEmployee.lastName || ''}`.trim() : 'Unassigned',
    deadline: item.deadline,
    priority: item.priority,
    workStatus: item.workStatus,
  }));

  sendSuccess(res, {
    data: {
      totalEmployees,
      totalClients,
      present,
      currentlyWorking,
      onLeave: onLeaveToday,
      absent,
      late,
      halfDay,
      attendanceDate: today.toISOString().slice(0, 10),
      pendingLeaves,
      taskStats: {
        todo: taskStatusMap[TASK_STATUS.TODO] || 0,
        inProgress: taskStatusMap[TASK_STATUS.IN_PROGRESS] || 0,
        inReview: taskStatusMap[TASK_STATUS.IN_REVIEW] || 0,
        completed: taskStatusMap[TASK_STATUS.COMPLETED] || 0,
        cancelled: taskStatusMap[TASK_STATUS.CANCELLED] || 0,
      },
      summary: {
        totalWork,
        completed: completedWork,
        ongoing: ongoingWork,
        remaining: remainingWork,
        overdue: overdueCount,
        completionRate,
      },
      statusDistribution: [
        { name: 'Completed', value: completedWork, color: '#1f5138' },
        { name: 'Ongoing', value: ongoingWork, color: '#0ea5e9' },
        { name: 'Remaining', value: remainingWork, color: '#f59e0b' },
      ],
      progressOverTime,
      employeeWorkload,
      clientWorkload,
      priorityDistribution,
      upcomingDeadlines,
      overdueWorkList,
      recentActivity: recentAudit,
      announcements,
      currentRange: range,
    },
  });
});

