/**
 * A light tactile tap to confirm an action landed — a logged entry, money
 * moved. Uses the Vibration API where it exists (Android Chrome); a silent
 * no-op everywhere else (iOS Safari, desktop), so it's safe to call anywhere.
 */
export function haptic(pattern: number | number[] = 10): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Some browsers throw if vibration is disallowed; ignore it.
    }
  }
}
