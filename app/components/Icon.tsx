/**
 * Thin wrapper around @expo/vector-icons FontAwesome5 + MaterialCommunityIcons.
 * Use this everywhere instead of emoji for consistent professional icons.
 */
import React from 'react';
import { FontAwesome5, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';

interface Props {
  name: string;
  size?: number;
  color?: string;
  library?: 'fa5' | 'mci' | 'ion';
  style?: object;
}

export default function Icon({ name, size = 20, color = '#333', library = 'fa5', style }: Props) {
  if (library === 'mci') {
    return <MaterialCommunityIcons name={name as any} size={size} color={color} style={style} />;
  }
  if (library === 'ion') {
    return <Ionicons name={name as any} size={size} color={color} style={style} />;
  }
  return <FontAwesome5 name={name as any} size={size} color={color} style={style} />;
}
