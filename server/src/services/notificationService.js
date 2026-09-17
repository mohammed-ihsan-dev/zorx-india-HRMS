import { Notification } from '../models/Notification.js';

export async function notify({ userId, type, title, message, link = '', metadata = {} }) {
  return Notification.create({ userId, type, title, message, link, metadata });
}

export async function notifyMany(userIds, payload) {
  const docs = userIds.map((userId) => ({ userId, ...payload }));
  return Notification.insertMany(docs);
}
