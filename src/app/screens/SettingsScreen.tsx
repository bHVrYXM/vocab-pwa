import { useEffect, useState } from 'preact/hooks';
import { db, getSetting, setSetting } from '../../db/schema';
import { buildDailyWordNotification } from '../../daily-word/notification';
import { currentSubscription, subscribe, unsubscribe } from '../../daily-word/subscribe';
import { exportBackup, restoreBackup, saveFile } from '../../lib/backup';
import { isIOS, isStandalone, pushSupported } from '../../lib/platform';
import { useLive } from '../../lib/useLive';
import { Header } from '../components/ui';

export function SettingsScreen() {
  return (
    <main>
      <Header title="Settings" back="#/" />
      <DailyWordSettings />
      <BackupSettings />
      <p class="muted center small">Vocab · data is stored only on this device</p>
    </main>
  );
}

function DailyWordSettings() {
  const decks = useLive(() => db.decks.orderBy('name').toArray(), []);
  const deckId = useLive(() => getSetting<number | null>('dailyWordDeckId', null), []);
  const [sub, setSub] = useState<PushSubscription | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    currentSubscription().then(setSub).catch(() => setSub(null));
  }, []);

  const needsInstall = isIOS && !isStandalone();
  const supported = pushSupported();
  const json = sub ? JSON.stringify(sub.toJSON()) : '';

  async function enable() {
    setError('');
    try {
      setSub(await subscribe());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function disable() {
    if (!confirm('Turn off the daily word on this device?')) return;
    await unsubscribe();
    setSub(null);
  }

  async function test() {
    setError('');
    try {
      const reg = await navigator.serviceWorker.ready;
      const spec = await buildDailyWordNotification();
      await reg.showNotification(spec.title, spec.options);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section class="panel">
      <h2>Daily word</h2>
      <p class="muted">Every day at the time set in the repo’s daily-word.config.json, you get a random word from this deck.</p>

      <label class="field">
        <span>Deck</span>
        <select
          value={deckId === null || deckId === undefined ? '' : String(deckId)}
          onChange={(e) => setSetting('dailyWordDeckId', e.currentTarget.value ? Number(e.currentTarget.value) : null)}
        >
          <option value="">None</option>
          {decks?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>

      {needsInstall ? (
        <div class="notice">
          Notifications on iPhone only work after installing: tap <strong>Share</strong> → <strong>Add to Home Screen</strong>, then open
          Vocab from the Home Screen.
        </div>
      ) : !supported ? (
        <div class="notice">This browser doesn’t support push notifications.</div>
      ) : sub === undefined ? null : sub === null ? (
        <button class="btn primary wide" onClick={enable}>
          Enable daily word
        </button>
      ) : (
        <>
          <p>
            <span class="pill ok">On</span> Notifications are enabled on this device.
          </p>
          <details class="setup">
            <summary>Push subscription (for the repo secret)</summary>
            <p class="muted">
              Save this as the <code>PUSH_SUBSCRIPTION</code> secret in your GitHub repo (Settings → Secrets and variables → Actions).
              You only need to do this again if you turn notifications off and on.
            </p>
            <pre class="code">{json}</pre>
            <button
              class="btn wide"
              onClick={async () => {
                await navigator.clipboard.writeText(json);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? 'Copied ✓' : 'Copy subscription'}
            </button>
          </details>
          <div class="row-buttons">
            <button class="btn" onClick={test}>
              Test now
            </button>
            <button class="btn danger" onClick={disable}>
              Turn off
            </button>
          </div>
        </>
      )}
      {error && <div class="notice error">{error}</div>}
    </section>
  );
}

function BackupSettings() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function doExport() {
    setBusy(true);
    try {
      await saveFile(await exportBackup());
    } finally {
      setBusy(false);
    }
  }

  async function doRestore(file: File) {
    if (!confirm('Replace ALL decks and progress on this device with the backup?')) return;
    setBusy(true);
    try {
      await restoreBackup(file);
      setMessage('Backup restored.');
    } catch (e) {
      setMessage(`Restore failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="panel">
      <h2>Backup</h2>
      <p class="muted">Your decks live only on this device. Removing the app from the Home Screen deletes them, so export now and then.</p>
      <div class="row-buttons">
        <button class="btn" disabled={busy} onClick={doExport}>
          Export backup
        </button>
        <label class={`btn ${busy ? 'disabled' : ''}`}>
          Restore…
          <input
            type="file"
            hidden
            accept=".json,application/json"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (f) doRestore(f);
            }}
          />
        </label>
      </div>
      {message && <p class="muted">{message}</p>}
    </section>
  );
}
