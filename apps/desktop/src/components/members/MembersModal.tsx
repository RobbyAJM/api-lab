import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import type {
  InvitationResponse,
  MemberResponse,
  Role,
} from '@api-lab/api-types';
import { X, UserPlus, Trash2, Copy, Check } from 'lucide-react';

export const MembersModal: React.FC = () => {
  const queryClient = useQueryClient();
  const {
    membersModalOpen,
    setMembersModalOpen,
    activeWorkspaceId,
    activeWorkspaceRole,
  } = useAppStore();

  const isAdmin = activeWorkspaceRole === 'admin';

  // State for invitation creation
  const [inviteRole, setInviteRole] = useState<Role>('developer');
  const [copiedToken, setCopiedToken] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch members
  const { data: members = [] } = useQuery<MemberResponse[]>({
    queryKey: ['members', activeWorkspaceId],
    queryFn: () =>
      activeWorkspaceId
        ? apiRequest(`/workspaces/${activeWorkspaceId}/members`)
        : Promise.resolve([]),
    enabled: !!activeWorkspaceId && membersModalOpen,
  });

  // Fetch pending invitations (Admin only)
  const { data: invitations = [] } = useQuery<InvitationResponse[]>({
    queryKey: ['invitations', activeWorkspaceId],
    queryFn: () =>
      activeWorkspaceId && isAdmin
        ? apiRequest(`/workspaces/${activeWorkspaceId}/invitations`)
        : Promise.resolve([]),
    enabled: !!activeWorkspaceId && membersModalOpen && isAdmin,
  });

  // Update member role
  const updateRoleMutation = useMutation({
    mutationFn: (payload: { memberId: string; role: Role }) =>
      apiRequest(`/workspaces/${activeWorkspaceId}/members/${payload.memberId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: payload.role }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', activeWorkspaceId] });
    },
    onError: (err: any) => setErrorMsg(err.message),
  });

  // Remove member
  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) =>
      apiRequest(`/workspaces/${activeWorkspaceId}/members/${memberId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', activeWorkspaceId] });
    },
    onError: (err: any) => setErrorMsg(err.message),
  });

  // Generate invitation
  const inviteMutation = useMutation({
    mutationFn: () =>
      apiRequest<InvitationResponse>(`/workspaces/${activeWorkspaceId}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ role: inviteRole, expires_in_days: 7 }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['invitations', activeWorkspaceId] });
      if (data.token) {
        setGeneratedToken(data.token);
      }
    },
    onError: (err: any) => setErrorMsg(err.message),
  });

  // Revoke invitation
  const revokeInviteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/workspaces/${activeWorkspaceId}/invitations/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations', activeWorkspaceId] });
    },
    onError: (err: any) => setErrorMsg(err.message),
  });

  if (!membersModalOpen) return null;

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl flex flex-col max-h-[600px] text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div>
            <h2 className="font-semibold text-base">Workspace Members & RBAC</h2>
            <p className="text-xs text-zinc-400">
              Role permissions: Admins manage members and invites. Developers execute requests and edit collections.
            </p>
          </div>
          <button
            onClick={() => setMembersModalOpen(false)}
            className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200"
          >
            <X size={16} />
          </button>
        </div>

        {errorMsg && (
          <div className="mx-4 mt-3 p-2.5 bg-red-950/60 border border-red-800 rounded text-red-300 text-xs">
            {errorMsg}
          </div>
        )}

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Admin Invite Generator */}
          {isAdmin && (
            <div className="p-3 bg-zinc-950/70 border border-zinc-800 rounded-lg space-y-2.5">
              <span className="text-xs font-semibold text-indigo-400 flex items-center gap-1.5">
                <UserPlus size={14} /> Invite New Member
              </span>
              <div className="flex items-center gap-2">
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as Role)}
                  className="bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="developer">Role: Developer</option>
                  <option value="admin">Role: Admin</option>
                </select>
                <button
                  onClick={() => inviteMutation.mutate()}
                  disabled={inviteMutation.isPending}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded text-xs transition"
                >
                  {inviteMutation.isPending ? 'Generating...' : 'Generate Invite Link'}
                </button>
              </div>

              {generatedToken && (
                <div className="mt-2 p-2.5 bg-zinc-900 border border-indigo-900/60 rounded text-xs space-y-1">
                  <div className="text-zinc-400 font-medium">Shareable Invitation Token:</div>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={generatedToken}
                      className="flex-1 bg-zinc-950 border border-zinc-800 px-2 py-1 rounded font-mono text-[11px] text-zinc-200 select-all"
                    />
                    <button
                      onClick={() => copyToClipboard(generatedToken)}
                      className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded flex items-center gap-1 text-xs"
                    >
                      {copiedToken ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      <span>{copiedToken ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Members List */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-zinc-300">Active Members ({members.length})</span>
            <div className="space-y-1.5">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-2.5 bg-zinc-950/40 border border-zinc-800/80 rounded text-xs"
                >
                  <div>
                    <div className="font-medium text-zinc-200">{m.name}</div>
                    <div className="text-[11px] text-zinc-500">{m.email}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isAdmin ? (
                      <select
                        value={m.role}
                        onChange={(e) =>
                          updateRoleMutation.mutate({
                            memberId: m.id,
                            role: e.target.value as Role,
                          })
                        }
                        className="bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="developer">Developer</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-medium uppercase text-[10px]">
                        {m.role}
                      </span>
                    )}

                    {isAdmin && (
                      <button
                        onClick={() => removeMemberMutation.mutate(m.id)}
                        title="Remove member from workspace"
                        className="text-zinc-500 hover:text-red-400 p-1"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pending Invitations */}
          {isAdmin && invitations.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-zinc-800">
              <span className="text-xs font-semibold text-zinc-400">
                Pending Invitations ({invitations.length})
              </span>
              <div className="space-y-1">
                {invitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between p-2 bg-zinc-950/30 border border-zinc-800/60 rounded text-xs"
                  >
                    <div>
                      <span className="font-medium text-zinc-300 uppercase text-[10px] px-1.5 py-0.5 bg-zinc-800 rounded">
                        {inv.role}
                      </span>
                      <span className="text-[11px] text-zinc-500 ml-2">
                        Expires {new Date(inv.expires_at).toLocaleDateString()}
                      </span>
                    </div>
                    <button
                      onClick={() => revokeInviteMutation.mutate(inv.id)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
