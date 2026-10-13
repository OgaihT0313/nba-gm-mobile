// Minha Carreira's root (PLANO-CARREIRA.md, fase 1). A mode of its own, apart
// from the GM: its own save (services/career/careerSave.ts), its own screens,
// the same pure league services underneath.
//
// Anything that runs the league for more than a day is done in small chunks on
// timers, like the GM's day loop: RN has no worker thread, and a season in one
// call would freeze the screen for seconds on a phone.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';

import { COLORS, FONT } from '../../src/theme/tokens';
import { getTeamNickname } from '../../constants';
import type { PlayerAttributes } from '../../types';
import type { CareerCreation, CareerState, CombineResult, WeeklyTraining } from '../../services/career/careerTypes';
import { newCareer, simDay, simToNextGame, simPlayoffRound, runSummer, myTeam, me } from '../../services/career/careerLeague';
import { spendPoint } from '../../services/career/careerTrust';
import { loadCareer, saveCareer, deleteCareer } from '../../services/career/careerSave';
import CareerCreateScreen from './CareerCreateScreen';
import CareerPreDraftScreen from './CareerPreDraftScreen';
import CareerDraftScreen from './CareerDraftScreen';
import CareerHub from './CareerHub';
import { Page, Label, Title, Body, Box, Option, Cta, Ghost } from './careerUi';

/** Days simulated per timer tick while a run is going. */
const DAYS_PER_TICK = 2;
/** At most this often the career is written while a run is going, ms. */
const SAVE_EVERY = 5000;

type Run = { kind: 'days'; left: number } | { kind: 'season' } | { kind: 'predraft' } | null;

