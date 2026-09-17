import { Department } from '../models/Department.js';
import { Employee } from '../models/Employee.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';

export const listDepartments = asyncHandler(async (req, res) => {
  const departments = await Department.find().populate('managerId', 'firstName lastName').sort({ name: 1 });
  const counts = await Employee.aggregate([
    { $match: { status: 'ACTIVE' } },
    { $group: { _id: '$departmentId', count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
  const withCounts = departments.map((d) => ({ ...d.toObject(), employeeCount: countMap[String(d._id)] || 0 }));
  sendSuccess(res, { data: withCounts });
});

export const createDepartment = asyncHandler(async (req, res) => {
  const existing = await Department.findOne({ name: req.body.name });
  if (existing) throw ApiError.conflict('A department with this name already exists.');
  const department = await Department.create(req.body);
  sendSuccess(res, { statusCode: 201, message: 'Department created.', data: department });
});

export const updateDepartment = asyncHandler(async (req, res) => {
  const department = await Department.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!department) throw ApiError.notFound('Department not found.');
  sendSuccess(res, { message: 'Department updated.', data: department });
});

export const deleteDepartment = asyncHandler(async (req, res) => {
  const inUse = await Employee.countDocuments({ departmentId: req.params.id, status: 'ACTIVE' });
  if (inUse > 0) {
    throw ApiError.badRequest('Cannot delete a department that still has active employees.');
  }
  const department = await Department.findByIdAndDelete(req.params.id);
  if (!department) throw ApiError.notFound('Department not found.');
  sendSuccess(res, { message: 'Department deleted.' });
});
