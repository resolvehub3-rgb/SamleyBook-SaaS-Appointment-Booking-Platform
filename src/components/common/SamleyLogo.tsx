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
  const iconSizes = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-11 h-11 text-base',
  };

  const titleSizes = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl',
  };

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Official Logo Placement Placeholder: cleanly branded monogram until official image asset is uploaded */}
      <div
        className={`${iconSizes[size]} rounded-xl bg-orange-600 flex items-center justify-center font-bold text-white shadow-xs shrink-0 select-none`}
        title="SamleyBook Official Logo Placement"
      >
        <span className="font-extrabold tracking-tight">S</span>
      </div>

      <div className="flex flex-col leading-tight">
        <span
          className={`font-black tracking-tight ${titleSizes[size]} ${
            light ? 'text-white' : 'text-zinc-900'
          }`}
        >
          SamleyBook
        </span>
        {showAttribution && (
          <span
            className={`text-[10px] font-medium tracking-normal ${
              light ? 'text-orange-200' : 'text-zinc-500'
            }`}
          >
            A product by <strong className={light ? 'text-white' : 'text-zinc-700'}>SamTeck Digital</strong>
          </span>
        )}
      </div>
    </div>
  );
};
