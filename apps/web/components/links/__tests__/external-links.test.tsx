/**
 * ExternalLinks Component Tests
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ExternalLinks } from '../external-links';

// Mock fetch
global.fetch = jest.fn();

describe('ExternalLinks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn(() => Promise.resolve()),
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should render nothing when loading', () => {
    (global.fetch as jest.Mock).mockImplementation(() =>
      new Promise(() => {}) // Never resolves
    );

    const { container } = render(
      <ExternalLinks
        projectId="test-project"
        entityType="issue"
        entityData={{ number: '123' }}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render nothing when no links config is available', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => null,
    });

    const { container } = render(
      <ExternalLinks
        projectId="test-project"
        entityType="issue"
        entityData={{ number: '123' }}
      />
    );

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('should render GitHub issue link when config is available', async () => {
    (global.fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            github: {
              baseUrl: 'https://github.com/owner/repo',
              issueTemplate: '{baseUrl}/issues/{number}',
            },
          }),
      })
    );

    render(
      <ExternalLinks
        projectId="test-project"
        entityType="issue"
        entityData={{ number: '123' }}
      />
    );

    const link = await screen.findByText('GitHub Issue', {}, { timeout: 3000 });
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute(
      'href',
      'https://github.com/owner/repo/issues/123'
    );
  });

  it('should render Linear issue link when config is available', async () => {
    (global.fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            linear: {
              baseUrl: 'https://linear.app/workspace',
              issueTemplate: '{baseUrl}/issue/{id}',
            },
          }),
      })
    );

    render(
      <ExternalLinks
        projectId="test-project"
        entityType="issue"
        entityData={{ linearId: 'ABC-123' }}
      />
    );

    const link = await screen.findByText('Linear Issue', {}, { timeout: 3000 });
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute(
      'href',
      'https://linear.app/workspace/issue/ABC-123'
    );
  });

  it('should render multiple links when multiple configs are available', async () => {
    (global.fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            github: {
              baseUrl: 'https://github.com/owner/repo',
              issueTemplate: '{baseUrl}/issues/{number}',
            },
            linear: {
              baseUrl: 'https://linear.app/workspace',
              issueTemplate: '{baseUrl}/issue/{id}',
            },
          }),
      })
    );

    render(
      <ExternalLinks
        projectId="test-project"
        entityType="issue"
        entityData={{ number: '123', linearId: 'ABC-123' }}
      />
    );

    await screen.findByText('GitHub Issue', {}, { timeout: 3000 });
    expect(screen.getByText('Linear Issue')).toBeInTheDocument();
  });

  it('should not render links with missing required parameters', async () => {
    (global.fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            github: {
              baseUrl: 'https://github.com/owner/repo',
              issueTemplate: '{baseUrl}/issues/{number}',
            },
          }),
      })
    );

    const { container } = render(
      <ExternalLinks
        projectId="test-project"
        entityType="issue"
        entityData={{}} // Missing 'number' parameter
      />
    );

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('should copy URL to clipboard when copy button is clicked', async () => {
    (global.fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            github: {
              baseUrl: 'https://github.com/owner/repo',
              issueTemplate: '{baseUrl}/issues/{number}',
            },
          }),
      })
    );

    render(
      <ExternalLinks
        projectId="test-project"
        entityType="issue"
        entityData={{ number: '123' }}
      />
    );

    await screen.findByText('GitHub Issue', {}, { timeout: 3000 });

    const copyButton = screen.getByTitle('Copy link');
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'https://github.com/owner/repo/issues/123'
      );
    });
  });

  it('should render deployment link for worktree entity type', async () => {
    (global.fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            deployment: {
              deploymentTemplate: 'https://preview-{branch}.example.com',
            },
          }),
      })
    );

    render(
      <ExternalLinks
        projectId="test-project"
        entityType="worktree"
        entityData={{ branch: 'feature-123' }}
      />
    );

    const link = await screen.findByText('Preview Deploy', {}, { timeout: 3000 });
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute(
      'href',
      'https://preview-feature-123.example.com'
    );
  });

  it('should open links in new tab', async () => {
    (global.fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            github: {
              baseUrl: 'https://github.com/owner/repo',
              issueTemplate: '{baseUrl}/issues/{number}',
            },
          }),
      })
    );

    render(
      <ExternalLinks
        projectId="test-project"
        entityType="issue"
        entityData={{ number: '123' }}
      />
    );

    const link = await screen.findByText('GitHub Issue', {}, { timeout: 3000 });
    const anchor = link.closest('a');
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('should handle fetch errors gracefully', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    const { container } = render(
      <ExternalLinks
        projectId="test-project"
        entityType="issue"
        entityData={{ number: '123' }}
      />
    );

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('should not render invalid URLs', async () => {
    (global.fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            github: {
              baseUrl: 'javascript:alert("xss")',
              issueTemplate: '{baseUrl}/issues/{number}',
            },
          }),
      })
    );

    const { container } = render(
      <ExternalLinks
        projectId="test-project"
        entityType="issue"
        entityData={{ number: '123' }}
      />
    );

    await waitFor(() => {
      // Should not render any links due to invalid URL
      expect(container.firstChild).toBeNull();
    });
  });
});
