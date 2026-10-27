import mongoose from 'mongoose';
import { ProfileDocument } from '../models/ProfileDocument.js';
import { Employee } from '../models/Employee.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAudit } from '../services/auditService.js';
import { deleteStoredFile } from '../services/fileStorageService.js';
import { DOCUMENT_TYPE } from '../utils/constants.js';

// Payslips are ProfileDocuments of type PAYSLIP: same private storage and the same
// owner-or-back-office download route (GET /documents/:id/download). The stored
// filename is never sent to clients.
const PUBLIC_FIELDS = '-storedFileName';
const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

function currentPeriodIST() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}`;
}

const periodLabel = (period) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

/** GET /documents/payslips/me — only the signed-in employee's own payslips. */
export const listMyPayslips = asyncHandler(async (req, res) => {
  const employeeId = req.user.employeeId?._id;
  if (!employeeId) throw ApiError.forbidden('Only employees can view payslips.');
  const payslips = await ProfileDocument.find({ employeeId, documentType: DOCUMENT_TYPE.PAYSLIP })
    .select(PUBLIC_FIELDS)
    .sort({ payslipPeriod: -1 });
  sendSuccess(res, { data: payslips });
});

/** GET /documents/payslips — back office; optional employeeId / year / month filters. */
export const listPayslips = asyncHandler(async (req, res) => {
  const { employeeId, year, month } = req.query;
  const filter = { documentType: DOCUMENT_TYPE.PAYSLIP };
  if (employeeId) {
    if (!mongoose.isValidObjectId(employeeId)) throw ApiError.badRequest('Invalid employee filter.');
    filter.employeeId = employeeId;
  }
  if (year && !/^\d{4}$/.test(String(year))) throw ApiError.badRequest('Invalid year filter.');
  if (month && !/^(0?[1-9]|1[0-2])$/.test(String(month))) throw ApiError.badRequest('Invalid month filter.');
  if (year && month) filter.payslipPeriod = `${year}-${String(month).padStart(2, '0')}`;
  else if (year) filter.payslipPeriod = { $regex: `^${year}-` };
  else if (month) filter.payslipPeriod = { $regex: `-${String(month).padStart(2, '0')}$` };

  const payslips = await ProfileDocument.find(filter)
    .select(PUBLIC_FIELDS)
    .populate({ path: 'employeeId', select: 'firstName lastName employeeCode' })
    .populate({ path: 'uploadedBy', select: 'email' })
    .sort({ payslipPeriod: -1, updatedAt: -1 })
    .limit(500);
  sendSuccess(res, { data: payslips });
});

/**
 * POST /documents/payslips — back office. Multipart: file (PDF), employeeId,
 * period (YYYY-MM), replace ('true' to overwrite that employee's payslip for the
 * period; otherwise an existing one is a 409 and nothing changes).
 */
export const uploadPayslip = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Please choose a PDF payslip to upload.');
  let kept = false; // once a record points at the new file, it must never be deleted

  try {
    const { employeeId, period } = req.body;
    const replace = req.body.replace === 'true';
    if (!mongoose.isValidObjectId(employeeId)) throw ApiError.badRequest('Please select an employee.');
    if (!PERIOD_RE.test(period || '')) throw ApiError.badRequest('Please select the payslip month and year.');
    if (period > currentPeriodIST()) throw ApiError.badRequest('Payslips cannot be uploaded for a future month.');

    const employee = await Employee.findById(employeeId).select('firstName lastName');
    if (!employee) throw ApiError.badRequest('The selected employee could not be found.');

    const fileFields = {
      uploadedBy: req.user._id,
      originalFileName: req.file.originalname,
      storedFileName: req.file.filename,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      status: 'APPROVED',
    };
    const key = { employeeId, documentType: DOCUMENT_TYPE.PAYSLIP, payslipPeriod: period };

    // Insert only if there's no payslip for this employee + month yet.
    const result = await ProfileDocument.findOneAndUpdate(key, { $setOnInsert: { ...key, ...fileFields } }, { upsert: true, new: false, includeResultMetadata: true });
    const existing = result.lastErrorObject?.updatedExisting ? result.value : null;
    let payslip;
    if (!existing) {
      kept = true;
      payslip = await ProfileDocument.findOne(key);
    } else if (!replace) {
      throw ApiError.conflict(`A payslip for ${periodLabel(period)} already exists for this employee. Choose "Replace" to overwrite it.`);
    } else {
      payslip = await ProfileDocument.findOneAndUpdate({ _id: existing._id }, { $set: fileFields }, { new: true });
      kept = true;
      deleteStoredFile(existing.storedFileName);
    }

    const name = `${employee.firstName} ${employee.lastName || ''}`.trim();
    await recordAudit({
      actorId: req.user._id,
      action: existing ? 'PAYSLIP_REPLACED' : 'PAYSLIP_UPLOADED',
      targetType: 'ProfileDocument',
      targetId: payslip._id,
      description: `${existing ? 'Replaced' : 'Uploaded'} ${periodLabel(period)} payslip for ${name}`,
    });

    const data = payslip.toObject();
    delete data.storedFileName;
    sendSuccess(res, { statusCode: existing ? 200 : 201, message: existing ? 'Payslip replaced.' : 'Payslip uploaded.', data });
  } catch (err) {
    if (!kept) deleteStoredFile(req.file.filename);
    throw err;
  }
});
