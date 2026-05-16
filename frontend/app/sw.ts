/**
 * Service worker (Serwist).
 *
 * Strategy:
 * - App shell + static assets: precached.
 * - `/api/*` GETs: not handled here (they go to the cross-origin backend).
 * - Navigation requests: NetworkFirst with offline fallback to the app shell.
 *
 * IMPORTANT: we intentionally do NOT cache anything from the backend in the SW
 * because mail content is sensitive and IndexedDB is already our offline store.
 */
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
