import { Employee } from '../models/Employee.js';
import { User } from '../models/User.js';
import { Attendance } from '../models/Attendance.js';
import { Task } from '../models/Task.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAudit } from '../services/auditService.js';
import { notify } from '../services/notificationService.js';
import { TASK_STATUS, ATTENDANCE_STATUS, USER_STATUS, NOTIFICATION_TYPE } from '../utils/constants.js';

export async function generateEmployeeCode() {
  const count = await Employee.countDocuments();
  const next = count + 1;
  return `ZX${String(next).padStart(4, '0')}`;
}

export const createEmployee = asyncHandler(async (req, res) => {
  const { email, password, role, ...employeeFields } = req.body;

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw ApiError.conflict('A user with this email already exists.');
  }

  const passwordHash = await User.hashPassword(password);
  const employeeCode = await generateEmployeeCode();

  const user = await User.create({ email: email.toLowerCase(), passwordHash, role });

  const employee = await Employee.create({
    ...employeeFields,
    userId: user._id,
    employeeCode,
  });

  user.employeeId = employee._id;
  await user.save();

  await recordAudit({
    actorId: req.user._id,
    action: 'EMPLOYEE_CREATED',
    targetType: 'Employee',
    targetId: employee._id,
    description: `Created employee ${employee.firstName} ${employee.lastName} (${employeeCode})`,
  });

  sendSuccess(res, { statusCode: 201, message: 'Employee created successfully.', data: employee });
});

export const listEmployees = asyncHandler(async (req, res) => {
  const { search = '', departmentId, status, authStatus, page = 1, limit = 20 } = req.query;

  // Exclude SUPER_ADMIN users from the employee directory
  const superAdminUsers = await User.find({ role: 'SUPER_ADMIN' }).select('_id');
  const superAdminUserIds = superAdminUsers.map((u) => u._id);

  const filter = {
    userId: { $nin: superAdminUserIds },
  };
  if (status) filter.status = status;
  if (departmentId) filter.departmentId = departmentId;
  if (authStatus) {
    const matchingUsers = await User.find({ status: authStatus }).select('_id');
    filter.userId = { $in: matchingUsers.map((u) => u._id), $nin: superAdminUserIds };
  }
  if (search) {
    filter.$and = [
      { userId: filter.userId },
      {
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { employeeCode: { $regex: search, $options: 'i' } },
          { designation: { $regex: search, $options: 'i' } },
        ],
      },
    ];
    delete filter.userId;
  }

  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 20;

  const [employees, total] = await Promise.all([
    Employee.find(filter)
      .populate('departmentId', 'name')
      .populate('managerId', 'firstName lastName')
      .populate('userId', 'email status role')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Employee.countDocuments(filter),
  ]);

  sendSuccess(res, {
    data: employees,
    meta: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
  });
});

export const getEmployeeById = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id)
    .populate('departmentId', 'name')
    .populate('managerId', 'firstName lastName');
  if (!employee) throw ApiError.notFound('Employee not found.');

  const [presentCount, lateCount, absentCount, leaveCount, tasksCompleted, tasksPending] = await Promise.all([
    Attendance.countDocuments({ employeeId: employee._id, status: ATTENDANCE_STATUS.PRESENT }),
    Attendance.countDocuments({ employeeId: employee._id, status: ATTENDANCE_STATUS.LATE }),
    Attendance.countDocuments({ employeeId: employee._id, status: ATTENDANCE_STATUS.ABSENT }),
    Attendance.countDocuments({ employeeId: employee._id, status: ATTENDANCE_STATUS.LEAVE }),
    Task.countDocuments({ assignedTo: employee._id, status: TASK_STATUS.COMPLETED }),
    Task.countDocuments({ assignedTo: employee._id, status: { $in: [TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS, TASK_STATUS.IN_REVIEW] } }),
  ]);

  sendSuccess(res, {
    data: {
      employee,
      stats: { presentCount, lateCount, absentCount, leaveCount, tasksCompleted, tasksPending },
    },
  });
});

