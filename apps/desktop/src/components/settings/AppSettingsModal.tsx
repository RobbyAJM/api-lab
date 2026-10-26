import React, { useState, useEffect } from 'react';
import {
  X,
  User as UserIcon,
  Palette,
  Server,
  Keyboard,
  Check,
  RefreshCw,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import {
  parseAvatar,
  formatAvatar,
  type DiceBearStyle,
  type AvatarOptions,
} from '../../utils/dicebear';
import { DiceBearPlayground } from './DiceBearPlayground';
import { THEMES } from '../../utils/theme';
import { getServerUrl, setServerUrl, testServerConnection } from '../../utils/serverConfig';
import { getAllShortcuts } from '../../utils/shortcuts';
import type { UserSummary } from '@api-lab/api-types';

export const AppSettingsModal: React.FC = () => {
  const {
    appSettingsOpen,
    setAppSettingsOpen,
    appSettingsTab,
    setAppSettingsTab,
    user,
    token,
    setAuth,
    workspaces,
    activeWorkspaceId,
    activeThemeId,
    setTheme,
  } = useAppStore();

  // Profile Form State
  const [name, setName] = useState('');
  const [style, setStyle] = useState<DiceBearStyle>('croodles-neutral');
  const [seed, setSeed] = useState('api-lab');
  const [avatarOptions, setAvatarOptions] = useState<AvatarOptions>({});

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // General Tab State
  const [serverUrlInput, setServerUrlInput] = useState('');
  const [testingConn, setTestingConn] = useState(false);
  const [connStatus, setConnStatus] = useState<{ ok: boolean; message: string } | null>(null);

  // Shortcuts Tab State
  const [shortcutSearch, setShortcutSearch] = useState('');

  useEffect(() => {
    if (appSettingsOpen && user) {
      setName(user.name || '');
      const parsed = parseAvatar(user.avatar);
      setStyle(parsed.style);
      setSeed(parsed.seed);
      setAvatarOptions(parsed.options);

      setProfileSuccess(false);
      setProfileError(null);
      setServerUrlInput(getServerUrl());
      setConnStatus(null);
    }
  }, [appSettingsOpen, user]);

  if (!appSettingsOpen) return null;

  const currentWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const previewAvatar = formatAvatar(style, seed, avatarOptions);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !user) return;
    setSavingProfile(true);
    setProfileError(null);
    setProfileSuccess(false);

    try {
      const updated = await apiRequest<UserSummary>('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim() || user.name,
          avatar: previewAvatar,
        }),
      });

      setAuth(token, updated, currentWorkspace);
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err: any) {
      setProfileError(err?.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveServerUrl = () => {
    setServerUrl(serverUrlInput);
    setConnStatus({ ok: true, message: 'Server URL saved. Reload to apply.' });
  };

  const handleTestConnection = async () => {
    setTestingConn(true);
    setConnStatus(null);
    try {
      const res = await testServerConnection(serverUrlInput);
      if (res.ok) {
        setConnStatus({ ok: true, message: 'Successfully connected to API Lab server.' });
      } else {
        setConnStatus({ ok: false, message: res.message || 'Server responded with an error.' });
      }
    } catch (err: any) {
      setConnStatus({ ok: false, message: err?.message || 'Connection failed.' });
    } finally {
      setTestingConn(false);
    }
  };

  const allShortcuts = getAllShortcuts();
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent || '');
  const filteredShortcuts = allShortcuts.filter(
    (s) =>
      s.description.toLowerCase().includes(shortcutSearch.toLowerCase()) ||
      s.keyLabel.toLowerCase().includes(shortcutSearch.toLowerCase()) ||
      s.macKeyLabel.toLowerCase().includes(shortcutSearch.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) setAppSettingsOpen(false);
      }}
    >
      <div className="flex h-[650px] w-[960px] max-w-[96vw] max-h-[92vh] rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Left Sidebar Tabs */}
        <div className="w-48 bg-zinc-900/60 border-r border-zinc-800/80 flex flex-col p-2 space-y-1 flex-shrink-0">
          <div className="px-3 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Settings
          </div>

          <button
            type="button"
            onClick={() => setAppSettingsTab('profile')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-xs font-medium transition ${
              appSettingsTab === 'profile'
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <UserIcon size={14} />
            <span>Profile & Avatar</span>
          </button>

          <button
            type="button"
            onClick={() => setAppSettingsTab('appearance')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-xs font-medium transition ${
              appSettingsTab === 'appearance'
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Palette size={14} />
            <span>Appearance</span>
          </button>

          <button
            type="button"
            onClick={() => setAppSettingsTab('general')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-xs font-medium transition ${
              appSettingsTab === 'general'
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Server size={14} />
            <span>Connection</span>
          </button>

          <button
            type="button"
            onClick={() => setAppSettingsTab('shortcuts')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-xs font-medium transition ${
              appSettingsTab === 'shortcuts'
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Keyboard size={14} />
            <span>Shortcuts</span>
          </button>
        </div>

        {/* Right Main Content */}
        <div className="flex-1 flex flex-col min-w-0 bg-zinc-950 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 flex-shrink-0">
            <h2 className="text-sm font-semibold text-zinc-100">
              {appSettingsTab === 'profile' && 'User Profile & DiceBear Playground'}
              {appSettingsTab === 'appearance' && 'Appearance & Themes'}
              {appSettingsTab === 'general' && 'Server Connection'}
              {appSettingsTab === 'shortcuts' && 'Keyboard Shortcuts'}
            </h2>
            <button
              type="button"
              onClick={() => setAppSettingsOpen(false)}
              className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition"
              title="Close (Esc)"
            >
              <X size={16} />
            </button>
          </div>

          {/* Tab Panel */}
          <div className="flex-1 overflow-y-auto p-6 min-h-0">
            {appSettingsTab === 'profile' && (
              <form onSubmit={handleSaveProfile} className="space-y-4">
                {/* Top Profile Summary Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-zinc-900/60 rounded border border-zinc-800">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-48 sm:w-64">
                      <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        placeholder="Your display name"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="hidden sm:block text-[11px] text-zinc-500 font-mono mt-4 truncate">
                      {user?.email}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 justify-end flex-shrink-0">
                    {profileError && <span className="text-xs text-red-400">{profileError}</span>}
                    {profileSuccess && (
                      <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                        <Check size={13} />
                        <span>Profile updated!</span>
                      </span>
                    )}

                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium transition disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Check size={13} />
                      <span>{savingProfile ? 'Saving...' : 'Save Profile & Avatar'}</span>
                    </button>
                  </div>
                </div>

                {/* Interactive DiceBear Playground */}
                <DiceBearPlayground
                  style={style}
                  seed={seed}
                  options={avatarOptions}
                  onChange={(newStyle, newSeed, newOptions) => {
                    setStyle(newStyle);
                    setSeed(newSeed);
                    setAvatarOptions(newOptions);
                  }}
                />
              </form>
            )}

            {/* Appearance & Themes Tab with verified swatch palette */}
            {appSettingsTab === 'appearance' && (
              <div className="space-y-4">
                <p className="text-xs text-zinc-400">
                  Select a color theme for the API Lab desktop interface.
                </p>

                <div className="space-y-3.5 max-h-[420px] overflow-y-auto pr-1">
                  {/* Dark Themes */}
                  <div>
                    <div className="px-1 pb-1 text-[10px] font-mono tracking-wider uppercase text-zinc-500 font-semibold border-b border-zinc-800/60 mb-2">
                      Dark Themes
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {THEMES.filter((t) => !t.isLight).map((theme) => {
                        const isSelected = theme.id === activeThemeId;
                        return (
                          <button
                            key={theme.id}
                            type="button"
                            onClick={() => setTheme(theme.id)}
                            className={`flex items-center justify-between p-2 rounded-md border text-left transition ${
                              isSelected
                                ? 'border-blue-500 bg-zinc-900 shadow-sm ring-1 ring-blue-500'
                                : 'border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900 hover:border-zinc-700'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className="w-5 h-5 rounded border border-zinc-700 flex items-center justify-center p-0.5 shadow-sm flex-shrink-0"
                                style={{ backgroundColor: theme.palette.neutral }}
                                title={`Background: ${theme.palette.neutral}`}
                              >
                                <div className="flex gap-0.5">
                                  <div
                                    className="w-1.5 h-1.5 rounded-full"
                                    style={{ backgroundColor: theme.palette.primary }}
                                  />
                                  <div
                                    className="w-1.5 h-1.5 rounded-full"
                                    style={{
                                      backgroundColor: theme.palette.accent ?? theme.palette.info,
                                    }}
                                  />
                                </div>
                              </div>
                              <div className="text-xs font-medium text-zinc-200 truncate">
                                {theme.name}
                              </div>
                            </div>
                            {isSelected && <Check size={14} className="text-blue-400 flex-shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Light Themes */}
                  <div className="pt-2">
                    <div className="px-1 pb-1 text-[10px] font-mono tracking-wider uppercase text-zinc-500 font-semibold border-b border-zinc-800/60 mb-2">
                      Light Themes
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {THEMES.filter((t) => t.isLight).map((theme) => {
                        const isSelected = theme.id === activeThemeId;
                        return (
                          <button
                            key={theme.id}
                            type="button"
                            onClick={() => setTheme(theme.id)}
                            className={`flex items-center justify-between p-2 rounded-md border text-left transition ${
                              isSelected
                                ? 'border-blue-500 bg-zinc-900 shadow-sm ring-1 ring-blue-500'
                                : 'border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900 hover:border-zinc-700'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className="w-5 h-5 rounded border border-zinc-700 flex items-center justify-center p-0.5 shadow-sm flex-shrink-0"
                                style={{ backgroundColor: theme.palette.neutral }}
                                title={`Background: ${theme.palette.neutral}`}
                              >
                                <div className="flex gap-0.5">
                                  <div
                                    className="w-1.5 h-1.5 rounded-full"
                                    style={{ backgroundColor: theme.palette.primary }}
                                  />
                                  <div
                                    className="w-1.5 h-1.5 rounded-full"
                                    style={{
                                      backgroundColor: theme.palette.accent ?? theme.palette.info,
                                    }}
                                  />
                                </div>
                              </div>
                              <div className="text-xs font-medium text-zinc-200 truncate">
                                {theme.name}
                              </div>
                            </div>
                            {isSelected && <Check size={14} className="text-blue-400 flex-shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {appSettingsTab === 'general' && (
              <div className="space-y-4 max-w-md">
                <p className="text-xs text-zinc-400">
                  Configure the backend server URL used for synchronization and API calls.
                </p>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">API Server URL</label>
                  <input
                    type="text"
                    value={serverUrlInput}
                    onChange={(e) => setServerUrlInput(e.target.value)}
                    placeholder="http://localhost:8080"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                {connStatus && (
                  <p
                    className={`text-xs flex items-center gap-1 ${
                      connStatus.ok ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {connStatus.ok ? <Check size={13} /> : <X size={13} />}
                    <span>{connStatus.message}</span>
                  </p>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testingConn}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={testingConn ? 'animate-spin' : ''} />
                    <span>{testingConn ? 'Testing...' : 'Test Connection'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveServerUrl}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium transition"
                  >
                    Save URL
                  </button>
                </div>
              </div>
            )}

            {appSettingsTab === 'shortcuts' && (
              <div className="space-y-3">
                <input
                  type="text"
                  value={shortcutSearch}
                  onChange={(e) => setShortcutSearch(e.target.value)}
                  placeholder="Filter shortcuts..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                />

                <div className="max-h-[360px] overflow-y-auto divide-y divide-zinc-800/50">
                  {filteredShortcuts.map((sc) => (
                    <div key={sc.id} className="py-2 px-1 flex items-center justify-between gap-4">
                      <span className="text-xs text-zinc-300">{sc.description}</span>
                      <kbd className="px-2 py-0.5 rounded bg-zinc-800 text-[11px] font-mono text-zinc-300 border border-zinc-700/60 shadow-xs">
                        {isMac ? sc.macKeyLabel : sc.keyLabel}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
