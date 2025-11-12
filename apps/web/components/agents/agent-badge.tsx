'use client';

import type { CodeAgentRuntime } from '@/lib/api';
import { useState } from 'react';
import {
  CommandLineIcon,
  CodeBracketIcon,
  CpuChipIcon,
  GlobeAltIcon,
} from '@heroicons/react/20/solid';

interface AgentBadgeProps {
  agent: CodeAgentRuntime;
  isGlobal: boolean;
}

/**
 * Agent type colors and icons
 * Based on agent externalId or cmd patterns
 */
function getAgentStyle(agent: CodeAgentRuntime): {
  color: string;
  Icon: typeof CommandLineIcon;
} {
  const id = agent.externalId.toLowerCase();
  const cmd = agent.cmd.toLowerCase();

  // Claude Code agents
  if (id.includes('claude') || cmd.includes('claude')) {
    return {
      color: 'bg-purple-100 text-purple-700 border-purple-300',
      Icon: CommandLineIcon,
    };
  }

  // Browser/DevTools agents
  if (
    id.includes('chrome') ||
    id.includes('playwright') ||
    id.includes('browser')
  ) {
    return {
      color: 'bg-blue-100 text-blue-700 border-blue-300',
      Icon: GlobeAltIcon,
    };
  }

  // Code analysis/language servers
  if (
    id.includes('serena') ||
    id.includes('lsp') ||
    id.includes('language')
  ) {
    return {
      color: 'bg-green-100 text-green-700 border-green-300',
      Icon: CodeBracketIcon,
    };
  }

  // AI/ML agents
  if (
    id.includes('tavily') ||
    id.includes('context7') ||
    id.includes('magic')
  ) {
    return {
      color: 'bg-amber-100 text-amber-700 border-amber-300',
      Icon: CpuChipIcon,
    };
  }

  // Default
  return {
    color: 'bg-gray-100 text-gray-700 border-gray-300',
    Icon: CommandLineIcon,
  };
}

/**
 * Format health status for display
 */
function formatHealthStatus(status: string): {
  text: string;
  color: string;
} {
  switch (status.toLowerCase()) {
    case 'healthy':
    case 'online':
      return { text: 'Healthy', color: 'text-green-600' };
    case 'degraded':
    case 'warning':
      return { text: 'Degraded', color: 'text-yellow-600' };
    case 'unhealthy':
    case 'offline':
    case 'error':
      return { text: 'Unhealthy', color: 'text-red-600' };
    default:
      return { text: 'Unknown', color: 'text-gray-600' };
  }
}

/**
 * Individual agent badge component with tooltip
 */
export function AgentBadge({ agent, isGlobal }: AgentBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const { color, Icon } = getAgentStyle(agent);
  const health = formatHealthStatus(agent.healthStatus);

  return (
    <div className="relative inline-block">
      <button
        className={`
          inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium
          border transition-all hover:scale-105
          ${color}
          ${!agent.enabled ? 'opacity-50' : ''}
        `}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        aria-label={`${agent.label} agent`}
      >
        <Icon className="w-3 h-3" />
        <span className="truncate max-w-[80px]">{agent.label}</span>
        {isGlobal && (
          <span className="text-[10px] opacity-70" title="Global agent">
            ●
          </span>
        )}
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute z-50 top-full mt-1 left-0 w-64 p-3 bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="space-y-2">
            <div>
              <div className="font-semibold text-sm text-gray-900">
                {agent.label}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {isGlobal ? 'Global Agent' : 'Project-Specific Agent'}
              </div>
            </div>

            <div className="text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Status:</span>
                <span className={`font-medium ${health.color}`}>
                  {health.text}
                </span>
              </div>

              {agent.version && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Version:</span>
                  <span className="text-gray-900 font-mono">
                    {agent.version}
                  </span>
                </div>
              )}

              {agent.enabled !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Enabled:</span>
                  <span
                    className={`font-medium ${
                      agent.enabled ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {agent.enabled ? 'Yes' : 'No'}
                  </span>
                </div>
              )}

              {agent.lastChecked && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Last checked:</span>
                  <span className="text-gray-900">
                    {new Date(agent.lastChecked).toLocaleTimeString()}
                  </span>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-gray-100">
              <div className="text-[11px] text-gray-500 break-all">
                <span className="font-medium">Command:</span> {agent.cmd}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