export const updateEmployee = asyncHandler(async (req, res) => {
  if (req.body.employeeCode) {
    const code = req.body.employeeCode.trim();
    const existing = await Employee.findOne({
      employeeCode: code,
      _id: { $ne: req.params.id },
    });
    if (existing) {
      throw ApiError.conflict(`Employee ID ${code} is already assigned to another employee.`);
    }
  }

  const employee = await Employee.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
    .populate('departmentId', 'name')
    .populate('managerId', 'firstName lastName');
  if (!employee) throw ApiError.notFound('Employee not found.');

  await recordAudit({
    actorId: req.user._id,
    action: 'EMPLOYEE_UPDATED',
    targetType: 'Employee',
    targetId: employee._id,
    description: `Updated employee ${employee.firstName} ${employee.lastName} (${employee.employeeCode})`,
  });

  sendSuccess(res, { message: 'Employee updated successfully.', data: employee });
});

export const updateEmployeeStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const employee = await Employee.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!employee) throw ApiError.notFound('Employee not found.');

  await User.findOneAndUpdate({ employeeId: employee._id }, { status: status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE' });

  await recordAudit({
    actorId: req.user._id,
    action: status === 'ACTIVE' ? 'EMPLOYEE_REACTIVATED' : 'EMPLOYEE_DEACTIVATED',
    targetType: 'Employee',
    targetId: employee._id,
    description: `${status === 'ACTIVE' ? 'Reactivated' : 'Deactivated'} employee ${employee.firstName} ${employee.lastName}`,
  });

  sendSuccess(res, { message: `Employee ${status === 'ACTIVE' ? 'reactivated' : 'deactivated'} successfully.`, data: employee });
});

export const approveUserAccount = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id);
  if (!employee) throw ApiError.notFound('Employee not found.');

  const user = await User.findOne({ employeeId: employee._id });
  if (!user) throw ApiError.notFound('Account not found for this employee.');
  if (user.status !== USER_STATUS.PENDING_APPROVAL) {
    throw ApiError.badRequest('Only accounts pending approval can be approved.');
  }
  if (user._id.equals(req.user._id)) {
    throw ApiError.forbidden('You cannot approve your own account.');
  }

  user.status = USER_STATUS.ACTIVE;
  await user.save();

  await notify({
    userId: user._id,
    type: NOTIFICATION_TYPE.ACCOUNT_APPROVED,
    title: 'Account approved',
    message: 'Your account has been approved. You can now log in.',
    link: '/login',
  });

  await recordAudit({
    actorId: req.user._id,
    action: 'ACCOUNT_APPROVED',
    targetType: 'User',
    targetId: user._id,
    description: `Approved account for ${employee.firstName} ${employee.lastName}`,
  });

  sendSuccess(res, { message: 'Account approved successfully.', data: { employeeId: employee._id, status: user.status } });
});

export const rejectUserAccount = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id);
  if (!employee) throw ApiError.notFound('Employee not found.');

  const user = await User.findOne({ employeeId: employee._id });
  if (!user) throw ApiError.notFound('Account not found for this employee.');
  if (user.status !== USER_STATUS.PENDING_APPROVAL) {
    throw ApiError.badRequest('Only accounts pending approval can be rejected.');
  }
  if (user._id.equals(req.user._id)) {
    throw ApiError.forbidden('You cannot reject your own account.');
  }

  user.status = USER_STATUS.REJECTED;
  await user.save();

  await notify({
    userId: user._id,
    type: NOTIFICATION_TYPE.ACCOUNT_REJECTED,
    title: 'Account not approved',
    message: 'Your account registration has not been approved. Please contact HR/Admin.',
    link: '/login',
  });

  await recordAudit({
    actorId: req.user._id,
    action: 'ACCOUNT_REJECTED',
    targetType: 'User',
    targetId: user._id,
    description: `Rejected account for ${employee.firstName} ${employee.lastName}`,
  });

  sendSuccess(res, { message: 'Account rejected.', data: { employeeId: employee._id, status: user.status } });
});

export const getMyProfile = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.user.employeeId?._id)
    .populate('departmentId', 'name')
    .populate('managerId', 'firstName lastName');
  if (!employee) throw ApiError.notFound('Employee profile not found.');
  sendSuccess(res, { data: employee });
});

export const updateMyProfile = asyncHandler(async (req, res) => {
  const employee = await Employee.findByIdAndUpdate(req.user.employeeId?._id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!employee) throw ApiError.notFound('Employee profile not found.');
  sendSuccess(res, { message: 'Profile updated successfully.', data: employee });
});
