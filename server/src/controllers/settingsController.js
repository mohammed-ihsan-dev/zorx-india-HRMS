import { OfficeSettings } from '../models/OfficeSettings.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { recordAudit } from '../services/auditService.js';

export const getOfficeSettings = asyncHandler(async (req, res) => {
  const settings = await OfficeSettings.getSingleton();
  sendSuccess(res, { data: settings });
});

export const updateOfficeSettings = asyncHandler(async (req, res) => {
  const settings = await OfficeSettings.getSingleton();
  Object.assign(settings, req.body, { updatedBy: req.user._id });
  await settings.save();

  await recordAudit({
    actorId: req.user._id,
    action: 'OFFICE_SETTINGS_CHANGED',
    targetType: 'OfficeSettings',
    targetId: settings._id,
    description: 'Updated office settings',
    metadata: req.body,
  });

  sendSuccess(res, { message: 'Office settings updated successfully.', data: settings });
});
