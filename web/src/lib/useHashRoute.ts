import { useEffect, useState } from 'react';

export type Route = { page: 'overview' } | { page: 'printer'; id: string } | { page: 'settings' };

function parse(hash: string): Route {
  const path = hash.replace(/^#/, '');
  const printer = /^\/printer\/([^/]+)$/.exec(path);
  if (printer) return { page: 'printer', id: decodeURIComponent(printer[1]) };
  if (path === '/settings') return { page: 'settings' };
  return { page: 'overview' };
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export const href = {
  overview: '#/',
  printer: (id: string) => `#/printer/${encodeURIComponent(id)}`,
  settings: '#/settings',
};
