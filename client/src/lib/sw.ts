import { registerSW } from "virtual:pwa-register";

/** Fired when a new build has been fetched and is waiting to take over. */
export const SW_UPDATE_EVENT = "fintrackr:sw-update";

let applyUpdateFn: ((reloadPage?: boolean) => Promise<void>) | undefined;

export function initSW() {
  applyUpdateFn = registerSW({
    immediate: true,
    onNeedRefresh: () => window.dispatchEvent(new Event(SW_UPDATE_EVENT)),
  });
}

export function applyUpdate() {
  void applyUpdateFn?.(true);
}
