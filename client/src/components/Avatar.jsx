import { useEffect, useState } from 'react';
import { initials, getProfileImageUrl } from '../utils/formatters.js';

const SHAPES = {
  circle: 'rounded-full',
  square: 'rounded-2xl',
};

/**
 * Single shared avatar renderer for every place an employee photo appears.
 * Falls back to initials both when no image is set AND when the stored image
 * fails to load (broken/expired URL), instead of leaving a blank space.
 */
export function Avatar({ src, firstName, lastName, size = 'w-10 h-10', shape = 'circle', textSize = 'text-sm', className = '' }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const resolvedSrc = getProfileImageUrl(src);
  const showImage = Boolean(resolvedSrc) && !failed;
  const shapeClass = SHAPES[shape] || SHAPES.circle;

  if (showImage) {
    return (
      <div className={`${size} ${shapeClass} overflow-hidden shrink-0 ${className}`}>
        <img
          src={resolvedSrc}
          alt={`${firstName || ''} ${lastName || ''}`.trim() || 'Profile'}
          onError={() => setFailed(true)}
          className={`w-full h-full object-cover ${resolvedSrc.includes('ajmal') ? 'scale-125 object-[center_20%]' : ''}`}
        />
      </div>
    );
  }

  return (
    <div
      className={`${size} ${shapeClass} bg-brand-100 text-brand-800 flex items-center justify-center font-extrabold shrink-0 ${textSize} ${className}`}
    >
      {initials(firstName, lastName) || 'U'}
    </div>
  );
}
