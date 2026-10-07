import { useEffect, useState } from 'preact/hooks';

export function useHashPath(): string[] {
  const read = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [path, setPath] = useState(read);
  useEffect(() => {
    const onChange = () => {
      setPath(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return path;
}

export const go = (path: string) => {
  location.hash = path.startsWith('#') ? path : `#/${path.replace(/^\//, '')}`;
};
