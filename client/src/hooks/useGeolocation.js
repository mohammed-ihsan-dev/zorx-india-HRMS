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
 * never on mount, and never in the background. Features automatic fallback from
 * GPS high accuracy to standard Wi-Fi/IP location positioning.
 */
export function useGeolocation() {
  const [status, setStatus] = useState(LOCATION_STATUS.IDLE);
  const [coords, setCoords] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const request = useCallback(() => {
    setStatus(LOCATION_STATUS.CHECKING_LOCATION);
    setErrorMessage('');

    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !('geolocation' in navigator)) {
        const msg = 'Your browser does not support location services.';
        setStatus(LOCATION_STATUS.LOCATION_UNAVAILABLE);
        setErrorMessage(msg);
        reject(new Error(msg));
        return;
      }

      const handleSuccess = (position) => {
        const nextCoords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setCoords(nextCoords);
        setStatus(LOCATION_STATUS.LOCATION_GRANTED);
        resolve(nextCoords);
      };

      const handlePrimaryError = (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          const msg = 'Location permission was denied. Please click the lock icon in your browser address bar and set Location to Allow.';
          setStatus(LOCATION_STATUS.LOCATION_PERMISSION_DENIED);
          setErrorMessage(msg);
          reject(new Error(msg));
          return;
        }

        // Fallback attempt with standard accuracy (Wi-Fi/IP positioning)
        navigator.geolocation.getCurrentPosition(
          handleSuccess,
          (fallbackError) => {
            let msg = 'Could not determine your location. Please try again.';
            if (fallbackError.code === fallbackError.PERMISSION_DENIED) {
              msg = 'Location permission was denied. Please allow location access to check in.';
              setStatus(LOCATION_STATUS.LOCATION_PERMISSION_DENIED);
            } else if (fallbackError.code === fallbackError.POSITION_UNAVAILABLE) {
              msg = 'Your location is currently unavailable. Please ensure location services are enabled on your device.';
              setStatus(LOCATION_STATUS.LOCATION_UNAVAILABLE);
            } else {
              msg = 'Location request timed out. Please try again.';
              setStatus(LOCATION_STATUS.LOCATION_ERROR);
            }
            setErrorMessage(msg);
            reject(new Error(msg));
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 }
        );
      };

      // Primary attempt: High Accuracy
      navigator.geolocation.getCurrentPosition(
        handleSuccess,
        handlePrimaryError,
        { enableHighAccuracy: true, timeout: 7000, maximumAge: 0 }
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

