import { Task } from '../models/Task.js';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { notify } from '../services/notificationService.js';
import { recordAudit } from '../services/auditService.js';
import { NOTIFICATION_TYPE, TASK_STATUS } from '../utils/constants.js';

function requireEmployee(req) {
  const employeeId = req.user.employeeId?._id;
  if (!employeeId) throw ApiError.forbidden('Only employees can perform this action.');
  return employeeId;
}

export const createTask = asyncHandler(async (req, res) => {
  const task = await Task.create({ ...req.body, assignedBy: req.user._id });

  const assigneeUser = await User.findOne({ employeeId: task.assignedTo });
  if (assigneeUser) {
    await notify({
      userId: assigneeUser._id,
      type: NOTIFICATION_TYPE.TASK_ASSIGNED,
      title: 'New task assigned',
      message: `You have been assigned a new task: "${task.title}".`,
      link: '/tasks',
    });
  }

  await recordAudit({
    actorId: req.user._id,
    action: 'TASK_ASSIGNED',
    targetType: 'Task',
    targetId: task._id,
    description: `Assigned task "${task.title}"`,
  });

  sendSuccess(res, { statusCode: 201, message: 'Task created successfully.', data: task });
});

export const listTasks = asyncHandler(async (req, res) => {
  const { assignedTo, status, priority, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (assignedTo) filter.assignedTo = assignedTo;
  if (status) filter.status = status;
  if (priority) filter.priority = priority;

  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 20;

  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .populate('assignedTo', 'firstName lastName employeeCode')
      .populate('assignedBy', 'email role')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Task.countDocuments(filter),
  ]);

  sendSuccess(res, { data: tasks, meta: { total, page: pageNum, limit: limitNum } });
});

export const getMyTasks = asyncHandler(async (req, res) => {
  const employeeId = requireEmployee(req);
  const { status } = req.query;
  const filter = { assignedTo: employeeId };
  if (status) filter.status = status;
  const tasks = await Task.find(filter).populate('assignedBy', 'email role').sort({ dueDate: 1, createdAt: -1 });
  sendSuccess(res, { data: tasks });
});

export const getTaskById = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id)
    .populate('assignedTo', 'firstName lastName employeeCode')
    .populate('assignedBy', 'email role');
  if (!task) throw ApiError.notFound('Task not found.');
  sendSuccess(res, { data: task });
});

export const updateTask = asyncHandler(async (req, res) => {
  const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!task) throw ApiError.notFound('Task not found.');
  sendSuccess(res, { message: 'Task updated successfully.', data: task });
});

export const updateTaskStatus = asyncHandler(async (req, res) => {
  const employeeId = req.user.employeeId?._id;
  const task = await Task.findById(req.params.id);
  if (!task) throw ApiError.notFound('Task not found.');

  const isOwner = employeeId && task.assignedTo.toString() === employeeId.toString();
  const isBackOffice = ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'].includes(req.user.role);
  if (!isOwner && !isBackOffice) {
    throw ApiError.forbidden('You do not have permission to update this task.');
  }

  task.status = req.body.status;
  if (req.body.status === TASK_STATUS.COMPLETED) {
    task.completedAt = new Date();
  }
  await task.save();

  const assignerUser = await User.findById(task.assignedBy);
  if (assignerUser && !isBackOffice) {
    await notify({
      userId: assignerUser._id,
      type: NOTIFICATION_TYPE.TASK_STATUS_CHANGED,
      title: 'Task status updated',
      message: `Task "${task.title}" is now ${task.status.replace('_', ' ').toLowerCase()}.`,
      link: '/admin/tasks',
    });
  }

  sendSuccess(res, { message: 'Task status updated.', data: task });
});
