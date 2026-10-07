// Sends the daily-word push. Run by .github/workflows/daily-word.yml.
//
//   node scripts/send-daily-word.mjs --check  print whether this hourly run owns the configured time
//   node scripts/send-daily-word.mjs          wait for the configured time (or TARGET env, epoch ms), then send
//   node scripts/send-daily-word.mjs --now    send immediately
//
// Env: VAPID_PRIVATE_KEY, PUSH_SUBSCRIPTION (falls back to .secrets/ for local testing).
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { targetInWindow } from './daily-window.mjs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const config = JSON.parse(read('daily-word.config.json'));
const force = process.argv.includes('--now') || process.env.FORCE === 'true';

if (process.argv.includes('--check')) {
  const target = targetInWindow(Date.now(), config.time, config.timezone);
  console.log(target === null ? `Not this run's turn (daily word is at ${config.time} ${config.timezone}).` : `This run sends at ${new Date(target).toISOString()}.`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `target=${target ?? ''}\n`);
  process.exit(0);
}

if (!force) {
  const target = process.env.TARGET ? Number(process.env.TARGET) : targetInWindow(Date.now(), config.time, config.timezone);
  if (target === null) {
    console.log(`Not this run's turn (daily word is at ${config.time} ${config.timezone}).`);
    process.exit(0);
  }
  const wait = target - Date.now();
  if (wait > 0) {
    console.log(`Waiting ${Math.round(wait / 60000)} min until ${config.time} ${config.timezone}…`);
    await new Promise((r) => setTimeout(r, wait));
  }
}

const { default: webpush } = await import('web-push');

const publicKey = read('src/config.ts').match(/VAPID_PUBLIC_KEY\s*=\s*'([^']+)'/)?.[1];
const localSecret = (file) => (existsSync(new URL(`.secrets/${file}`, root)) ? read(`.secrets/${file}`) : undefined);
const privateKey = process.env.VAPID_PRIVATE_KEY || (localSecret('vapid.json') && JSON.parse(localSecret('vapid.json')).privateKey);
const subscriptionJson = process.env.PUSH_SUBSCRIPTION || localSecret('subscription.json');

if (!publicKey) throw new Error('VAPID_PUBLIC_KEY not found in src/config.ts');
if (!privateKey) throw new Error('Missing VAPID_PRIVATE_KEY secret');
if (!subscriptionJson) throw new Error('Missing PUSH_SUBSCRIPTION secret — copy it from the app: Settings → Daily word');

// Apple requires a contact; the repo URL works and avoids publishing an email address.
const subject =
  process.env.GITHUB_REPOSITORY ? `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${process.env.GITHUB_REPOSITORY}` : 'https://github.com';
webpush.setVapidDetails(subject, publicKey, privateKey);

try {
  // The payload is only a trigger; the app picks the word on the phone.
  const res = await webpush.sendNotification(JSON.parse(subscriptionJson), JSON.stringify({ type: 'daily-word' }), {
    TTL: 6 * 3600,
    urgency: 'high',
  });
  console.log(`Push sent (HTTP ${res.statusCode}).`);
} catch (err) {
  if (err.statusCode === 404 || err.statusCode === 410) {
    console.error(
      'The push subscription has expired. Open the app → Settings → Daily word → Turn off, enable it again, ' +
        'and update the PUSH_SUBSCRIPTION secret.',
    );
  } else {
    console.error(`Push failed: ${err.statusCode ?? ''} ${err.body ?? err.message}`);
  }
  process.exit(1);
}
