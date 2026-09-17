import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { signToken } from '../middleware/auth.js';
import { USER_STATUS } from '../utils/constants.js';

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash').populate('employeeId');
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password.');
  }
  if (user.status !== USER_STATUS.ACTIVE) {
    throw ApiError.forbidden('Your account is not active. Please contact HR/Admin.');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw ApiError.unauthorized('Invalid email or password.');
  }

  user.lastLogin = new Date();
  await user.save();

  const token = signToken(user);

  sendSuccess(res, {
    message: 'Logged in successfully.',
    data: {
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        employee: user.employeeId,
      },
    },
  });
});

export const logout = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Logged out successfully.' });
});

export const getMe = asyncHandler(async (req, res) => {
  sendSuccess(res, {
    data: {
      id: req.user._id,
      email: req.user.email,
      role: req.user.role,
      status: req.user.status,
      lastLogin: req.user.lastLogin,
      employee: req.user.employeeId,
    },
  });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+passwordHash');

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    throw ApiError.badRequest('Current password is incorrect.');
  }

  user.passwordHash = await User.hashPassword(newPassword);
  await user.save();

  sendSuccess(res, { message: 'Password updated successfully.' });
});
