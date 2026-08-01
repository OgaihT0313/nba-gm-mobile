import React from 'react';
import { View, ViewProps } from 'react-native';
import { COLORS } from '../src/theme/tokens';

// The legacy card primitive, repainted onto the "Console MyGM" surface ramp
// (#0d1526 fill, #1c2942 hairline) so the screens the redesign doesn't spell
// out shot-for-shot still land inside the same system. New work should reach
// for <Panel> in components/ui/kit — it's the same surface with the 3px
// left-edge data bar the design uses to mark a highlight card.
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

const PADDING: Record<CardPadding, number> = { sm: 13, md: 15, lg: 18 };

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
  const radius = hero ? 32 : 20;

  // The 3px bar replaces the old 4px left border: same idea (this card is
  // about one thing, colored by it), drawn as an overlay so it stays inside
  // the rounded corners instead of squaring them off.
  if (variant === 'offseason') {
    return (
      <View
        className={className}
        style={[
          {
            borderRadius: radius,
            backgroundColor: COLORS.panel,
            borderWidth: 1,
            borderColor: COLORS.line,
            padding: PADDING[padding],
            overflow: 'hidden',
          },
          style,
        ]}
        {...rest}
      >
        <View
          style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: accentColor ?? COLORS.cta }}
        />
        {children}
      </View>
    );
  }

  return (
    <View
      className={className}
      style={[
        {
          borderRadius: radius,
          backgroundColor: variant === 'raised' ? '#111d33' : COLORS.panel,
          borderWidth: 1,
          borderColor: variant === 'raised' ? '#243553' : COLORS.line,
          padding: PADDING[padding],
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
};

export default Card;
