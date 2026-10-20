import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

// Saudi Riyal symbol (SAMA) drawn as a vector, so it stays sharp at any size
// (a 56 pt customer-display total included) and takes any colour.
//
// The path is the glyph from the official icon font (riyal-font-symbol/
// saudi-riyal.svg, U+E800, the same font the web dashboard uses). The font
// itself isn't used: Android loaded it but drew the private-use glyph blank.
// Font units have y pointing up (ascent 850, 1000 per em), hence the flip.
//
// Same file in every Rasidify app. Can sit inline inside <Text> (see Money).
const GLYPH =
  'M622-36c-17-35-29-74-34-114l378 72c18 35 30 74 34 114l-378-72z' +
  'm344 173c18 35 29 74 34 114l-294-56v108l260 49c18 36 29 74 34 114l-294-56v387' +
  'c-45-22-85-52-118-88v-321l-117-22v484c-46-23-86-53-118-88v-419l-263-50' +
  'c-18-35-30-74-35-114l298 57v-136l-319-60c-18-36-29-74-34-115l334 64' +
  'c27 5 50 19 65 39l61 81v0c7 9 11 19 11 30v119l117 22v-215l378 72 0 0z';

export default function RiyalIcon({ size = 14, color = '#000', style }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1000 1000" style={style}>
      <Path d={GLYPH} fill={color} transform="translate(0 850) scale(1 -1)" />
    </Svg>
  );
}
