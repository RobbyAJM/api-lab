import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!authModalOpen) return null;

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
            <span className="h-6 w-6 rounded bg-indigo-600 flex items-center justify-center font-bold text-xs">
              AL
            </span>
            <h2 className="font-semibold text-lg tracking-tight">API Lab</h2>
          </div>
          <span className="text-xs text-zinc-400">Collaborative API Testing</span>
        </div>

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
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm focus:outline-none focus:border-indigo-500"
                placeholder="developer@example.com"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs text-zinc-400">Password</label>
                <button
                  type="button"
                  onClick={() => setTab('forgot')}
                  className="text-xs text-indigo-400 hover:underline"
                >
                  Forgot?
                </button>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm focus:outline-none focus:border-indigo-500"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 font-medium rounded text-sm text-white transition disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <div className="pt-2 text-center text-xs text-zinc-400 space-y-1">
              <div>
                Have an invitation?{' '}
                <button
                  type="button"
                  onClick={() => setTab('register_invite')}
                  className="text-indigo-400 hover:underline"
                >
                  Accept Invitation
                </button>
              </div>
              <div>
                New workspace?{' '}
                <button
                  type="button"
                  onClick={() => setTab('register_bootstrap')}
                  className="text-indigo-400 hover:underline"
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
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-xs font-mono focus:outline-none focus:border-indigo-500"
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
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm focus:outline-none focus:border-indigo-500"
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
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm focus:outline-none focus:border-indigo-500"
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
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 font-medium rounded text-sm text-white transition disabled:opacity-50"
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
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm focus:outline-none focus:border-indigo-500"
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
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Admin Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm focus:outline-none focus:border-indigo-500"
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
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 font-medium rounded text-sm text-white transition disabled:opacity-50"
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
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 font-medium rounded text-sm text-white transition disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Generate Reset Link'}
            </button>
            <div className="flex justify-between text-xs text-zinc-400 pt-2">
              <button type="button" onClick={() => setTab('reset')} className="text-indigo-400 hover:underline">
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
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-xs font-mono focus:outline-none focus:border-indigo-500"
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
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 font-medium rounded text-sm text-white transition disabled:opacity-50"
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
      </div>
    </div>
  );
};
