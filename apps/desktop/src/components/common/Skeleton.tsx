import React from 'react';

// ponytail: custom shimmer animation skipped; pulse covers loading state. Add when design demands gradient sweep.
export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', ...props }) => {
  return (
    <div
      className={`animate-pulse bg-zinc-800/70 rounded-[3px] ${className}`}
      {...props}
    />
  );
};
