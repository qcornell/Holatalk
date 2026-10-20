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
