import React from 'react';

interface Props {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showAttribution?: boolean;
  light?: boolean;
}

export const SamleyLogo: React.FC<Props> = ({
  className = '',
  size = 'md',
  showAttribution = true,
  light = false,
}) => {
  const heights = {
    sm: 'h-7',
    md: 'h-9',
    lg: 'h-11',
  };

  return (
    <div className={`flex flex-col leading-tight ${className}`}>
      <img
        src="/Logo.png"
        alt="SamleyBook"
        className={`${heights[size]} w-auto object-contain select-none ${
          light ? 'bg-white rounded-lg p-1' : 'mix-blend-multiply'
        }`}
      />
      {showAttribution && (
        <span
          className={`text-[10px] font-medium tracking-normal mt-0.5 ${
            light ? 'text-orange-200' : 'text-zinc-500'
          }`}
        >
          A product by <strong className={light ? 'text-white' : 'text-zinc-700'}>SamTeck Digital</strong>
        </span>
      )}
    </div>
  );
};