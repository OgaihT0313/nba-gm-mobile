import React from 'react';
import { View, Text } from 'react-native';
import { INK } from '../src/theme/tokens';
import { Eyebrow, HeroTitle } from './ui/kit';

// The header block for screens the redesign doesn't spell out shot-for-shot
// (Franquias, Scout, All-Star…). Meant to live inside <HeroContent>, so it
// renders ON the team-colored hero band: mono eyebrow, Inter 900 italic title,
// optional supporting line, optional action row.
interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Ignored — kept so older call sites don't break; the hero sets the color. */
  accentColor?: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({ eyebrow, title, subtitle, actions }) => (
  <View>
    {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
    <HeroTitle size={28} style={{ marginTop: eyebrow ? 9 : 0 }} numberOfLines={2} adjustsFontSizeToFit>
      {title}
    </HeroTitle>
    {subtitle ? (
      typeof subtitle === 'string' ? (
        <Text style={{ fontSize: 12, lineHeight: 18, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>{subtitle}</Text>
      ) : (
        <View style={{ marginTop: 8 }}>{subtitle}</View>
      )
    ) : null}
    {actions ? <View style={{ marginTop: 14 }}>{actions}</View> : null}
  </View>
);

export default PageHeader;

// Re-exported so the few call sites that only needed the muted body color don't
// have to reach into the token module themselves.
export const HEADER_BODY_COLOR = INK.body;
