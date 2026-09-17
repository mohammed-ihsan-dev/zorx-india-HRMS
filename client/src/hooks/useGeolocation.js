import { useCallback, useState } from 'react';

export const LOCATION_STATUS = {
  IDLE: 'IDLE',
  CHECKING_LOCATION: 'CHECKING_LOCATION',
  LOCATION_GRANTED: 'LOCATION_GRANTED',
  LOCATION_PERMISSION_DENIED: 'LOCATION_PERMISSION_DENIED',
  LOCATION_UNAVAILABLE: 'LOCATION_UNAVAILABLE',
  LOCATION_ERROR: 'LOCATION_ERROR',
};

/**
 * Requests the device's location only when `request()` is called explicitly —
 * never on mount, and never in the background. This hook is used exclusively
 * by the check-in/check-out flow.
 */
export function useGeolocation() {
  const [status, setStatus] = useState(LOCATION_STATUS.IDLE);
  const [coords, setCoords] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const request = useCallback(() => {
    setStatus(LOCATION_STATUS.CHECKING_LOCATION);
    setErrorMessage('');

    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        setStatus(LOCATION_STATUS.LOCATION_UNAVAILABLE);
        setErrorMessage('Your browser does not support location services.');
        reject(new Error('unavailable'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const nextCoords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setCoords(nextCoords);
          setStatus(LOCATION_STATUS.LOCATION_GRANTED);
          resolve(nextCoords);
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            setStatus(LOCATION_STATUS.LOCATION_PERMISSION_DENIED);
            setErrorMessage('Location permission was denied. Please enable location access to mark attendance.');
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            setStatus(LOCATION_STATUS.LOCATION_UNAVAILABLE);
            setErrorMessage('Your location could not be determined. Please try again.');
          } else {
            setStatus(LOCATION_STATUS.LOCATION_ERROR);
            setErrorMessage('Something went wrong while getting your location. Please try again.');
          }
          reject(error);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }, []);

  const reset = useCallback(() => {
    setStatus(LOCATION_STATUS.IDLE);
    setCoords(null);
    setErrorMessage('');
  }, []);

  return { status, coords, errorMessage, request, reset };
}
