'use client';

import { useState, useEffect, useRef } from 'react';
import { buildLink } from '@/lib/url-template';
import { Toast } from '@/components/ui/toast';

// Provider icons
const providerIcons = {
  github: (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  ),
  linear: (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M2.5 21.5L21.5 2.5M2.5 2.5L21.5 21.5L2.5 2.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  jenkins: (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  githubActions: (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18L19.82 8 12 11.82 4.18 8 12 4.18zM4 9.82l7 3.5v7.36l-7-3.5V9.82zm16 0v7.36l-7 3.5v-7.36l7-3.5z" />
    </svg>
  ),
  deployment: (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
    </svg>
  ),
  external: (
    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
      <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
      <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
    </svg>
  ),
};

export interface LinkTemplate {
  baseUrl?: string;
  prTemplate?: string;
  commitTemplate?: string;
  fileTemplate?: string;
  blameTemplate?: string;
  diffTemplate?: string;
  issueTemplate?: string;
  workspaceUrl?: string;
  pipelineTemplate?: string;
  jobTemplate?: string;
  deploymentTemplate?: string;
}

export interface LinksConfig {
  github?: LinkTemplate;
  linear?: LinkTemplate;
  jenkins?: LinkTemplate;
  githubActions?: LinkTemplate;
  deployment?: LinkTemplate;
}

export interface ExternalLinksProps {
  projectId: string;
  entityType: 'issue' | 'pr' | 'worktree';
  entityData: Record<string, string>;
  className?: string;
}

interface LinkItem {
  provider: string;
  label: string;
  url: string;
  isValid: boolean;
  icon: React.ReactNode;
}

interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
}

/**
 * ExternalLinks component
 * Displays external tool links for issues, PRs, and worktrees
 */
export function ExternalLinks({
  projectId,
  entityType,
  entityData,
  className = ''
}: ExternalLinksProps) {
  const [linksConfig, setLinksConfig] = useState<LinksConfig | null>(null);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusedLinkIndex, setFocusedLinkIndex] = useState<number>(-1);

  // Fetch links configuration from API
  useEffect(() => {
    async function fetchLinksConfig() {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
        const response = await fetch(`${apiUrl}/projects/${projectId}/links`);
        if (response.ok) {
          const config = await response.json();
          setLinksConfig(config);
        }
      } catch (error) {
        console.error('Failed to fetch links config:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchLinksConfig();
  }, [projectId]);

  // Build links when config or entity data changes
  useEffect(() => {
    if (!linksConfig) {
      setLinks([]);
      return;
    }

    const builtLinks: LinkItem[] = [];

    // GitHub links
    if (linksConfig.github) {
      const github = linksConfig.github;

      if (entityType === 'issue' && github.issueTemplate && entityData.number) {
        const result = buildLink(github.issueTemplate, {
          ...entityData,
          baseUrl: github.baseUrl || '',
        });
        if (result.isValid) {
          builtLinks.push({
            provider: 'github',
            label: 'GitHub Issue',
            url: result.url,
            isValid: result.isValid,
            icon: providerIcons.github,
          });
        }
      }

      if (entityType === 'pr' && github.prTemplate && entityData.number) {
        const result = buildLink(github.prTemplate, {
          ...entityData,
          baseUrl: github.baseUrl || '',
        });
        if (result.isValid) {
          builtLinks.push({
            provider: 'github',
            label: 'GitHub PR',
            url: result.url,
            isValid: result.isValid,
            icon: providerIcons.github,
          });
        }
      }

      if (entityType === 'worktree' && github.fileTemplate && entityData.branch) {
        const result = buildLink(github.fileTemplate, {
          ...entityData,
          baseUrl: github.baseUrl || '',
          path: entityData.path || '',
        });
        if (result.isValid) {
          builtLinks.push({
            provider: 'github',
            label: 'View on GitHub',
            url: result.url,
            isValid: result.isValid,
            icon: providerIcons.github,
          });
        }
      }
    }

    // Linear links
    if (linksConfig.linear && entityType === 'issue') {
      const linear = linksConfig.linear;

      if (linear.issueTemplate && entityData.linearId) {
        const result = buildLink(linear.issueTemplate, {
          ...entityData,
          baseUrl: linear.baseUrl || '',
          id: entityData.linearId,
        });
        if (result.isValid) {
          builtLinks.push({
            provider: 'linear',
            label: 'Linear Issue',
            url: result.url,
            isValid: result.isValid,
            icon: providerIcons.linear,
          });
        }
      }
    }

    // Jenkins links
    if (linksConfig.jenkins) {
      const jenkins = linksConfig.jenkins;

      if (jenkins.pipelineTemplate && entityData.buildNumber && entityData.jobName) {
        const result = buildLink(jenkins.pipelineTemplate, {
          ...entityData,
          baseUrl: jenkins.baseUrl || '',
        });
        if (result.isValid) {
          builtLinks.push({
            provider: 'jenkins',
            label: 'Jenkins Build',
            url: result.url,
            isValid: result.isValid,
            icon: providerIcons.jenkins,
          });
        }
      }
    }

    // GitHub Actions links
    if (linksConfig.githubActions) {
      const actions = linksConfig.githubActions;

      if (actions.pipelineTemplate && entityData.runId) {
        const result = buildLink(actions.pipelineTemplate, {
          ...entityData,
          baseUrl: actions.baseUrl || '',
        });
        if (result.isValid) {
          builtLinks.push({
            provider: 'githubActions',
            label: 'GitHub Actions',
            url: result.url,
            isValid: result.isValid,
            icon: providerIcons.githubActions,
          });
        }
      }
    }

    // Deployment links
    if (linksConfig.deployment && entityType === 'worktree') {
      const deployment = linksConfig.deployment;

      if (deployment.deploymentTemplate && entityData.branch) {
        const result = buildLink(deployment.deploymentTemplate, {
          ...entityData,
        });
        if (result.isValid) {
          builtLinks.push({
            provider: 'deployment',
            label: 'Preview Deploy',
            url: result.url,
            isValid: result.isValid,
            icon: providerIcons.deployment,
          });
        }
      }
    }

    setLinks(builtLinks);
  }, [linksConfig, entityType, entityData]);

  // Copy to clipboard handler
  const copyToClipboard = async (url: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);

      // Show success toast
      setToast({ show: true, message: 'Link copied to clipboard', type: 'success' });
    } catch (error) {
      console.error('Failed to copy URL:', error);

      // Show error toast
      setToast({
        show: true,
        message: 'Failed to copy link. Please try again.',
        type: 'error'
      });
    }
  };

  // Keyboard shortcut handler (Cmd+Shift+O / Ctrl+Shift+O)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+Shift+O (macOS) or Ctrl+Shift+O (Windows/Linux)
      const isModifierPressed = e.metaKey || e.ctrlKey;
      const isShiftPressed = e.shiftKey;
      const isOKey = e.key === 'o' || e.key === 'O';

      if (isModifierPressed && isShiftPressed && isOKey) {
        e.preventDefault();

        // If there's a focused link, open it
        if (focusedLinkIndex >= 0 && focusedLinkIndex < links.length) {
          const link = links[focusedLinkIndex];
          window.open(link.url, '_blank', 'noopener,noreferrer');
          setToast({ show: true, message: `Opened ${link.label}`, type: 'info' });
        } else if (links.length > 0) {
          // If no focused link, open the first one
          const link = links[0];
          window.open(link.url, '_blank', 'noopener,noreferrer');
          setToast({ show: true, message: `Opened ${link.label}`, type: 'info' });
        }
      }
    };

    // Only attach listener if there are links
    if (links.length > 0) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [links, focusedLinkIndex]);

  // Update focused link index when hovering
  const handleLinkMouseEnter = (index: number) => {
    setFocusedLinkIndex(index);
  };

  const handleLinkMouseLeave = () => {
    setFocusedLinkIndex(-1);
  };

  if (loading) {
    return null;
  }

  if (links.length === 0) {
    return null;
  }

  return (
    <>
      <div ref={containerRef} className={`flex flex-wrap gap-2 ${className}`}>
        {links.map((link, index) => (
          <div
            key={`${link.provider}-${index}`}
            className="flex items-center gap-1"
            onMouseEnter={() => handleLinkMouseEnter(index)}
            onMouseLeave={handleLinkMouseLeave}
          >
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 hover:border-gray-400 transition-colors ${
                focusedLinkIndex === index ? 'ring-2 ring-blue-500 ring-offset-1' : ''
              }`}
              title={`${link.url} (Cmd+Shift+O to open)`}
            >
              {link.icon}
              <span>{link.label}</span>
              {providerIcons.external}
            </a>
            <button
              onClick={(e) => copyToClipboard(link.url, e)}
              className="inline-flex items-center justify-center w-7 h-7 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
              title="Copy link"
              aria-label={`Copy ${link.label} link`}
            >
              {copiedUrl === link.url ? (
                <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Toast notification */}
      {toast.show && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ ...toast, show: false })}
        />
      )}
    </>
  );
}
