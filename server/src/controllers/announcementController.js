import { Announcement } from '../models/Announcement.js';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { notifyMany } from '../services/notificationService.js';
import { NOTIFICATION_TYPE } from '../utils/constants.js';

export const listAnnouncements = asyncHandler(async (req, res) => {
  const now = new Date();
  const announcements = await Announcement.find({
    publishDate: { $lte: now },
    $or: [{ expiryDate: null }, { expiryDate: { $gte: now } }],
  })
    .populate('createdBy', 'email role')
    .sort({ publishDate: -1 });
  sendSuccess(res, { data: announcements });
});

export const listAllAnnouncements = asyncHandler(async (req, res) => {
  const announcements = await Announcement.find().populate('createdBy', 'email role').sort({ createdAt: -1 });
  sendSuccess(res, { data: announcements });
});

export const createAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.create({ ...req.body, createdBy: req.user._id });

  const activeUsers = await User.find({ status: 'ACTIVE' }).select('_id');
  await notifyMany(
    activeUsers.map((u) => u._id),
    {
      type: NOTIFICATION_TYPE.ANNOUNCEMENT_PUBLISHED,
      title: 'New announcement',
      message: announcement.title,
      link: '/announcements',
    }
  );

  sendSuccess(res, { statusCode: 201, message: 'Announcement published.', data: announcement });
});

export const updateAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!announcement) throw ApiError.notFound('Announcement not found.');
  sendSuccess(res, { message: 'Announcement updated.', data: announcement });
});

export const deleteAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findByIdAndDelete(req.params.id);
  if (!announcement) throw ApiError.notFound('Announcement not found.');
  sendSuccess(res, { message: 'Announcement deleted.' });
});
