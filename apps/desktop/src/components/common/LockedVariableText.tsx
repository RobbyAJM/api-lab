import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import {
  tokenizeVariables,
  getVariableTokenClassName,
  type VariableSource,
} from '../../utils/variableHighlight';
import {
  createHoverTimerController,
  type BoundingBox,
} from '../../utils/variableHover';
import { VariableHoverCard } from './VariableHoverCard';
import type { Environment, VariableResponse } from '@api-lab/api-types';

interface LockedVariableTextProps {
  value: string;
  variables?: VariableSource;
  className?: string;
}

/**
 * Read-only inline text renderer that highlights {{VAR}} tokens against the active
 * environment and reveals the interactive VariableHoverCard on hover.
 */
export const LockedVariableText: React.FC<LockedVariableTextProps> = ({
  value,
  variables,
  className = '',
}) => {
  const hoverTimer = useRef(createHoverTimerController()).current;
  const { activeWorkspaceId, activeEnvironmentId } = useAppStore();
  const [hoverState, setHoverState] = useState<{
    varName: string;
    rect: BoundingBox;
  } | null>(null);

  const { data: envVars = [] } = useQuery<VariableResponse[]>({
    queryKey: ['variables', activeEnvironmentId],
    queryFn: () =>
      activeEnvironmentId
        ? apiRequest<VariableResponse[]>(`/environments/${activeEnvironmentId}/variables`)
        : Promise.resolve([]),
    enabled: !!activeEnvironmentId,
  });

  const { data: environments = [] } = useQuery<Environment[]>({
    queryKey: ['environments', activeWorkspaceId],
    queryFn: () =>
      activeWorkspaceId
        ? apiRequest<Environment[]>(`/workspaces/${activeWorkspaceId}/environments`)
        : Promise.resolve([]),
    enabled: !!activeWorkspaceId,
  });

  const activeEnv = environments.find((e) => e.id === activeEnvironmentId);
  const effectiveVars = variables !== undefined ? variables : envVars;

  function scheduleClear() {
    hoverTimer.schedule(() => {
      setHoverState(null);
    }, 300);
  }

  function cancelClear() {
    hoverTimer.cancel();
  }

  useEffect(() => {
    return () => {
      hoverTimer.cancel();
    };
  }, [hoverTimer]);

  const tokens = tokenizeVariables(value, effectiveVars);

  return (
    <>
      <span className={`select-all ${className}`}>
        {tokens.map((token, idx) => {
          if (!token.isVariable || !token.name) {
            return <React.Fragment key={idx}>{token.text}</React.Fragment>;
          }

          return (
            <span
              key={idx}
              data-var-name={token.name}
              title=""
              onMouseEnter={(e) => {
                cancelClear();
                const rect = e.currentTarget.getBoundingClientRect();
                setHoverState({
                  varName: token.name!,
                  rect: {
                    left: rect.left,
                    top: rect.top,
                    right: rect.right,
                    bottom: rect.bottom,
                    width: rect.width,
                    height: rect.height,
                  },
                });
              }}
              onMouseLeave={scheduleClear}
              className={`${getVariableTokenClassName(token.isDefined ?? false, false)} cursor-pointer`}
            >
              {token.text}
            </span>
          );
        })}
      </span>

      {hoverState && (
        <VariableHoverCard
          varName={hoverState.varName}
          rect={hoverState.rect}
          variables={envVars.length > 0 ? envVars : effectiveVars}
          activeEnv={activeEnv}
          onClose={() => setHoverState(null)}
          onMouseEnter={cancelClear}
          onMouseLeave={scheduleClear}
        />
      )}
    </>
  );
};
