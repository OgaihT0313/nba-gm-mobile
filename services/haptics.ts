// Q11: a buzz in the big moments -- the end of a game you watched, a trade that
// went through, a title. expo-haptics (Expo SDK 57): the Taptic Engine on iOS,
// the vibrator on Android, the Web Vibration API in the browser, where support
// is patchy. Never awaited and never allowed to throw: a phone that can't
// vibrate (Low Power Mode, no hardware, a desktop browser) just stays still.
import * as Haptics from 'expo-haptics';

const quiet = (p: Promise<void>) => { p.catch(() => undefined); };

/** A win, a trade done, a title. */
export const buzzSuccess = (): void => {
  try { quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)); } catch { /* no haptics here */ }
};

/** A loss in a game you watched. */
export const buzzSoft = (): void => {
  try { quiet(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)); } catch { /* no haptics here */ }
};
