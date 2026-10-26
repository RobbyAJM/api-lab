import React, { useEffect, useState } from 'react';

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

async function invokeTauri(cmd: string, args?: Record<string, unknown>) {
  if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke(cmd, args);
    } catch {
      // Graceful fallback for non-Tauri web view
    }
  }
  return undefined;
}

export const WindowControls: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setIsMac(/Mac|iPhone|iPod|iPad/i.test(navigator.userAgent || ''));
    }

    let mounted = true;
    const checkMax = async () => {
      const res = await invokeTauri('is_window_maximized');
      if (mounted && typeof res === 'boolean') {
        setIsMaximized(res);
      }
    };
    checkMax();

    const handleResize = () => {
      checkMax();
    };
    window.addEventListener('resize', handleResize);
    return () => {
      mounted = false;
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  if (isMac) {
    return null;
  }

  return (
    <div className="flex items-center h-full select-none" data-tauri-no-drag>
      <button
        type="button"
        onClick={() => invokeTauri('minimize_window')}
        className="h-full px-3 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition inline-flex items-center justify-center"
        title="Minimize"
        aria-label="Minimize window"
      >
        <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
          <rect width="10" height="1" />
        </svg>
      </button>
      <button
        type="button"
        onClick={async () => {
          await invokeTauri('toggle_maximize_window');
          const max = await invokeTauri('is_window_maximized');
          if (typeof max === 'boolean') setIsMaximized(max);
        }}
        className="h-full px-3 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition inline-flex items-center justify-center"
        title={isMaximized ? 'Restore Down' : 'Maximize'}
        aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
      >
        {isMaximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="2.5" y="0.5" width="7" height="7" />
            <path d="M0.5 2.5V9.5H7.5" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="0.5" y="0.5" width="9" height="9" />
          </svg>
        )}
      </button>
      <button
        type="button"
        onClick={() => invokeTauri('close_window')}
        className="h-full px-3.5 text-zinc-400 hover:text-white hover:bg-red-600 transition inline-flex items-center justify-center"
        title="Close"
        aria-label="Close window"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
          <path d="M1 1L9 9M9 1L1 9" />
        </svg>
      </button>
    </div>
  );
};
