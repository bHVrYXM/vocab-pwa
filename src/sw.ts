/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { totalDueCount } from './db/schema';
import { buildDailyWordNotification } from './daily-word/notification';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

self.skipWaiting();
clientsClaim();

self.addEventListener('push', (event) => {
  // iOS revokes push permission if a push doesn't show a notification, so always show one.
  event.waitUntil(
    (async () => {
      let spec;
      try {
        spec = await buildDailyWordNotification();
      } catch (err) {
        console.error('Daily word failed', err);
        spec = { title: 'Daily word', options: { body: 'Open the app to see today’s word.', tag: 'daily-word', data: { path: '' } } };
      }
      await self.registration.showNotification(spec.title, spec.options);
      try {
        const due = await totalDueCount();
        if ('setAppBadge' in self.navigator) {
          await (due > 0 ? self.navigator.setAppBadge(due) : self.navigator.clearAppBadge());
        }
      } catch {
        // Badging is optional.
      }
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data as { path?: string } | null)?.path ?? '';
  const url = new URL(path, self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows[0];
      if (existing) {
        await existing.focus();
        existing.postMessage({ type: 'navigate', path });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
