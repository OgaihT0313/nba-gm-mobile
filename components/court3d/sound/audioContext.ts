// The phone's Web Audio implementation (react-native-audio-api, Software
// Mansion). The web build resolves audioContext.web.ts instead.
import { AudioContext } from 'react-native-audio-api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createAudioContext = (): any => new AudioContext();
