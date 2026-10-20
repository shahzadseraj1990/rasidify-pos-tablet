// Rasidify logo (symbol + wordmark) from the 2026 brand kit, drawn as vector
// so it works offline at any size. Pick the variant for the background:
//   primary: white/light backgrounds (indigo ring, black square, black name)
//   onDark:  black/near-black backgrounds (violet ring, cyan square, white name)
//   white:   brand-indigo backgrounds (white ring, cyan square, white name)
// Same file in the tablet POS, mobile POS, waiter and KDS apps.
import React from 'react';
import Svg, { G, Path, Rect } from 'react-native-svg';

export type LogoVariant = 'primary' | 'onDark' | 'white';

const COLORS: Record<LogoVariant, { ring: string; square: string; name: string }> = {
  primary: { ring: '#2815C2', square: '#0B0B0B', name: '#0B0B0B' },
  onDark: { ring: '#8262F9', square: '#4DEFEA', name: '#FFFFFF' },
  white: { ring: '#FFFFFF', square: '#4DEFEA', name: '#FFFFFF' },
};

const ASPECT_RATIO = 48 / 198.59;
const RING = 'M28.5 11.55A22.5 22.5 0 1 0 52.45 35.5L45.43 35.5A15.5 15.5 0 1 1 28.5 18.57Z';
const NAME = 'M42 0 27.4 -26.5H23.3V0H6.2V-70.2H34.9Q43.2 -70.2 49.05 -67.3Q54.9 -64.4 57.8 -59.35Q60.7 -54.3 60.7 -48.1Q60.7 -41.1 56.75 -35.6Q52.8 -30.1 45.1 -27.8L61.3 0ZM23.3 -38.6H33.9Q38.6 -38.6 40.95 -40.9Q43.3 -43.2 43.3 -47.4Q43.3 -51.4 40.95 -53.7Q38.6 -56 33.9 -56H23.3ZM91.1 -56.6Q97 -56.6 101.45 -54.2Q105.9 -51.8 108.3 -47.9V-55.8H125.4V0H108.3V-7.9Q105.8 -4 101.35 -1.6Q96.9 0.8 91 0.8Q84.2 0.8 78.6 -2.75Q73 -6.3 69.75 -12.85Q66.5 -19.4 66.5 -28Q66.5 -36.6 69.75 -43.1Q73 -49.6 78.6 -53.1Q84.2 -56.6 91.1 -56.6ZM96.1 -41.7Q91 -41.7 87.45 -38.05Q83.9 -34.4 83.9 -28Q83.9 -21.6 87.45 -17.85Q91 -14.1 96.1 -14.1Q101.2 -14.1 104.75 -17.8Q108.3 -21.5 108.3 -27.9Q108.3 -34.3 104.75 -38Q101.2 -41.7 96.1 -41.7ZM133.3 -18.3H150.2Q150.5 -15.4 152.9 -13.6Q155.3 -11.8 158.8 -11.8Q162 -11.8 163.75 -13.05Q165.5 -14.3 165.5 -16.3Q165.5 -18.7 163 -19.85Q160.5 -21 154.9 -22.4Q148.9 -23.8 144.9 -25.35Q140.9 -26.9 138 -30.25Q135.1 -33.6 135.1 -39.3Q135.1 -44.1 137.75 -48.05Q140.4 -52 145.55 -54.3Q150.7 -56.6 157.8 -56.6Q168.3 -56.6 174.35 -51.4Q180.4 -46.2 181.3 -37.6H165.5Q165.1 -40.5 162.95 -42.2Q160.8 -43.9 157.3 -43.9Q154.3 -43.9 152.7 -42.75Q151.1 -41.6 151.1 -39.6Q151.1 -37.2 153.65 -36Q156.2 -34.8 161.6 -33.6Q167.8 -32 171.7 -30.45Q175.6 -28.9 178.55 -25.45Q181.5 -22 181.6 -16.2Q181.6 -11.3 178.85 -7.45Q176.1 -3.6 170.95 -1.4Q165.8 0.8 159 0.8Q151.7 0.8 146 -1.7Q140.3 -4.2 137 -8.55Q133.7 -12.9 133.3 -18.3ZM189 -70.8Q189 -74.8 191.85 -77.45Q194.7 -80.1 199.2 -80.1Q203.6 -80.1 206.45 -77.45Q209.3 -74.8 209.3 -70.8Q209.3 -66.9 206.45 -64.25Q203.6 -61.6 199.2 -61.6Q194.7 -61.6 191.85 -64.25Q189 -66.9 189 -70.8ZM207.7 -55.8V0H190.6V-55.8ZM239.8 -56.6Q245.3 -56.6 249.85 -54.3Q254.4 -52 257 -48.1V-74H274.1V0H257V-8Q254.6 -4 250.15 -1.6Q245.7 0.8 239.8 0.8Q232.9 0.8 227.3 -2.75Q221.7 -6.3 218.45 -12.85Q215.2 -19.4 215.2 -28Q215.2 -36.6 218.45 -43.1Q221.7 -49.6 227.3 -53.1Q232.9 -56.6 239.8 -56.6ZM244.8 -41.7Q239.7 -41.7 236.15 -38.05Q232.6 -34.4 232.6 -28Q232.6 -21.6 236.15 -17.85Q239.7 -14.1 244.8 -14.1Q249.9 -14.1 253.45 -17.8Q257 -21.5 257 -27.9Q257 -34.3 253.45 -38Q249.9 -41.7 244.8 -41.7ZM283.4 -70.8Q283.4 -74.8 286.25 -77.45Q289.1 -80.1 293.6 -80.1Q298 -80.1 300.85 -77.45Q303.7 -74.8 303.7 -70.8Q303.7 -66.9 300.85 -64.25Q298 -61.6 293.6 -61.6Q289.1 -61.6 286.25 -64.25Q283.4 -66.9 283.4 -70.8ZM302.1 -55.8V0H285V-55.8ZM341 -41.6H331.8V0H314.7V-41.6H308.5V-55.8H314.7V-57.4Q314.7 -67.7 320.6 -73.05Q326.5 -78.4 337.9 -78.4Q339.8 -78.4 340.7 -78.3V-63.8Q335.8 -64.1 333.8 -62.4Q331.8 -60.7 331.8 -56.3V-55.8H341ZM404.5 -55.8 369.5 26.5H351.1L363.9 -1.9L341.2 -55.8H360.3L373.2 -20.9L386 -55.8Z';

export default function RasidifyLogo({ width = 160, variant = 'primary' }: {
  width?: number;
  variant?: LogoVariant;
}) {
  const c = COLORS[variant];
  return (
    <Svg width={width} height={width * ASPECT_RATIO} viewBox="0 0 198.59 48">
      <G transform="translate(-6 -10)">
        <Path d={RING} fill={c.ring} stroke={c.ring} strokeWidth={3} strokeLinejoin="round" />
        <Rect x={36} y={10} width={18} height={18} rx={4} fill={c.square} />
      </G>
      <Path transform="translate(60.89 36) scale(0.3404)" d={NAME} fill={c.name} />
    </Svg>
  );
}
