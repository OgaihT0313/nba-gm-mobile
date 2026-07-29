import React from 'react';
import { View, Text } from 'react-native';
import { Svg, Path, Line, Circle, Text as SvgText } from 'react-native-svg';
import { Team, Player } from '../types';
import { useTheme } from '../src/theme/ThemeProvider';

// RN port of the win-evolution chart. The web used Chart.js on a <canvas>
// (which also forced the getComputedStyle('--accent') hack, since canvas can't
// read CSS vars). Here it's a hand-rolled react-native-svg line chart — no new
// dependency, and the accent comes straight from the theme context.
interface TeamAnalyticsProps {
  team: Team;
  players: { [key: string]: Player };
}

const W = 320;
const H = 200;
const PAD = { left: 30, right: 10, top: 10, bottom: 22 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const Y_TICKS = [0, 25, 50, 75, 100];

const TeamAnalytics: React.FC<TeamAnalyticsProps> = ({ team }) => {
  const { accent } = useTheme();
  const history = team.performanceHistory || [];

  if (history.length <= 1) {
    return (
      <View className="gap-4">
        <Text className="text-lg font-bold text-white">Análise Técnica</Text>
        <View className="bg-slate-950/50 p-8 rounded-hero border border-slate-900 items-center justify-center min-h-[200px]">
          <Text className="text-slate-600 font-bold uppercase tracking-widest text-[10px] text-center italic">
            Aguardando dados da temporada...
          </Text>
        </View>
      </View>
    );
  }

  const maxGames = Math.max(...history.map((h) => h.gamesPlayed), 1);
  const pts = history.map((h) => ({
    x: PAD.left + (h.gamesPlayed / maxGames) * PLOT_W,
    y: PAD.top + (1 - (h.gamesPlayed > 0 ? (h.wins / h.gamesPlayed) * 100 : 0) / 100) * PLOT_H,
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(1)},${PAD.top + PLOT_H} L ${pts[0].x.toFixed(1)},${PAD.top + PLOT_H} Z`;

  return (
    <View className="gap-4">
      <Text className="text-lg font-bold text-white">Análise Técnica</Text>
      <View className="bg-slate-950/50 p-4 rounded-hero border border-slate-900">
        <Text className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-3 text-center">
          Evolução de Vitórias
        </Text>
        <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
          {/* Grid + Y labels */}
          {Y_TICKS.map((t) => {
            const y = PAD.top + (1 - t / 100) * PLOT_H;
            return (
              <React.Fragment key={t}>
                <Line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
                <SvgText x={PAD.left - 6} y={y + 3} fill="#64748b" fontSize={9} textAnchor="end">{t}</SvgText>
              </React.Fragment>
            );
          })}
          {/* X labels (first / last) */}
          <SvgText x={PAD.left} y={H - 6} fill="#64748b" fontSize={9} textAnchor="start">0</SvgText>
          <SvgText x={W - PAD.right} y={H - 6} fill="#64748b" fontSize={9} textAnchor="end">{maxGames}</SvgText>

          {/* Area + line */}
          <Path d={areaPath} fill={`${accent.primary}22`} />
          <Path d={linePath} fill="none" stroke={accent.primary} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
          {pts.map((p, i) => (
            <Circle key={i} cx={p.x} cy={p.y} r={3} fill={accent.primary} />
          ))}
        </Svg>
        <Text className="text-[9px] text-slate-600 text-center mt-1">% de vitórias por jogos disputados</Text>
      </View>
    </View>
  );
};

export default TeamAnalytics;
