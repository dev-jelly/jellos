/**
 * Agent Discovery Service
 * Integrates config parsing, PATH scanning, and priority rules
 */

import {
  loadProjectConfig,
  loadGlobalConfig,
  getEnabledAgents,
} from './config-parser';
import { scanPathForAgents } from './path-scanner';
import { getKnownAgent } from './known-agents';
import type {
  AgentMetadata,
  AgentConfigEntry,
} from '../../types/agent';
import { AgentSource, AGENT_SOURCE_PRIORITY } from '../../types/agent';

/**
 * Convert config entry to agent metadata
 */
function configToMetadata(
  config: AgentConfigEntry,
  source: AgentSource
): AgentMetadata {
  return {
    externalId: config.id,
    label: config.name,
    cmd: config.command,
    args: config.args || [],
    envMask: config.env ? Object.keys(config.env) : [],
    version: config.version,
    source,
    priority: AGENT_SOURCE_PRIORITY[source],
    config: config.config,
  };
}

/**
 * Discover agents from project config
 */
async function discoverProjectAgents(
  projectPath: string
): Promise<AgentMetadata[]> {
  const config = await loadProjectConfig(projectPath);
  const agents = getEnabledAgents(config);
  return agents.map((agent) =>
    configToMetadata(agent, AgentSource.PROJECT_CONFIG)
  );
}

/**
 * Discover agents from global config
 */
async function discoverGlobalAgents(): Promise<AgentMetadata[]> {
  const config = await loadGlobalConfig();
  const agents = getEnabledAgents(config);
  return agents.map((agent) =>
    configToMetadata(agent, AgentSource.GLOBAL_CONFIG)
  );
}

/**
 * Discover agents from PATH
 */
async function discoverAutoAgents(): Promise<AgentMetadata[]> {
  const foundAgents = await scanPathForAgents();

  return foundAgents.map(({ agent, path, command }) => ({
    externalId: agent.id,
    label: agent.name,
    cmd: command,
    args: [],
    envMask: agent.env || [],
    path,
    source: AgentSource.AUTO_DETECTED,
    priority: AGENT_SOURCE_PRIORITY[AgentSource.AUTO_DETECTED],
  }));
}

/**
 * Merge agents by priority
 * Higher priority agents override lower priority ones with the same externalId
 */
function mergeAgentsByPriority(agents: AgentMetadata[]): AgentMetadata[] {
  const agentMap = new Map<string, AgentMetadata>();

  for (const agent of agents) {
    const existing = agentMap.get(agent.externalId);

    // Keep the agent with higher priority
    if (!existing || agent.priority > existing.priority) {
      agentMap.set(agent.externalId, agent);
    }
  }

  return Array.from(agentMap.values()).sort((a, b) => {
    // Sort by priority (descending), then by label (ascending)
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    return a.label.localeCompare(b.label);
  });
}

/**
 * Discover all agents for a project
 * Applies priority rules: Project > Global > Auto
 */
export async function discoverAgents(
  projectPath?: string
): Promise<AgentMetadata[]> {
  const allAgents: AgentMetadata[] = [];

  // 1. Discover from project config (highest priority)
  if (projectPath) {
    const projectAgents = await discoverProjectAgents(projectPath);
    allAgents.push(...projectAgents);
  }

  // 2. Discover from global config
  const globalAgents = await discoverGlobalAgents();
  allAgents.push(...globalAgents);

  // 3. Auto-discover from PATH (lowest priority)
  const autoAgents = await discoverAutoAgents();
  allAgents.push(...autoAgents);

  // 4. Merge by priority (higher priority wins)
  return mergeAgentsByPriority(allAgents);
}

/**
 * Discover agents for a specific project (includes project-specific agents)
 */
export async function discoverProjectAgentsWithGlobal(
  projectPath: string
): Promise<{ local: AgentMetadata[]; global: AgentMetadata[] }> {
  const projectAgents = await discoverProjectAgents(projectPath);
  const globalAgents = await discoverGlobalAgents();
  const autoAgents = await discoverAutoAgents();

  // Merge global and auto agents (global takes priority over auto)
  const globalMerged = mergeAgentsByPriority([...globalAgents, ...autoAgents]);

  return {
    local: projectAgents,
    global: globalMerged,
  };
}

/**
 * Get specific agent by ID for a project
 */
export async function getAgentById(
  agentId: string,
  projectPath?: string
): Promise<AgentMetadata | null> {
  const agents = await discoverAgents(projectPath);
  return agents.find((agent) => agent.externalId === agentId) || null;
}
