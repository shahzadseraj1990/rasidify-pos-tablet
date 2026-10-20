import React, { useMemo } from 'react';
import { View } from 'react-native';
import { buildQrMatrix } from '../../utils/qrMatrix';

/**
 * Renders a real ZATCA Phase 2 QR (the government-signed base64 TLV string
 * returned inline on the create/invoice response) as a grid of plain Views -
 * no SVG/canvas dependency, consistent with how the rest of the receipt is
 * hand-built. This same grid is what react-native-view-shot captures for the
 * "Image Canvas" print mode; the raw ESC/POS print path renders the same
 * matrix separately via QrToEscPos.ts, from the same buildQrMatrix() source.
 */
export default function ZatcaQrCode({
  value, size = 120, pxPerDp,
}: {
  value: string;
  size?: number;
  // Device pixels per layout unit at the final rendered scale. When given, the
  // module size is snapped so every module covers a whole number of pixels —
  // fractional modules get anti-aliased edges that print as uneven squares.
  pxPerDp?: number;
}) {
  const matrix = useMemo(() => buildQrMatrix(value), [value]);
  const modulePx = pxPerDp
    ? Math.max(1, Math.floor((size * pxPerDp) / matrix.size)) / pxPerDp
    : size / matrix.size;
  size = modulePx * matrix.size;

  return (
    <View style={{ width: size, height: size, backgroundColor: '#fff' }}>
      {Array.from({ length: matrix.size }).map((_, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {Array.from({ length: matrix.size }).map((_, col) => (
            <View
              key={col}
              style={{
                width: modulePx,
                height: modulePx,
                backgroundColor: matrix.isDark(row, col) ? '#000' : '#fff',
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
