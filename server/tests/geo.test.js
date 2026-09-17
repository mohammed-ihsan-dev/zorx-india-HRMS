import { haversineDistanceMeters, isValidCoordinate } from '../src/utils/geo.js';

describe('geo utils', () => {
  test('distance between identical points is 0', () => {
    const office = { latitude: 10.991401, longitude: 76.442772 };
    expect(haversineDistanceMeters(office, office)).toBe(0);
  });

  test('distance increases with coordinate offset', () => {
    const office = { latitude: 10.991401, longitude: 76.442772 };
    // Roughly 0.001 degrees latitude ~= 111 meters.
    const nearby = { latitude: 10.992401, longitude: 76.442772 };
    const distance = haversineDistanceMeters(office, nearby);
    expect(distance).toBeGreaterThan(90);
    expect(distance).toBeLessThan(130);
  });

  test('validates coordinate bounds', () => {
    expect(isValidCoordinate(10.99, 76.44)).toBe(true);
    expect(isValidCoordinate(91, 76.44)).toBe(false);
    expect(isValidCoordinate(10.99, -181)).toBe(false);
    expect(isValidCoordinate('10.99', 76.44)).toBe(false);
    expect(isValidCoordinate(NaN, 76.44)).toBe(false);
  });
});
