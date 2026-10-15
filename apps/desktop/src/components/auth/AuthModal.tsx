import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  apiRequest,
  getServerUrl,
  setServerUrl,
  resetServerUrl,
  testServerConnection,
  type ServerConnectionTestResult,
} from '../../api/client';
import type { AuthResponse } from '@api-lab/api-types';

export const AuthModal: React.FC = () => {
  const { authModalOpen, authModalTab, setAuth } = useAppStore();
  const [tab, setTab] = useState<'login' | 'register_invite' | 'register_bootstrap' | 'forgot' | 'reset'>(
    authModalTab === 'register' ? 'register_invite' : authModalTab
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [invitationToken, setInvitationToken] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Server address configuration state
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [currentServerUrl, setCurrentServerUrl] = useState(() => getServerUrl());
  const [serverUrlInput, setServerUrlInput] = useState(() => getServerUrl());
  const [testingServer, setTestingServer] = useState(false);
  const [testStatus, setTestStatus] = useState<ServerConnectionTestResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!authModalOpen) return null;

  async function handleTestServer() {
    setTestingServer(true);
    setTestStatus(null);
    try {
      const result = await testServerConnection(serverUrlInput);
      setTestStatus(result);
    } finally {
      setTestingServer(false);
    }
  }

  function handleSaveServerUrl() {
    const saved = setServerUrl(serverUrlInput);
    setCurrentServerUrl(saved);
    setServerUrlInput(saved);
    setShowServerSettings(false);
    setTestStatus(null);
    setError(null);
    setMessage(`Server address updated to ${saved}`);
    setTimeout(() => setMessage(null), 3000);
  }

  function handleResetServerUrl() {
    const def = resetServerUrl();
    setCurrentServerUrl(def);
    setServerUrlInput(def);
    setTestStatus(null);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setAuth(res.token, res.user, res.workspace);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<AuthResponse>('/invitations/accept', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          password,
          invitation_token: invitationToken.trim(),
        }),
      });
      setAuth(res.token, res.user, res.workspace);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterBootstrap(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          password,
          workspace_name: workspaceName.trim() || undefined,
        }),
      });
      setAuth(res.token, res.user, res.workspace);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setMessage(res.message);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken.trim(), new_password: newPassword }),
      });
      setMessage(res.message);
      setTimeout(() => setTab('login'), 1500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-6 text-zinc-100">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-5">
          <div className="flex items-center gap-2">
            <span className="h-6 w-6 rounded bg-primary flex items-center justify-center font-bold text-xs text-white">
              AL
            </span>
            <h2 className="font-semibold text-lg tracking-tight">API Lab</h2>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-zinc-400">Collaborative API Testing</span>
            <button
              type="button"
              onClick={() => {
                setShowServerSettings((prev) => !prev);
                setTestStatus(null);
              }}
              title="Server Settings"
              className={`p-1.5 rounded-lg border transition ${
                showServerSettings
                  ? 'bg-zinc-800 text-zinc-100 border-zinc-700 shadow-sm'
                  : 'bg-zinc-950/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border-zinc-800'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          </div>
        </div>

        {showServerSettings && (
          <div className="mb-5 p-3.5 bg-zinc-950 border border-zinc-800 rounded-lg shadow-inner">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-200">Server Configuration</span>
                <span className="text-[10px] text-zinc-400 font-mono px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 rounded">
                  REST & WS
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowServerSettings(false)}
                className="text-zinc-500 hover:text-zinc-300 text-xs px-1"
                title="Close settings"
              >
                ✕
              </button>
            </div>

            <p className="text-[11px] text-zinc-400 mb-3">
              Configure backend address for authentication, endpoints, and WebSocket sync.
            </p>

            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] text-zinc-300 mb-1 font-medium">Server Address</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={serverUrlInput}
                    onChange={(e) => {
                      setServerUrlInput(e.target.value);
                      setTestStatus(null);
                    }}
                    placeholder="http://localhost:8080"
                    className="flex-1 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-700"
                  />
                  <button
                    type="button"
                    disabled={testingServer}
                    onClick={handleTestServer}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-medium rounded text-zinc-200 transition"
                  >
                    {testingServer ? 'Testing...' : 'Test'}
                  </button>
                </div>
              </div>

              {testStatus && (
                <div
                  className={`p-2 rounded text-xs flex items-center gap-2 ${
                    testStatus.ok
                      ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-800/60'
                      : 'bg-red-950/50 text-red-300 border border-red-800/60'
                  }`}
                >
                  <span className="font-bold flex-shrink-0">{testStatus.ok ? '✓' : '⚠'}</span>
                  <span className="flex-1 text-[11px]">{testStatus.message}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleResetServerUrl}
                  className="text-[11px] text-zinc-400 hover:text-zinc-200 underline"
                >
                  Reset to Default
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowServerSettings(false)}
                    className="px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveServerUrl}
                    className="px-3 py-1 bg-primary hover:bg-primary-hover font-medium rounded text-xs text-white transition"
                  >
                    Save & Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-950/60 border border-red-800/80 rounded text-red-300 text-xs">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-4 p-3 bg-emerald-950/60 border border-emerald-800/80 rounded text-emerald-300 text-xs">
            {message}
          </div>
        )}

        {tab === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <h3 className="text-sm font-medium text-zinc-200">Sign in to your account</h3>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm focus:outline-none focus:border-zinc-700"
                placeholder="developer@example.com"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs text-zinc-400">Password</label>
                <button
                  type="button"
                  onClick={() => setTab('forgot')}
                  className="text-xs text-primary hover:underline"
                >
                  Forgot?
                </button>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm focus:outline-none focus:border-zinc-700"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-primary hover:bg-primary-hover font-medium rounded text-sm text-white transition disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <div className="pt-2 text-center text-xs text-zinc-400 space-y-1">
              <div>
                Have an invitation?{' '}
                <button
                  type="button"
                  onClick={() => setTab('register_invite')}
                  className="text-primary hover:underline"
                >
                  Accept Invitation
                </button>
              </div>
              <div>
                New workspace?{' '}
                <button
                  type="button"
                  onClick={() => setTab('register_bootstrap')}
                  className="text-primary hover:underline"
                >
                  Create Workspace
                </button>
              </div>
            </div>
          </form>
        )}

        {tab === 'register_invite' && (
          <form onSubmit={handleRegisterInvite} className="space-y-3">
            <h3 className="text-sm font-medium text-zinc-200">Join Workspace via Invitation</h3>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Invitation Token</label>
              <input
                type="text"
                required
                value={invitationToken}
                onChange={(e) => setInvitationToken(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-xs font-mono focus:outline-none focus:border-zinc-700"
                placeholder="paste 64-character token"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm focus:outline-none focus:border-zinc-700"
                placeholder="Alex Developer"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm focus:outline-none focus:border-zinc-700"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Password (min 8 chars)</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm focus:outline-none focus:border-zinc-700"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-primary hover:bg-primary-hover font-medium rounded text-sm text-white transition disabled:opacity-50"
            >
              {loading ? 'Joining...' : 'Accept & Register'}
            </button>
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setTab('login')}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}

        {tab === 'register_bootstrap' && (
          <form onSubmit={handleRegisterBootstrap} className="space-y-3">
            <h3 className="text-sm font-medium text-zinc-200">Create New Admin Account & Workspace</h3>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Workspace Name</label>
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm focus:outline-none focus:border-zinc-700"
                placeholder="Engineering Lab"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Admin Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm focus:outline-none focus:border-zinc-700"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Admin Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm focus:outline-none focus:border-zinc-700"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Password (min 8 chars)</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm focus:outline-none focus:border-zinc-700"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-primary hover:bg-primary-hover font-medium rounded text-sm text-white transition disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Account & Workspace'}
            </button>
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setTab('login')}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}

        {tab === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <h3 className="text-sm font-medium text-zinc-200">Reset Your Password</h3>
            <p className="text-xs text-zinc-400">
              Enter your email to receive a password reset token. In development, check server console output.
            </p>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm focus:outline-none focus:border-zinc-700"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-primary hover:bg-primary-hover font-medium rounded text-sm text-white transition disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Generate Reset Link'}
            </button>
            <div className="flex justify-between text-xs text-zinc-400 pt-2">
              <button type="button" onClick={() => setTab('reset')} className="text-primary hover:underline">
                Have a token?
              </button>
              <button type="button" onClick={() => setTab('login')} className="hover:text-zinc-200">
                Back to Sign In
              </button>
            </div>
          </form>
        )}

        {tab === 'reset' && (
          <form onSubmit={handleResetPassword} className="space-y-3">
            <h3 className="text-sm font-medium text-zinc-200">Enter Reset Token</h3>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Reset Token</label>
              <input
                type="text"
                required
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-xs font-mono focus:outline-none focus:border-zinc-700"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">New Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm focus:outline-none focus:border-zinc-700"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-primary hover:bg-primary-hover font-medium rounded text-sm text-white transition disabled:opacity-50"
            >
              {loading ? 'Resetting...' : 'Set New Password'}
            </button>
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setTab('login')}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}

        {/* Server Address Status & Quick Switch */}
        <div className="mt-5 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-1.5 truncate pr-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
            <span className="text-zinc-400 flex-shrink-0">Server:</span>
            <span className="font-mono text-zinc-300 truncate" title={currentServerUrl}>
              {currentServerUrl}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowServerSettings((prev) => !prev);
              setTestStatus(null);
            }}
            className="text-primary hover:text-primary-hover hover:underline text-xs flex-shrink-0 ml-auto font-medium"
          >
            {showServerSettings ? 'Close' : 'Change'}
          </button>
        </div>
      </div>
    </div>
  );
};
