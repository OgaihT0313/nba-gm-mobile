// Minha Carreira's own save, apart from the GM's (saveStorage slot 'career'):
// one slot, the whole CareerState as JSON with a format version, written the
// same way the GM's is -- through a temp file on the phone, never two at once.
import { readSave, writeSave, removeSave } from '../saveStorage';
import type { CareerState } from './careerTypes';

const VERSION = 1;

export const loadCareer = (): CareerState | null => {
  const text = readSave('career');
  if (!text) return null;
  try {
    const file = JSON.parse(text) as { version: number; career: CareerState };
    if (file.version !== VERSION || !file.career?.league || !file.career.meId) return null;
    return file.career;
  } catch (e) {
    console.warn('[carreira] save ilegível', e);
    return null;
  }
};

let writing = false;
let queued: CareerState | null = null;
let generation = 0;

const flush = async () => {
  writing = true;
  while (queued) {
    const career = queued;
    queued = null;
    const gen = generation;
    try {
      await writeSave(JSON.stringify({ version: VERSION, savedAt: new Date().toISOString(), career }), 'career');
      if (gen !== generation) removeSave('career');
    } catch (e) {
      console.warn('[carreira] gravação falhou', e);
    }
  }
  writing = false;
};

export const saveCareer = (career: CareerState): void => {
  queued = career;
  if (!writing) flush();
};

export const deleteCareer = (): void => {
  queued = null;
  generation++;
  removeSave('career');
};
