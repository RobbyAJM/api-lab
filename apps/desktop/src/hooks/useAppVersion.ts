import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBuildTimeAppVersion, resolveClientVersion } from '../utils/appVersion';
import { fetchServerVersion, getServerUrl, type ServerVersionInfo } from '../utils/serverConfig';

let cachedClientVersionPromise: Promise<string> | null = null;

function getCachedClientVersion(): Promise<string> {
  if (!cachedClientVersionPromise) {
    cachedClientVersionPromise = resolveClientVersion();
  }
  return cachedClientVersionPromise;
}

export function useClientVersion(): string {
  const [version, setVersion] = useState<string>(() => getBuildTimeAppVersion());

  useEffect(() => {
    let active = true;
    getCachedClientVersion().then((resolved) => {
      if (active && resolved) {
        setVersion(resolved);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return version;
}

export function useServerVersion(serverUrl?: string) {
  const targetUrl = serverUrl ?? getServerUrl();
  return useQuery<ServerVersionInfo | null>({
    queryKey: ['server-version', targetUrl],
    queryFn: () => fetchServerVersion(targetUrl),
    staleTime: 60_000,
    retry: false,
  });
}
