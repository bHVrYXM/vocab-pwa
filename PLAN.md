# Vocab PWA — Plan

A flashcard PWA for learning languages. It runs on GitHub Pages, works offline, imports `.apkg` deck files and simple JSON/CSV decks (including decks generated with AI), and sends a daily push notification with a random word from a chosen vocabulary file.

Working name: **vocab-pwa** (easy to rename).

## Branding rule

No third-party flashcard brand names appear anywhere: UI text, code comments, identifiers, README or commit messages. `.apkg` is called a "deck package" or ".apkg file". Inside the zip, files are matched by pattern (for example `/^collection\.\w+$/`), not by brand-specific names.

---

## 1. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Build | Vite + TypeScript | Fast and simple; outputs static files for Pages |
| UI | Preact | Small (~4 KB), React-style components |
| PWA / service worker | `vite-plugin-pwa` with `injectManifest` | Precaching for offline use, plus our own code for `push` and `notificationclick` |
| Local storage | IndexedDB via Dexie | Used by both the app and the service worker |
| Spaced repetition | `ts-fsrs` | FSRS, a modern open scheduling algorithm |
| Zip | `fflate` | Small and fast unzip |
| SQLite | `sql.js` (WASM) | Reads the database inside `.apkg` files |
| zstd | `fzstd` | Newer `.apkg` exports compress their contents with zstd |
| Pronunciation | Web Speech API (`speechSynthesis`) | Works on iOS with no extra service |
| Push sending | `web-push` (Node) in GitHub Actions | VAPID-signed Web Push |

The heavy import libraries (`sql.js`, `fzstd`) are loaded only when an `.apkg` import starts, so the app itself loads quickly.

---

## 2. Data model (IndexedDB)

```ts
Deck        { id, name, sourceLang, targetLang, createdAt }   // langs as BCP-47, e.g. "es", "en"
Note        { id, deckId, front, back, example?, exampleTranslation?, audio?, tags[] }
Card        { id, noteId, direction: "forward" | "reverse", fsrs: FSRSCardState, due }
ReviewLog   { id, cardId, rating, reviewedAt, fsrsLogFields }
Media       { name, blob, mime }                               // audio/images from imports
Settings    { key, value }                                     // dailyWordDeckId, newPerDay, etc.
DailyWord   { deckId, remaining: noteId[] }                    // shuffled list of words not yet shown
```

- A Note is the word and its data. A Card is one direction of studying it. Reverse cards are optional per deck.
- Each new Note gets its own FSRS state. Scheduling history from `.apkg` files is not imported, so imported decks start fresh. This keeps the importer much simpler.

---

## 3. Import

### 3a. `.apkg` deck packages
1. Unzip with `fflate`.
2. Find the collection database. Use the newest variant present; if it's zstd-compressed, decompress it with `fzstd`.
3. Open it with `sql.js`. Read the note types and their field names: older files store them as JSON in the `col` table, newer files in their own tables.
4. Read the `notes` table. Fields are separated by `\x1f`.
5. Read the media map, which links numbered zip entries to real file names. Older files use JSON; newer files use zstd plus a small protobuf message, decoded with a minimal hand-written reader. Store the referenced media as Blobs.
6. Clean up fields: remove HTML, decode entities, and pull `[sound:file.mp3]` tags out into `audio`.
7. **Field mapping screen:** show the first 3 notes and let the user pick which field is Front, Back, Example and Audio. Pre-fill the choice from field names such as "Front", "Back", "Word" or "Translation".
8. Ask for the deck's languages, guessing from the deck name when possible. They're needed for pronunciation (TTS).

### 3b. JSON format (made for AI generation)
```json
{
  "format": "vocab-deck/1",
  "name": "Spanish – Food",
  "sourceLang": "es",
  "targetLang": "en",
  "cards": [
    {
      "front": "la manzana",
      "back": "the apple",
      "example": "Me como una manzana cada día.",
      "exampleTranslation": "I eat an apple every day.",
      "tags": ["food", "A1"]
    }
  ]
}
```
- Only `front` and `back` are required.
- The app includes a **"Copy AI prompt"** button. It copies a ready-made prompt that explains this format, so you can paste it into any AI chat and import the result.
- Errors are reported per card, for example "card 14: missing back". Valid cards are still imported.

### 3c. CSV / TSV
- Header row with `front,back,example,exampleTranslation,tags` (tags separated by `;`). The delimiter is detected automatically.
- If there's no header, column 1 is front and column 2 is back.

### Import flow
File picker (also reachable through the iOS Share sheet → Files) → detect format → preview → set field mapping and languages → import → summary ("212 words added, 3 skipped").

---

## 4. Studying

