import { useHashPath } from '../lib/router';
import { DeckScreen } from './screens/DeckScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ImportScreen } from './screens/ImportScreen';
import { NoteScreen } from './screens/NoteScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { StudyScreen } from './screens/StudyScreen';
import { WordScreen } from './screens/WordScreen';

export function App() {
  const [screen, a, b, c] = useHashPath();
  const id = (s: string | undefined) => (s && /^\d+$/.test(s) ? Number(s) : undefined);

  switch (screen) {
    case 'deck':
      if (id(a) !== undefined && b === 'note') return <NoteScreen deckId={id(a)!} noteId={id(c)} key={`${a}-${c}`} />;
      if (id(a) !== undefined) return <DeckScreen deckId={id(a)!} key={a} />;
      break;
    case 'study':
      if (id(a) !== undefined) return <StudyScreen deckId={id(a)!} key={a} />;
      break;
    case 'word':
      if (id(a) !== undefined) return <WordScreen noteId={id(a)!} key={a} />;
      break;
    case 'import':
      return <ImportScreen deckId={id(a)} />;
    case 'settings':
      return <SettingsScreen />;
  }
  return <HomeScreen />;
}
