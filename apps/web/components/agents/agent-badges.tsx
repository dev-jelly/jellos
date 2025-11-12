'use client';

import type { CodeAgentRuntime } from '@/lib/api';
import { AgentBadge } from './agent-badge';

interface AgentBadgesProps {
  agents: CodeAgentRuntime[];
  projectId: string;
}

/**
 * Component to display all agents for a project
 * Groups global agents and project-specific agents separately
 */
export function AgentBadges({ agents, projectId }: AgentBadgesProps) {
  if (!agents || agents.length === 0) {
    return (
      <div className="text-xs text-gray-400 italic">No agents configured</div>
    );
  }

  // Separate global and local agents
  const globalAgents = agents.filter((agent) => agent.projectId === null);
  const localAgents = agents.filter((agent) => agent.projectId === projectId);

  // Further separate by enabled status
  const enabledGlobal = globalAgents.filter((a) => a.enabled);
  const enabledLocal = localAgents.filter((a) => a.enabled);
  const disabledAgents = agents.filter((a) => !a.enabled);

  return (
    <div className="space-y-3">
      {/* Active Agents Section */}
      {(enabledGlobal.length > 0 || enabledLocal.length > 0) && (
        <div>
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            Active Agents
          </div>

          <div className="space-y-2">
            {/* Global Agents */}
            {enabledGlobal.length > 0 && (
              <div>
                <div className="text-[10px] text-gray-400 mb-1">
                  Global ({enabledGlobal.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {enabledGlobal.map((agent) => (
                    <AgentBadge
                      key={agent.id}
                      agent={agent}
                      isGlobal={true}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Local Agents */}
            {enabledLocal.length > 0 && (
              <div>
                <div className="text-[10px] text-gray-400 mb-1">
                  Project-Specific ({enabledLocal.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {enabledLocal.map((agent) => (
                    <AgentBadge
                      key={agent.id}
                      agent={agent}
                      isGlobal={false}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Disabled Agents Section (Read-only) */}
      {disabledAgents.length > 0 && (
        <div className="pt-2 border-t border-gray-200">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            Disabled ({disabledAgents.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {disabledAgents.map((agent) => (
              <AgentBadge
                key={agent.id}
                agent={agent}
                isGlobal={agent.projectId === null}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