const CareerApp: React.FC<{ onExit: () => void }> = ({ onExit }) => {
  const [career, setCareer] = useState<CareerState | null>(() => loadCareer());
  const [view, setView] = useState<'start' | 'create' | 'play'>('start');
  const [run, setRun] = useState<Run>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);

  // Autosave: debounced; during a run, at most every SAVE_EVERY.
  const lastSave = useRef(0);
  useEffect(() => {
    if (!career) return;
    if (run) {
      if (Date.now() - lastSave.current < SAVE_EVERY) return;
      lastSave.current = Date.now();
      saveCareer(career);
      return;
    }
    const t = setTimeout(() => saveCareer(career), 400);
    return () => clearTimeout(t);
  }, [career, run]);

  // The pre-draft season runs by itself while you're at the combine.
  useEffect(() => {
    if (career?.phase === 'predraft' && career.league.status !== 'offseason' && !run) setRun({ kind: 'predraft' });
  }, [career?.phase, career?.league.status, run]);

  // The run loop: a couple of days (or a playoff round) per tick.
  useEffect(() => {
    if (!run || !career) return;
    const t = setTimeout(() => {
      let s = career;
      let next: Run = run;
      if (run.kind === 'predraft') {
        if (s.league.status === 'active') for (let i = 0; i < DAYS_PER_TICK * 2 && s.league.status === 'active'; i++) s = simDay(s);
        else if (s.league.status !== 'offseason') s = simPlayoffRound(s);
        if (s.league.status === 'offseason') next = null;
      } else if (run.kind === 'days') {
        let left = run.left;
        for (let i = 0; i < DAYS_PER_TICK && left > 0 && s.league.status === 'active'; i++) { s = simDay(s); left--; }
        next = left > 0 && s.league.status === 'active' ? { kind: 'days', left } : null;
      } else {
        for (let i = 0; i < DAYS_PER_TICK && s.league.status === 'active'; i++) s = simDay(s);
        next = s.league.status === 'active' ? run : null;
      }
      setCareer(s);
      setRun(next);
      if (!next) setBusy(null);
    }, 16);
    return () => clearTimeout(t);
  }, [run, career]);

  // Heavy single steps (the summer, a playoff round) run after the "busy"
  // label has painted.
  const heavy = (label: string, step: (s: CareerState) => CareerState) => {
    if (!career || busy) return;
    setBusy(label);
    setTimeout(() => {
      setCareer((s) => (s ? step(s) : s));
      setBusy(null);
    }, 40);
  };

  const begin = (c: CareerCreation) => {
    deleteCareer();
    const fresh = newCareer(c);
    setCareer(fresh);
    setView('play');
  };

  const onCombine = (combine: CombineResult) => setCareer((s) => (s ? { ...s, combine } : s));
  const onDraft = () => heavy('Draft...', (s) => {
    const p = s.prospect!;
    const d = s.combine?.ovrDelta ?? 0;
    const prospect = { ...p, ovr: p.ovr + d, off: p.off + d, def: p.def + d };
    return runSummer(s, { player: prospect, combine: s.combine });
  });

  const actions = {
    simGame: () => { if (career && !busy) setCareer(simToNextGame(career)); },
    simDays: (n: number) => { if (!busy) { setBusy('Simulando...'); setRun({ kind: 'days', left: n }); } },
    simToEnd: () => { if (!busy) { setBusy('Simulando a temporada...'); setRun({ kind: 'season' }); } },
    simPlayoffRound: () => heavy('Simulando a rodada...', simPlayoffRound),
    nextSeason: () => heavy('O verão passa...', (s) => runSummer(s)),
    setTraining: (t: WeeklyTraining) => setCareer((s) => (s ? { ...s, training: t } : s)),
    spend: (k: keyof PlayerAttributes) => setCareer((s) => (s ? spendPoint(s, k) : s)),
    exit: onExit,
  };

  /* --- screens --- */
  if (view === 'create') return <CareerCreateScreen onDone={begin} onBack={() => setView('start')} />;

  if (view === 'start' || !career) {
    const p = career ? me(career) : undefined;
    const team = career ? myTeam(career) : undefined;
    return (
      <Page>
        <View className="flex-row items-center justify-between">
          <Label>Modo</Label>
          <Pressable accessibilityRole="button" accessibilityLabel="Voltar ao início" onPress={onExit} className="active:opacity-70">
            <Label color={COLORS.textSoft}>‹ Início</Label>
          </Pressable>
        </View>
        <Title size={40}>Minha carreira</Title>
        <Body>Você cria um jogador, vai para o draft e vive a carreira dele: ganhar a confiança do técnico, treinar, conquistar espaço. A liga inteira joga ao seu redor.</Body>
        {career && p ? (
          <Box>
            <Label>Carreira salva</Label>
            <Text style={{ fontFamily: FONT.cond800, fontSize: 26, color: COLORS.text, textTransform: 'uppercase' }}>{p.name}</Text>
            <Body>{team ? `${getTeamNickname(team)} · ` : ''}{p.ovr} de geral · {career.seasons.length + 1}ª temporada</Body>
            <Cta label="Continuar" onPress={() => setView('play')} />
            {confirmNew ? (
              <View style={{ gap: 8 }}>
                <Body color={COLORS.warn}>Começar outra apaga esta carreira. Tem certeza?</Body>
                <View className="flex-row" style={{ gap: 8 }}>
                  <Ghost label="Apagar e criar" onPress={() => { setConfirmNew(false); setView('create'); }} style={{ flex: 1 }} />
                  <Ghost label="Cancelar" onPress={() => setConfirmNew(false)} style={{ flex: 1 }} />
                </View>
              </View>
            ) : <Ghost label="Nova carreira" onPress={() => setConfirmNew(true)} />}
          </Box>
        ) : null}
        <Box>
          <Label>Onde começar</Label>
          <Option label="Liga atual" sub="O draft de 2026, com os elencos de 2025-26." active onPress={() => (career ? setConfirmNew(true) : setView('create'))} />
          <Option label="Eras" sub="Entrar numa era da NBA, na classe de draft real. Em breve." active={false} onPress={() => {}} disabled />
        </Box>
        {!career ? <Cta label="Criar jogador" sub="Liga atual ›" onPress={() => setView('create')} /> : null}
      </Page>
    );
  }

  if (career.phase === 'predraft') {
    const lg = career.league;
    const regular = Math.min(1, lg.gamesPlayed / 82);
    const progress = lg.status === 'offseason'
      ? { frac: 1, label: 'Campeão definido', done: true }
      : lg.status === 'active'
        ? { frac: regular * 0.9, label: `Jogo ${lg.gamesPlayed} de 82`, done: false }
        : { frac: 0.93, label: 'Playoffs', done: false };
    return (
      <View style={{ flex: 1 }}>
        <CareerPreDraftScreen prospect={career.prospect!} progress={progress} combine={career.combine} onCombine={onCombine} onDraft={onDraft} />
        {busy ? <BusyVeil label={busy} /> : null}
      </View>
    );
  }

  if (career.phase === 'draft') {
    return <CareerDraftScreen career={career} onStart={() => setCareer({ ...career, phase: 'season' })} />;
  }

  return <CareerHub career={career} busy={busy} actions={actions} />;
};

const BusyVeil: React.FC<{ label: string }> = ({ label }) => (
  <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(11,11,13,0.6)', alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ fontFamily: FONT.cond800, fontSize: 22, color: '#fff', textTransform: 'uppercase' }}>{label}</Text>
  </View>
);

export default CareerApp;
