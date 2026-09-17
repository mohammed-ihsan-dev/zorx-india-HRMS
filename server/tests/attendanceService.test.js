import mongoose from 'mongoose';
import { startTestDb, stopTestDb, clearTestDb } from './testDb.js';
import { OfficeSettings } from '../src/models/OfficeSettings.js';
import { Attendance } from '../src/models/Attendance.js';
import * as attendanceService from '../src/services/attendanceService.js';

const OFFICE_COORDS = { latitude: 10.991401, longitude: 76.442772 };
const INSIDE_RADIUS_COORDS = { latitude: 10.991501, longitude: 76.442772 }; // ~11m away
const OUTSIDE_RADIUS_COORDS = { latitude: 11.05, longitude: 76.5 }; // several km away

let employeeId;

beforeAll(async () => {
  await startTestDb();
});

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  employeeId = new mongoose.Types.ObjectId();
  await OfficeSettings.create({
    officeName: 'ZORX INDIA',
    latitude: OFFICE_COORDS.latitude,
    longitude: OFFICE_COORDS.longitude,
    attendanceRadius: 200,
    workingStartTime: '09:30',
    workingEndTime: '18:00',
    breakDurationMinutes: 60,
    timezone: 'Asia/Kolkata',
    lateThresholdMinutes: 15,
    halfDayThresholdMinutes: 240,
    overtimeEnabled: true,
  });
});

describe('attendanceService location validation', () => {
  test('allows check-in inside the office radius', async () => {
    const attendance = await attendanceService.performCheckIn(employeeId, INSIDE_RADIUS_COORDS);
    expect(attendance.checkIn).not.toBeNull();
    expect(attendance.checkIn.distanceFromOffice).toBeLessThanOrEqual(200);
  });

  test('rejects check-in outside the office radius', async () => {
    await expect(attendanceService.performCheckIn(employeeId, OUTSIDE_RADIUS_COORDS)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  test('rejects invalid coordinates', async () => {
    await expect(
      attendanceService.performCheckIn(employeeId, { latitude: 999, longitude: 76.44 })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('attendanceService duplicate/ordering rules', () => {
  test('rejects a second check-in on the same day', async () => {
    await attendanceService.performCheckIn(employeeId, INSIDE_RADIUS_COORDS);
    await expect(attendanceService.performCheckIn(employeeId, INSIDE_RADIUS_COORDS)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  test('rejects check-out without a prior check-in', async () => {
    await expect(attendanceService.performCheckOut(employeeId, INSIDE_RADIUS_COORDS)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  test('rejects check-out outside the office radius even after checking in', async () => {
    await attendanceService.performCheckIn(employeeId, INSIDE_RADIUS_COORDS);
    await expect(attendanceService.performCheckOut(employeeId, OUTSIDE_RADIUS_COORDS)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  test('rejects a second check-out on the same day', async () => {
    await attendanceService.performCheckIn(employeeId, INSIDE_RADIUS_COORDS);
    await attendanceService.performCheckOut(employeeId, INSIDE_RADIUS_COORDS);
    await expect(attendanceService.performCheckOut(employeeId, INSIDE_RADIUS_COORDS)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  test('successful check-in then check-out computes working minutes net of actual recorded break time', async () => {
    const checkIn = await attendanceService.performCheckIn(employeeId, INSIDE_RADIUS_COORDS);
    expect(checkIn.checkIn).not.toBeNull();

    const record = await Attendance.findById(checkIn._id);
    record.checkIn.timestamp = new Date(Date.now() - 8.5 * 60 * 60 * 1000); // 8.5 hours ago
    // Record a single completed 60-minute break, as the employee would via start/end break.
    record.breaks.push({
      type: 'LUNCH',
      startTime: new Date(Date.now() - 5 * 60 * 60 * 1000),
      endTime: new Date(Date.now() - 4 * 60 * 60 * 1000),
      durationMinutes: 60,
    });
    await record.save();

    const checkedOut = await attendanceService.performCheckOut(employeeId, INSIDE_RADIUS_COORDS);
    // 8.5h elapsed minus the 60 actual break minutes = 7.5h = 450 minutes, allow small timing tolerance.
    expect(checkedOut.totalWorkingMinutes).toBeGreaterThanOrEqual(448);
    expect(checkedOut.totalWorkingMinutes).toBeLessThanOrEqual(452);
    expect(checkedOut.breakMinutes).toBe(60);
  });

  test('working minutes are NOT reduced by the configured allowance when no breaks were actually taken', async () => {
    const checkIn = await attendanceService.performCheckIn(employeeId, INSIDE_RADIUS_COORDS);
    const record = await Attendance.findById(checkIn._id);
    record.checkIn.timestamp = new Date(Date.now() - 8.5 * 60 * 60 * 1000);
    await record.save();

    const checkedOut = await attendanceService.performCheckOut(employeeId, INSIDE_RADIUS_COORDS);
    // No breaks were taken, so the full 8.5h (510 minutes) counts as working time — the
    // configured 60-minute allowance must never be silently assumed/subtracted.
    expect(checkedOut.breakMinutes).toBe(0);
    expect(checkedOut.totalWorkingMinutes).toBeGreaterThanOrEqual(508);
    expect(checkedOut.totalWorkingMinutes).toBeLessThanOrEqual(512);
  });
});

describe('attendanceService pure calculations', () => {
  test('calculateWorkingMinutes subtracts break time', () => {
    const checkIn = new Date('2026-01-01T09:30:00Z');
    const checkOut = new Date('2026-01-01T18:00:00Z');
    expect(attendanceService.calculateWorkingMinutes(checkIn, checkOut, 60)) // 8.5h - 1h = 7.5h
      .toBe(450);
  });

  test('calculateOvertime returns 0 when overtime disabled', () => {
    const officeSettings = {
      workingStartTime: '09:30',
      workingEndTime: '18:00',
      breakDurationMinutes: 60,
      overtimeEnabled: false,
    };
    expect(attendanceService.calculateOvertime(600, officeSettings)).toBe(0);
  });

  test('calculateOvertime returns extra minutes worked beyond schedule', () => {
    const officeSettings = {
      workingStartTime: '09:30',
      workingEndTime: '18:00',
      breakDurationMinutes: 60,
      overtimeEnabled: true,
    };
    // Expected working minutes = 8.5h - 1h = 450. Worked 500 -> 50 min overtime.
    expect(attendanceService.calculateOvertime(500, officeSettings)).toBe(50);
  });
});
