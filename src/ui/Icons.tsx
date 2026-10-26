import React from 'react';

export interface IconProps extends React.SVGAttributes<SVGSVGElement> {
  size?: number | string;
  className?: string;
}

function baseProps(size: number | string = 16, className?: string, rest?: React.SVGAttributes<SVGSVGElement>) {
  return {
    xmlns: 'http://www.w3.org/2000/svg',
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: `icon-svg ${className ?? ''}`.trim(),
    'aria-hidden': true,
    focusable: 'false' as const,
    ...rest
  };
}

export function SunIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

export function MoonIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

export function FlowerIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2a3 3 0 0 0-3 3c0 2 3 4 3 4s3-2 3-4a3 3 0 0 0-3-3Z" />
      <path d="M12 22a3 3 0 0 0 3-3c0-2-3-4-3-4s-3 2-3 4a3 3 0 0 0 3 3Z" />
      <path d="M2 12a3 3 0 0 0 3 3c2 0 4-3 4-3s-2-3-4-3a3 3 0 0 0-3 3Z" />
      <path d="M22 12a3 3 0 0 0-3-3c-2 0-4 3-4 3s2 3 4 3a3 3 0 0 0 3-3Z" />
    </svg>
  );
}

export function TreeIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="m12 3-7 8h3l-2.5 5h4.5v5h4v-5h4.5l-2.5-5h3z" />
    </svg>
  );
}

export function GraduationCapIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </svg>
  );
}

export function GearIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function LinkIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export function MapPinIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function MicroscopeIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="M6 18h8M3 22h18" />
      <path d="M14 22a7 7 0 1 0 0-14h-1" />
      <path d="M9 14h2" />
      <path d="M10 6 7 9l5 5 3-3-5-5Z" />
      <path d="m7 3 3 3" />
      <path d="m14 10 3 3" />
    </svg>
  );
}

export function LightbulbIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
  );
}

export function ToolsIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

export function CheckIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function CloseIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function TargetIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

export function CameraIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

export function VideoIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="m22 8-6 4 6 4V8Z" />
      <rect width="14" height="12" x="2" y="6" rx="2" />
    </svg>
  );
}

export function TrophyIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M12 15a4 4 0 0 0 4-4V3H8v8a4 4 0 0 0 4 4Z" />
      <path d="M12 15v7" />
    </svg>
  );
}

export function PartyIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="M5.8 11.3 2 22l10.7-3.8A10 10 0 0 0 5.8 11.3Z" />
      <path d="M4 3h.01M10 2h.01M7 6h.01M16 4a2 2 0 0 1 2 2M18 9a3 3 0 0 1 3 3M14 7a4 4 0 0 1 4 4" />
    </svg>
  );
}

export function SparklesIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z" />
      <path d="M19 3v4M21 5h-4M5 19v2M6 20H4" />
    </svg>
  );
}

export function FlameIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}

export function GlobeIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a15.3 15.3 0 0 0 4 10 15.3 15.3 0 0 0-4 10 15.3 15.3 0 0 0-4-10 15.3 15.3 0 0 0 4-10z" />
      <path d="M2 12h20" />
    </svg>
  );
}

export function TrendingUpIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

export function BookOpenIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

export function SearchIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

export function PaletteIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.24-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9z" />
    </svg>
  );
}

export function ChainIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="m11 15-2 2a4 4 0 1 1-5.66-5.66l2-2a4 4 0 0 1 5.66 0" />
      <path d="M13 9l2-2a4 4 0 1 1 5.66 5.66l-2 2a4 4 0 0 1-5.66 0" />
      <path d="m8 16 8-8" />
    </svg>
  );
}

export function PencilIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

export function PawIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="M12 10a2.5 2.5 0 0 1 2.5 2.5c0 1.5-1.5 3-2.5 3.5-1-.5-2.5-2-2.5-3.5A2.5 2.5 0 0 1 12 10Z" />
      <circle cx="6.5" cy="9.5" r="1.5" />
      <circle cx="17.5" cy="9.5" r="1.5" />
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
    </svg>
  );
}


export function ZapIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

export function ChessKnightIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="M19 20H5v-2a3 3 0 0 1 3-3h1V9l-3 3-2-2 4-5c1-1 3-2 5-2s4 1 5 2l1 5-2 3v3h2v2z" />
      <circle cx="12" cy="8" r="1" fill="currentColor" />
    </svg>
  );
}

export function FishIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.46-3.44 6-7 6s-7.56-2.54-8.5-6Z" />
      <path d="M18 12v.5" />
      <path d="M16 17.93a9.77 9.77 0 0 1 0-11.86" />
      <path d="M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 3.5.5 5.5-1.5 2-1.5 4-.5 5.5 2.85-.47 4.27-2.5 4.27-5.17v-.66Z" />
      <circle cx="18" cy="10" r="1" fill="currentColor" />
    </svg>
  );
}

export function TerminalIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" x2="20" y1="19" y2="19" />
    </svg>
  );
}

export function InfoIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="16" y2="12" />
      <line x1="12" x2="12.01" y1="8" y2="8" strokeWidth={3} />
    </svg>
  );
}

export function HeartIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

export function ExternalLinkIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export function EraserIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
      <path d="M22 21H7" />
      <path d="m5 11 9 9" />
    </svg>
  );
}

export function UndoIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  );
}

export function RedoIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
    </svg>
  );
}

export function MenuIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="18" y2="18" />
    </svg>
  );
}

export function ChevronUpIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

export function ChevronDownIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function ChevronLeftIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

export function ChevronRightIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function GripIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <circle cx="9" cy="12" r="1" fill="currentColor" />
      <circle cx="9" cy="5" r="1" fill="currentColor" />
      <circle cx="9" cy="19" r="1" fill="currentColor" />
      <circle cx="15" cy="12" r="1" fill="currentColor" />
      <circle cx="15" cy="5" r="1" fill="currentColor" />
      <circle cx="15" cy="19" r="1" fill="currentColor" />
    </svg>
  );
}

export function MinimizeIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" x2="21" y1="10" y2="3" />
      <line x1="3" x2="10" y1="21" y2="14" />
    </svg>
  );
}

export function MaximizeIcon({ size, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className, rest)}>
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" x2="14" y1="3" y2="10" />
      <line x1="3" x2="10" y1="21" y2="14" />
    </svg>
  );
}
