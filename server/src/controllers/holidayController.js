import { Holiday } from '../models/Holiday.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAudit } from '../services/auditService.js';

const toDate = (ymd) => {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  // Rejects impossible days such as 2026-02-31 (which Date would roll over).
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== ymd) throw ApiError.badRequest('Please choose a valid date.');
  return d;
};
const label = (date) => date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** GET /holidays?from=YYYY-MM-DD&to=YYYY-MM-DD — any signed-in user. */
export const listHolidays = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = toDate(req.query.from);
    if (req.query.to) filter.date.$lte = toDate(req.query.to);
  }
  const holidays = await Holiday.find(filter).select('date name').sort({ date: 1 }).limit(400).lean();
  sendSuccess(res, { data: holidays });
});

/** POST /holidays { date, name } — back office. One holiday per date. */
export const createHoliday = asyncHandler(async (req, res) => {
  const date = toDate(req.body.date);
  if (await Holiday.exists({ date })) throw ApiError.conflict(`${label(date)} is already a holiday.`);
  let holiday;
  try {
    holiday = await Holiday.create({ date, name: req.body.name, createdBy: req.user._id });
  } catch (err) {
    if (err?.code === 11000) throw ApiError.conflict(`${label(date)} is already a holiday.`);
    throw err;
  }
  await recordAudit({
    actorId: req.user._id,
    action: 'HOLIDAY_CREATED',
    targetType: 'Holiday',
    targetId: holiday._id,
    description: `Marked ${label(date)} as a holiday (${holiday.name})`,
  });
  sendSuccess(res, { statusCode: 201, message: 'Holiday added.', data: { _id: holiday._id, date: holiday.date, name: holiday.name } });
});

/** DELETE /holidays/:id — back office. Attendance records are never touched. */
export const deleteHoliday = asyncHandler(async (req, res) => {
  const holiday = await Holiday.findByIdAndDelete(req.params.id);
  if (!holiday) throw ApiError.notFound('Holiday not found.');
  await recordAudit({
    actorId: req.user._id,
    action: 'HOLIDAY_DELETED',
    targetType: 'Holiday',
    targetId: holiday._id,
    description: `Removed holiday ${label(holiday.date)} (${holiday.name})`,
  });
  sendSuccess(res, { message: 'Holiday removed.' });
});
