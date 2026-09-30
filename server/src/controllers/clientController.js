import { Client } from '../models/Client.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';

export const listClients = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (status) filter.status = status;

  const clients = await Client.find(filter).sort({ name: 1 });
  sendSuccess(res, { data: clients });
});

export const createClient = asyncHandler(async (req, res) => {
  const { name, status } = req.body;
  if (!name || !name.trim()) {
    throw ApiError.badRequest('Client name is required.');
  }

  const normalizedName = name.trim();
  const existing = await Client.findOne({ name: new RegExp(`^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (existing) {
    sendSuccess(res, { statusCode: 200, message: 'Client already exists.', data: existing });
    return;
  }

  const client = await Client.create({ name: normalizedName, status: status || 'ACTIVE' });
  sendSuccess(res, { statusCode: 201, message: 'Client created successfully.', data: client });
});
