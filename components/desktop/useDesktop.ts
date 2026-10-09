import { Platform, useWindowDimensions } from 'react-native';

// The PC layout (design_handoff_nba_manager_pc) is drawn at 1440×900. It only
// kicks in on the web build and only on a window wide enough to hold the 232px
// sidebar plus a two-column page — a phone browser, a narrow window and the APK
// all keep the mobile layout untouched.
export const DESKTOP_MIN_WIDTH = 1100;

export const useDesktop = (): boolean => {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH;
};
