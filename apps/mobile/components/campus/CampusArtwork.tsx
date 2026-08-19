import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { stealthTheme } from '@/lib/stealth-theme';

type CampusArtworkProps = {
  height?: number;
  width?: number | `${number}%`;
  compact?: boolean;
};

const colors = stealthTheme.colors;

/**
 * A small, deliberately simple campus vignette used across the onboarding and
 * dashboard surfaces. It stays decorative so the nearby controls retain clear
 * accessibility labels.
 */
export function CampusArtwork({
  height = 190,
  width = '100%',
  compact = false,
}: CampusArtworkProps) {
  return (
    <Svg
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      width={width}
      height={height}
      viewBox="0 0 360 190"
    >
      <Path
        d="M147 188c-17-22-23-41-15-58 9-20 39-25 49-45 7-14 2-29-12-46"
        fill="none"
        stroke="#E8DECC"
        strokeLinecap="round"
        strokeWidth={compact ? 20 : 24}
      />

      <G transform="translate(118 18)">
        <Path d="M2 42 40 12l38 30Z" fill={colors.forest} />
        <Rect x="11" y="42" width="58" height="43" rx="2" fill={colors.forest} />
        <Rect x="20" y="50" width="8" height="27" rx="1" fill={colors.softWhite} />
        <Rect x="36" y="50" width="8" height="27" rx="1" fill={colors.softWhite} />
        <Rect x="52" y="50" width="8" height="27" rx="1" fill={colors.softWhite} />
        <Circle cx="40" cy="31" r="4" fill={colors.gold} />
        <Path d="M-8 85h96" stroke={colors.forest} strokeLinecap="round" strokeWidth="7" />
      </G>

      <G transform="translate(22 92)">
        <Path
          d="M30 0C13 0 0 14 0 31c0 25 30 53 30 53s30-28 30-53C60 14 47 0 30 0Z"
          fill={colors.forest}
        />
        <Circle cx="30" cy="28" r="10" fill={colors.gold} />
        <Path d="M-7 87c19-11 55-11 75 0" stroke="#6C957C" strokeLinecap="round" strokeWidth="12" />
      </G>

      <G transform="translate(278 104)">
        <Path
          d="M27 0C12 0 0 12 0 27c0 23 27 48 27 48s27-25 27-48C54 12 42 0 27 0Z"
          fill={colors.forest}
        />
        <Circle cx="27" cy="25" r="9" fill={colors.gold} />
        <Path d="M-20 78c23-12 70-12 93 0" stroke="#6C957C" strokeLinecap="round" strokeWidth="12" />
      </G>

      {!compact ? (
        <G transform="translate(40 80)">
          <Circle cx="0" cy="0" r="13" fill="#6C957C" />
          <Circle cx="15" cy="4" r="17" fill="#6C957C" />
          <Circle cx="31" cy="2" r="12" fill="#6C957C" />
        </G>
      ) : null}
    </Svg>
  );
}
