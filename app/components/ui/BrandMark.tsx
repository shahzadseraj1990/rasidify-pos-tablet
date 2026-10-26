import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { palette } from '../../theme/tokens';

// Rasidify symbol in soft tints — the empty-state mark from the redesign.
export default function BrandMark({ size = 52, ring = palette.disabledBg, square = palette.indigoLine }: {
  size?: number; ring?: string; square?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="6 10 48 48">
      <Path d="M28.5 11.55A22.5 22.5 0 1 0 52.45 35.5L45.43 35.5A15.5 15.5 0 1 1 28.5 18.57Z" fill={ring} stroke={ring} strokeWidth={3} strokeLinejoin="round" />
      <Rect x={36} y={10} width={18} height={18} rx={4} fill={square} />
    </Svg>
  );
}
