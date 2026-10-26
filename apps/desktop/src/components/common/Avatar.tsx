import React, { useState } from 'react';
import { getDiceBearUrl } from '../../utils/dicebear';

interface AvatarProps {
  avatar?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
  showPresenceIndicator?: boolean;
  isOnline?: boolean;
}

export const Avatar: React.FC<AvatarProps> = ({
  avatar,
  name,
  size = 24,
  className = '',
  showPresenceIndicator = false,
  isOnline = false,
}) => {
  const [imgError, setImgError] = useState(false);
  const avatarUrl = getDiceBearUrl(avatar || 'bottts:api-lab');
  const initial = (name?.trim()?.[0] || 'U').toUpperCase();

  return (
    <div
      className={`relative inline-flex items-center justify-center flex-shrink-0 select-none ${className}`}
      style={{ width: size, height: size }}
    >
      {!imgError ? (
        <img
          src={avatarUrl}
          alt={name ? `${name}'s avatar` : 'User avatar'}
          onError={() => setImgError(true)}
          className="w-full h-full rounded-full object-cover bg-zinc-800 border border-zinc-700/60"
          loading="lazy"
        />
      ) : (
        <div
          className="w-full h-full rounded-full bg-zinc-800 border border-zinc-700/60 flex items-center justify-center font-mono font-bold text-zinc-300"
          style={{ fontSize: Math.max(9, Math.floor(size * 0.42)) }}
        >
          {initial}
        </div>
      )}

      {showPresenceIndicator && (
        <span
          className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-zinc-950 ${
            isOnline ? 'bg-emerald-500' : 'bg-zinc-500'
          }`}
          title={isOnline ? 'Online' : 'Offline'}
        />
      )}
    </div>
  );
};
