/** Line icons for Teammate mode, drawn from the call-screen design (24x24 grid). */
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type P = { size?: number; color?: string };

const line = (color: string, width = 1.8) => ({
  fill: 'none',
  stroke: color,
  strokeWidth: width,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export const PhoneIcon = ({ size = 20, color = '#fff' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...line(color, 2)}>
    <Path d="M5 3.5h3.2l1.9 4.6-2.4 1.6a12 12 0 0 0 5.6 5.6l1.6-2.4 4.6 1.9v3.2a2 2 0 0 1-2.1 2A16.5 16.5 0 0 1 3 5.6a2 2 0 0 1 2-2.1z" />
  </Svg>
);

export const MicIcon = ({ size = 28, color = '#fff', off = false }: P & { off?: boolean }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...line(color)}>
    <Rect x={9} y={2.5} width={6} height={11.5} rx={3} />
    <Path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
    <Path d="M12 17.5v3.5" />
    <Path d="M9 21h6" />
    {off ? <Path d="M4 3.5l16 17" /> : null}
  </Svg>
);

export const SpeakerIcon = ({ size = 28, color = '#fff' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...line(color)}>
    <Path d="M4 9.5v5h3.5l5 4v-13l-5 4z" />
    <Path d="M16 9a4.5 4.5 0 0 1 0 6" />
    <Path d="M18.5 6.5a8 8 0 0 1 0 11" />
  </Svg>
);

export const TagIcon = ({ size = 28, color = '#fff' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...line(color)}>
    <Path d="M20.4 13.6l-6.8 6.8a2 2 0 0 1-2.8 0L3.5 13.1V3.5h9.6l7.3 7.3a2 2 0 0 1 0 2.8z" />
    <Circle cx={8} cy={8} r={1.4} />
  </Svg>
);

export const NotesIcon = ({ size = 28, color = '#fff' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...line(color)}>
    <Rect x={4.5} y={3.5} width={15} height={17} rx={2.5} />
    <Path d="M8 8.5h8" />
    <Path d="M8 12h8" />
    <Path d="M8 15.5h5" />
  </Svg>
);

export const EndCallIcon = ({ size = 34, color = '#fff' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M2.6 13.9c5.2-5 13.6-5 18.8 0 .4.4.4 1 0 1.4l-1.9 1.9c-.3.3-.9.4-1.3.1l-2.4-1.7c-.3-.2-.4-.5-.4-.8v-2.1a12.5 12.5 0 0 0-6.8 0v2.1c0 .3-.1.6-.4.8l-2.4 1.7c-.4.3-1 .2-1.3-.1l-1.9-1.9c-.4-.4-.4-1 0-1.4z" />
  </Svg>
);

export const CheckIcon = ({ size = 20, color = '#0B7A54' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...line(color, 2.4)}>
    <Path d="M5.5 12.5l4.2 4.2 8.8-9.4" />
  </Svg>
);

export const ChevronDownIcon = ({ size = 22, color = '#57534E' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...line(color, 2)}>
    <Path d="M6 9.5l6 6 6-6" />
  </Svg>
);

export const ChevronRightIcon = ({ size = 20, color = '#050507' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...line(color, 2.2)}>
    <Path d="M5 12h13" />
    <Path d="M13 6.5l5.5 5.5-5.5 5.5" />
  </Svg>
);

export const TabletIcon = ({ size = 20, color = '#0B5C3F' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...line(color, 1.9)}>
    <Rect x={4.5} y={2.5} width={15} height={19} rx={2.5} />
    <Path d="M10.5 18h3" />
  </Svg>
);

export const PlusIcon = ({ size = 18, color = '#18181B' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...line(color, 2)}>
    <Path d="M12 5v14" />
    <Path d="M5 12h14" />
  </Svg>
);

export const TrashIcon = ({ size = 18, color = '#78716C' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...line(color, 1.8)}>
    <Path d="M4.5 7h15" />
    <Path d="M9.5 7V4.5h5V7" />
    <Path d="M6.5 7l1 13h9l1-13" />
  </Svg>
);

export const BackIcon = ({ size = 22, color = '#FFFFFF' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...line(color, 2.2)}>
    <Path d="M19 12H6" />
    <Path d="M11 6.5L5.5 12l5.5 5.5" />
  </Svg>
);

export const ChevronIcon = ({ size = 18, color = '#A8A29E', dir = 'right' }: P & { dir?: 'left' | 'right' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...line(color, 2.4)}>
    <Path d={dir === 'right' ? 'M9 5l7 7-7 7' : 'M15 5l-7 7 7 7'} />
  </Svg>
);

export const GearIcon = ({ size = 21, color = '#FFFFFF' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...line(color, 1.9)}>
    <Circle cx={12} cy={12} r={3} />
    <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
);

export const ChatIcon = ({ size = 22, color = '#0B7A54' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...line(color, 2)}>
    <Path d="M4 5.5h11a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3H4A1.5 1.5 0 0 1 2.5 13V7A1.5 1.5 0 0 1 4 5.5z" />
    <Path d="M19.5 9.5H20a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-1.5v3L15 18.5h-4" />
  </Svg>
);

export const PersonIcon = ({ size = 22, color = '#1D4ED8' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...line(color, 2)}>
    <Circle cx={12} cy={8} r={3.5} />
    <Path d="M5 20a7 7 0 0 1 14 0" />
  </Svg>
);

export const ListIcon = ({ size = 20, color = '#57534E' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...line(color, 2)}>
    <Path d="M9 6.5h11M9 12h11M9 17.5h11" />
    <Path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />
  </Svg>
);

export const CardIcon = ({ size = 20, color = '#57534E' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...line(color, 2)}>
    <Rect x={2.5} y={5.5} width={19} height={13} rx={2} />
    <Path d="M2.5 10h19" />
  </Svg>
);

export const HelpIcon = ({ size = 20, color = '#57534E' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...line(color, 2)}>
    <Circle cx={12} cy={12} r={9.5} />
    <Path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6" />
    <Path d="M12 17h.01" />
  </Svg>
);

export const LinkIcon = ({ size = 20, color = '#57534E' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...line(color, 2)}>
    <Path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
    <Path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
  </Svg>
);

export const PencilIcon = ({ size = 18, color = '#0B7A54' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...line(color, 2)}>
    <Path d="M4 20h4L19 9l-4-4L4 16z" />
    <Path d="M13.5 6.5l4 4" />
  </Svg>
);

/** One line icon per industry, as on the "What do you sell?" screen. */
export const IndustryIcon = ({ id, size = 26, color }: P & { id: string }) => {
  const c = color ?? INDUSTRY_COLORS[id] ?? '#3F3F46';
  const l = line(c, 2);
  switch (id) {
    case 'internet':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...l}>
          <Path d="M2.5 9a14 14 0 0 1 19 0" />
          <Path d="M5.5 12.5a9.5 9.5 0 0 1 13 0" />
          <Path d="M8.7 16a5 5 0 0 1 6.6 0" />
          <Path d="M12 19.5h.01" />
        </Svg>
      );
    case 'solar':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...l}>
          <Circle cx={12} cy={12} r={4} />
          <Path d="M12 2.5v2M12 19.5v2M4.6 4.6L6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
        </Svg>
      );
    case 'security':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...l}>
          <Path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z" />
        </Svg>
      );
    case 'pest':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...l}>
          <Rect x={7.5} y={8} width={9} height={12} rx={4.5} />
          <Path d="M9.5 8a2.5 2.5 0 0 1 5 0" />
          <Path d="M3.5 13h4M16.5 13h4M4.5 8.5l3 2M19.5 8.5l-3 2M4.5 18.5l3-2M19.5 18.5l-3-2" />
        </Svg>
      );
    case 'roofing':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...l}>
          <Path d="M3 11.5L12 4l9 7.5" />
          <Path d="M5.5 9.5V20h13V9.5" />
          <Path d="M10 20v-5.5h4V20" />
        </Svg>
      );
    case 'ministry':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...l}>
          <Path d="M12 2.5v5M9.5 5h5" />
          <Path d="M5 21v-8l7-5.5 7 5.5v8z" />
          <Path d="M10 21v-4a2 2 0 0 1 4 0v4" />
        </Svg>
      );
    case 'fundraiser':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...l}>
          <Path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z" />
        </Svg>
      );
    default:
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...l}>
          <Circle cx={12} cy={12} r={9} />
          <Path d="M12 8v8M8 12h8" />
        </Svg>
      );
  }
};

const INDUSTRY_COLORS: Record<string, string> = {
  internet: '#0B7A54',
  solar: '#B45309',
  security: '#1D4ED8',
  pest: '#7C2D12',
  roofing: '#57534E',
  ministry: '#6D28D9',
  fundraiser: '#BE185D',
  other: '#3F3F46',
};
