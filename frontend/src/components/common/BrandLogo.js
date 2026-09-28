import React from 'react';
import { Link } from 'react-router-dom';

export default function BrandLogo({ to = '/', theme = 'light', size = 'default', showText = true, className = '' }) {
  const isDark = theme === 'dark';
  const iconSize = size === 'large' ? 38 : size === 'small' ? 24 : 30;

  return (
    <Link
      to={to}
      className={`brandLogo brandLogo-${theme} brandLogo-${size} ${className}`}
      aria-label="MapForge Home"
    >
      <div
        className="brandLogoIcon"
        style={{
          width: iconSize,
          height: iconSize,
          borderRadius: size === 'large' ? 10 : 8,
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: iconSize * 0.72, height: iconSize * 0.72 }}
        >
          {/* Folded map stylized icon */}
          <path
            d="M3 6.5L8.5 4L15.5 7.5L21 5V17.5L15.5 20L8.5 16.5L3 19V6.5Z"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8.5 4V16.5"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M15.5 7.5V20"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </div>
      {showText && (
        <span
          className="brandLogoText"
          style={{
            color: isDark ? '#FFFFFF' : '#0F172A',
            fontWeight: 800,
            letterSpacing: '-0.025em',
            fontSize: size === 'large' ? '1.35rem' : size === 'small' ? '0.95rem' : '1.15rem',
          }}
        >
          MapForge
        </span>
      )}
    </Link>
  );
}
