'use client';

import { useEffect, useState } from 'react';

interface ScreenReaderAnnouncerProps {
  announcement?: string;
  politeness?: 'polite' | 'assertive';
}

/**
 * ScreenReaderAnnouncer Component
 *
 * Provides live region announcements for screen reader users.
 * Uses ARIA live regions to announce important state changes.
 *
 * Features:
 * - Configurable politeness level (polite/assertive)
 * - Automatically clears announcements after reading
 * - Hidden from visual users
 * - Supports both polite and assertive announcements
 *
 * @example
 * ```tsx
 * const [announcement, setAnnouncement] = useState('');
 * setAnnouncement('Card moved to In Progress');
 * <ScreenReaderAnnouncer announcement={announcement} politeness="polite" />
 * ```
 */
export function ScreenReaderAnnouncer({
  announcement = '',
  politeness = 'polite',
}: ScreenReaderAnnouncerProps) {
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (announcement) {
      // Set the announcement
      setMessage(announcement);

      // Clear after a delay to allow screen readers to read it
      const timer = setTimeout(() => {
        setMessage('');
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [announcement]);

  return (
    <>
      {/* Polite announcer - won't interrupt current speech */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {politeness === 'polite' ? message : ''}
      </div>

      {/* Assertive announcer - will interrupt current speech */}
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {politeness === 'assertive' ? message : ''}
      </div>
    </>
  );
}

/**
 * Hook for managing screen reader announcements
 *
 * @example
 * ```tsx
 * const { announce } = useAnnouncer();
 * announce('Card moved to In Progress');
 * ```
 */
export function useAnnouncer() {
  const [announcement, setAnnouncement] = useState('');
  const [politeness, setPoliteness] = useState<'polite' | 'assertive'>('polite');

  const announce = (message: string, level: 'polite' | 'assertive' = 'polite') => {
    setPoliteness(level);
    setAnnouncement(message);
  };

  return {
    announcement,
    politeness,
    announce,
  };
}
