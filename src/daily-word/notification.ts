import { pickDailyWord } from './pick';

// Shared by the app and the service worker, so this module must not touch the DOM.

export interface NotificationSpec {
  title: string;
  options: NotificationOptions & { data: { path: string } };
}

export async function buildDailyWordNotification(): Promise<NotificationSpec> {
  const word = await pickDailyWord();
  if (!word) {
    return {
      title: 'Daily word',
      options: {
        body: 'Choose a vocabulary deck for your daily word.',
        tag: 'daily-word',
        data: { path: '#/settings' },
      },
    };
  }
  const { note } = word;
  const body = [note.back, note.example, note.exampleTranslation].filter(Boolean).join('\n');
  return {
    title: note.front,
    options: {
      body,
      tag: 'daily-word',
      data: { path: `#/word/${note.id}` },
    },
  };
}
