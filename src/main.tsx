import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { totalDueCount } from './db/schema';
import './styles.css';

registerSW({ immediate: true });

// The service worker asks an already-open window to show a tapped notification's word.
navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type === 'navigate' && typeof e.data.path === 'string') location.hash = e.data.path.replace(/^#/, '');
});

// Keep the home screen badge showing the number of due cards.
async function updateBadge() {
  if (!('setAppBadge' in navigator)) return;
  try {
    const due = await totalDueCount();
    await (due > 0 ? navigator.setAppBadge(due) : navigator.clearAppBadge());
  } catch {
    // Not allowed without notification permission; ignore.
  }
}
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && updateBadge());

render(<App />, document.getElementById('app')!);
