import { ContentCalendarItem } from '../models/ContentCalendarItem.js';
import { Client } from '../models/Client.js';
import { Employee } from '../models/Employee.js';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { notify } from '../services/notificationService.js';
import { recordAudit } from '../services/auditService.js';
import { NOTIFICATION_TYPE } from '../utils/constants.js';

const POPULATE_FIELDS = [
  { path: 'clientId', select: 'name status' },
  { path: 'assignedEmployee', select: 'firstName lastName employeeCode profileImage designation' },
  {
    path: 'assignedBy',
    select: 'email role employeeId',
    populate: { path: 'employeeId', select: 'firstName lastName' },
  },
];

async function notifyAssignee(item, actorUserId) {
  const assigneeUser = await User.findOne({ employeeId: item.assignedEmployee });
  if (!assigneeUser || assigneeUser._id.equals(actorUserId)) return; // don't notify yourself
  const clientName = item.clientId?.name || item.client || 'Client';
  await notify({
    userId: assigneeUser._id,
    type: NOTIFICATION_TYPE.CONTENT_CALENDAR_ASSIGNED,
    title: 'New content work assigned',
    message: `New content work assigned to you: "${item.work}" for ${clientName}.`,
    link: '/content-calendar',
    metadata: { contentCalendarItemId: item._id.toString() },
  });
}

export const listAssignableEmployees = asyncHandler(async (req, res) => {
  const superAdminUsers = await User.find({ role: 'SUPER_ADMIN' }).select('_id');
  const superAdminUserIds = superAdminUsers.map((u) => u._id);

  const employees = await Employee.find({
    userId: { $nin: superAdminUserIds },
    status: 'ACTIVE',
  })
    .select('_id firstName lastName employeeCode profileImage designation')
    .sort({ firstName: 1, lastName: 1 });

  sendSuccess(res, { data: employees });
});

export const createItem = asyncHandler(async (req, res) => {
  let { clientId, client, assignedEmployee, ...rest } = req.body;

  let clientRecord = null;
  if (clientId) {
    clientRecord = await Client.findById(clientId);
    if (!clientRecord) throw ApiError.badRequest('Selected client not found in Client Master.');
  } else if (client && client.trim()) {
    const trimmedName = client.trim();
    clientRecord = await Client.findOne({ name: new RegExp(`^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (!clientRecord) {
      clientRecord = await Client.create({ name: trimmedName });
    }
  } else {
    throw ApiError.badRequest('Client selection or name is required.');
  }

  const employee = await Employee.findById(assignedEmployee);
  if (!employee) {
    throw ApiError.badRequest('Assigned employee not found.');
  }

  const item = await ContentCalendarItem.create({
    ...rest,
    clientId: clientRecord._id,
    client: clientRecord.name,
    assignedEmployee,
    assignedBy: req.user._id, // never taken from the client
  });
  await item.populate(POPULATE_FIELDS);

  await notifyAssignee(item, req.user._id);

  await recordAudit({
    actorId: req.user._id,
    action: 'CONTENT_CALENDAR_ITEM_CREATED',
    targetType: 'ContentCalendarItem',
    targetId: item._id,
    description: `Assigned content work "${item.work}" (${clientRecord.name}) to ${employee.firstName} ${employee.lastName}`,
  });

  sendSuccess(res, { statusCode: 201, message: 'Content calendar item created successfully.', data: item });
});

export const listItems = asyncHandler(async (req, res) => {
  const { clientId, assignedEmployee, workStatus, priority, from, to, page = 1, limit = 50, search } = req.query;

  const filter = {};
  if (clientId) filter.clientId = clientId;
  if (assignedEmployee) filter.assignedEmployee = assignedEmployee;
  if (workStatus) filter.workStatus = workStatus;
  if (priority) filter.priority = priority;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }

  if (search && search.trim()) {
    const queryStr = search.trim();
    const safeRegex = new RegExp(queryStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const [matchingEmployees, matchingClients] = await Promise.all([
      Employee.find({
        $or: [
          { firstName: safeRegex },
          { lastName: safeRegex },
          {
            $expr: {
              $regexMatch: {
                input: { $concat: ['$firstName', ' ', '$lastName'] },
                regex: queryStr,
                options: 'i',
              },
            },
          },
        ],
      }).select('_id'),
      Client.find({ name: safeRegex }).select('_id'),
    ]);

    const matchingEmpIds = matchingEmployees.map((e) => e._id);
    const matchingClientIds = matchingClients.map((c) => c._id);

    filter.$or = [
      { work: safeRegex },
      { client: safeRegex },
      { clientId: { $in: matchingClientIds } },
      { assignedEmployee: { $in: matchingEmpIds } },
    ];
  }

  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 50;

  const [items, total] = await Promise.all([
    ContentCalendarItem.find(filter)
      .populate(POPULATE_FIELDS)
      .sort({ date: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    ContentCalendarItem.countDocuments(filter),
  ]);

  sendSuccess(res, {
    data: items,
    meta: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) || 1 },
  });
});

export const getItemById = asyncHandler(async (req, res) => {
  const item = await ContentCalendarItem.findById(req.params.id).populate(POPULATE_FIELDS);
  if (!item) throw ApiError.notFound('Content calendar item not found.');
  sendSuccess(res, { data: item });
});

export const updateItem = asyncHandler(async (req, res) => {
  // assignedBy is never client-mutable, regardless of what the body contains.
  const { assignedBy: _ignored, clientId, client, ...updates } = req.body;

  const existing = await ContentCalendarItem.findById(req.params.id);
  if (!existing) throw ApiError.notFound('Content calendar item not found.');

  if (clientId) {
    const clientRecord = await Client.findById(clientId);
    if (!clientRecord) throw ApiError.badRequest('Selected client not found in Client Master.');
    updates.clientId = clientRecord._id;
    updates.client = clientRecord.name;
  } else if (client && client.trim()) {
    const trimmedName = client.trim();
    let clientRecord = await Client.findOne({ name: new RegExp(`^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (!clientRecord) {
      clientRecord = await Client.create({ name: trimmedName });
    }
    updates.clientId = clientRecord._id;
    updates.client = clientRecord.name;
  }

  if (updates.assignedEmployee) {
    const employee = await Employee.findById(updates.assignedEmployee);
    if (!employee) throw ApiError.badRequest('Assigned employee not found.');
  }

  const reassigned = updates.assignedEmployee && updates.assignedEmployee !== existing.assignedEmployee.toString();

  const item = await ContentCalendarItem.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).populate(
    POPULATE_FIELDS
  );

  if (reassigned) {
    await notifyAssignee(item, req.user._id);
  }

  await recordAudit({
    actorId: req.user._id,
    action: 'CONTENT_CALENDAR_ITEM_UPDATED',
    targetType: 'ContentCalendarItem',
    targetId: item._id,
    description: `Updated content work "${item.work}" (${item.clientId?.name || item.client})`,
  });

  sendSuccess(res, { message: 'Content calendar item updated successfully.', data: item });
});

export const deleteItem = asyncHandler(async (req, res) => {
  const item = await ContentCalendarItem.findByIdAndDelete(req.params.id);
  if (!item) throw ApiError.notFound('Content calendar item not found.');

  await recordAudit({
    actorId: req.user._id,
    action: 'CONTENT_CALENDAR_ITEM_DELETED',
    targetType: 'ContentCalendarItem',
    targetId: item._id,
    description: `Deleted content work "${item.work}" (${item.clientId?.name || item.client})`,
  });

  sendSuccess(res, { message: 'Content calendar item deleted successfully.' });
});
