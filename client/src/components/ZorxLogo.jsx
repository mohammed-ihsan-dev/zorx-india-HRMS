import { useState } from 'react';

/**
 * ZorxLogo Component
 * 
 * Props:
 * - variant: 'green' (default for light backgrounds) | 'white' (for dark green/black backgrounds)
 * - size: 'sm' | 'md' | 'lg' | 'xl' | 'sidebar' | 'navbar' | 'login'
 * - className: custom additional CSS classes
 * - showTagline: boolean (default true)
 */
export function ZorxLogo({ variant = 'green', size = 'md', className = '', showTagline = true }) {
  const [imgError, setImgError] = useState(false);

  const primarySrc = variant === 'white' ? '/assets/zorx-logo-white.png' : '/assets/zorx-logo-green.png';
  const fallbackSrc = variant === 'white' ? '/assets/zorx-logo-green.png' : '/assets/zorx-logo-white.png';
  const [currentSrc, setCurrentSrc] = useState(primarySrc);

  const sizeStyles = {
    sm: 'w-28 sm:w-32',
    md: 'w-36 sm:w-44',
    lg: 'w-48 sm:w-56',
    xl: 'w-60 sm:w-72',
    navbar: 'w-36 sm:w-44',
    sidebar: 'w-44 sm:w-48',
    login: 'w-56 sm:w-64',
  }[size] || 'w-40';

  const handleError = () => {
    if (currentSrc === primarySrc) {
      setCurrentSrc(fallbackSrc);
    } else {
      setImgError(true);
    }
  };

  if (imgError) {
    // Text fallback if both image sources fail
    const isDark = variant === 'white';
    return (
      <div className={`flex flex-col items-start font-sans shrink-0 ${className}`}>
        <div className="flex items-center gap-2">
          <div className={`px-2.5 py-1 rounded-lg font-black text-lg tracking-wider ${isDark ? 'bg-brand-200 text-brand-950' : 'bg-brand-800 text-white'}`}>
            ZORX
          </div>
          <span className={`font-extrabold text-xl tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
            INDIA
          </span>
        </div>
        {showTagline && (
          <span className={`text-[10px] font-semibold uppercase tracking-widest mt-1 ${isDark ? 'text-brand-200' : 'text-brand-700'}`}>
            Fueling Brands Growth
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center shrink-0 ${sizeStyles} ${className}`}>
      <img
        src={currentSrc}
        alt="ZORX India"
        onError={handleError}
        className="w-full h-auto object-contain block"
      />
    </div>
  );
}