- **Deck list:** due count, new count and a "Study" button for each deck.
- **Review screen:** front → tap to reveal → back, example and pronunciation button → rating buttons *Again / Hard / Good / Easy*, each showing its next interval.
- **Settings per deck:** new cards per day (default 15), reverse cards on/off, auto-play pronunciation on/off, typed-answer mode (type the answer before revealing; differences are highlighted).
- **Pronunciation:** `speechSynthesis` with the deck's language. Bundled audio from imports is used when available.
- **Badge:** when the app closes, the icon badge is set to today's due count (`navigator.setAppBadge`).
- **Backup:** export everything (decks, progress, media) as one `.json`/zip file and import it again. This matters on iOS, where removing the app from the Home Screen deletes its data.

---

## 5. Daily word push

### How it works
```
GitHub Actions (hourly at :45) ──► script checks: is the target time due in the next hour?
        │ yes: wait until the target time, then send an EMPTY push (VAPID-signed)
        ▼
Apple Web Push service ──► iPhone ──► service worker 'push' event
        ▼
Service worker reads Settings.dailyWordDeckId from IndexedDB
        → takes the next word from the shuffled list (refilled once all words have been shown)
        → showNotification(title: "la manzana", body: "the apple")
        ▼
Tap → opens the app on that word (with pronunciation)
```

- **The server never sees any vocabulary.** Your chosen deck stays on the phone, and switching decks in the app takes effect with the next push.
- If no deck is selected, the notification says "Choose a vocabulary file for your daily word".
- The words come from a shuffled list, so none repeats until the whole deck has been shown.

### Time and time zone
`daily-word.config.json` in the repo:
```json
{ "time": "09:00", "timezone": "Europe/Berlin" }
```
- The workflow runs every hour at :45. Each run decides whether the target time falls within its window; if so, it waits until that exact minute and sends.
- This handles daylight saving time automatically, works with any minute (for example 08:30), and absorbs GitHub's usual scheduling delays.
- To change the time, edit this file (the GitHub web editor on your phone works).
- Cost: about 24 short runs a day plus one run of up to 15 minutes. That's free in public repos and fits the free minutes for private repos.

### One-time setup
1. Generate VAPID keys: `npx web-push generate-vapid-keys`.
   - The public key goes in the app config (it's public).
   - The private key goes in a repo secret: `VAPID_PRIVATE_KEY`.
2. Open the app on your iPhone → Share → **Add to Home Screen** → open it from the Home Screen.
3. In the app: Settings → Daily word → pick a deck → **Enable**. The app asks for notification permission and shows your subscription JSON with a Copy button.
4. Save that JSON as the repo secret `PUSH_SUBSCRIPTION`.
5. Run the workflow once manually (`workflow_dispatch`) to test it.

### Things to know
- **Inactivity:** GitHub turns off scheduled workflows in repos with no activity for 60 days. The workflow makes a small keep-alive commit about once a month to prevent this.
- **Expired subscription:** if Apple rejects the subscription (HTTP 404/410), the workflow fails on purpose and GitHub emails you. Re-enable the daily word in the app and update the secret.
- **Hosting:** GitHub Pages on a free account requires a public repo. That's fine here: all personal data stays on the phone, and the subscription is stored as a secret.

---

## 6. Repo layout

```
vocab-pwa/
├─ src/
│  ├─ main.tsx, app/            # UI: routes, screens, components
│  ├─ db/                       # Dexie schema, shared with the service worker
│  ├─ srs/                      # ts-fsrs wrapper, queue building
│  ├─ import/
│  │  ├─ apkg/                  # unzip, sqlite, zstd, media, protobuf reader
│  │  ├─ json.ts, csv.ts
│  │  └─ ai-prompt.ts           # text for the "Copy AI prompt" button
│  ├─ daily-word/               # subscribe UI, word-picking logic (shared with SW)
│  └─ sw.ts                     # precache + push + notificationclick
├─ public/                      # icons, manifest assets
├─ scripts/send-daily-word.mjs  # time-window check + web-push send
├─ daily-word.config.json
└─ .github/workflows/
   ├─ deploy.yml                # build → GitHub Pages
   └─ daily-word.yml            # hourly cron + manual trigger
```

---

## 7. Milestones

1. **Skeleton:** Vite + Preact + PWA setup, deploy to Pages, installable on iPhone, works offline.
2. **Core:** Dexie schema, JSON/CSV import, deck list, review screen with FSRS, TTS.
3. **Daily word:** VAPID setup, subscribe screen, service worker push handler, `daily-word.yml` + send script. Test on the real iPhone.
4. **`.apkg` import:** both database variants, media, field mapping screen. Test with several real decks.
5. **Polish:** typed-answer mode, reverse cards, badge, backup/restore, "Copy AI prompt", stats (streak, reviews per day).

Milestone 3 comes before 4 so the push setup (the part most likely to need iPhone-specific fixes) gets tested early.
