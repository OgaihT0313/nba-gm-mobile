import React from 'react';
import { View, ViewProps } from 'react-native';

// RN port of the web Card primitive. Same 3 variants + padding scale; radius
// uses the rounded-card/rounded-hero tokens (tailwind.config). The web's
// color-mix inset glow on the offseason variant is dropped (not expressible in
// RN) — the accent left border carries the highlight.
type CardVariant = 'base' | 'raised' | 'offseason';
type CardPadding = 'sm' | 'md' | 'lg';

interface CardProps extends ViewProps {
  variant?: CardVariant;
  padding?: CardPadding;
  hero?: boolean;
  accentColor?: string;
  className?: string;
  children: React.ReactNode;
}

const PADDING: Record<CardPadding, string> = { sm: 'p-4', md: 'p-5', lg: 'p-6' };

const Card: React.FC<CardProps> = ({
  variant = 'base',
  padding = 'md',
  hero = false,
  accentColor,
  className = '',
  children,
  style,
  ...rest
}) => {
  const radius = hero ? 'rounded-hero' : 'rounded-card';

  if (variant === 'offseason') {
    return (
      <View
        className={`${radius} border-l-4 border-l-accent bg-slate-900 ${PADDING[padding]} ${className}`}
        style={[accentColor ? { borderLeftColor: accentColor } : null, style]}
        {...rest}
      >
        {children}
      </View>
    );
  }

  const base = variant === 'raised' ? 'bg-slate-800/50 border-slate-700/60' : 'bg-slate-900 border-slate-800';

  return (
    <View className={`${radius} border ${base} ${PADDING[padding]} ${className}`} style={style} {...rest}>
      {children}
    </View>
  );
};

export default Card;
