'use client';

import { useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Locale } from './i18n';

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
  locale?: Locale;
}

interface Shortcut {
  keys: string[];
  description: string;
}

const shortcutsEn: { category: string; items: Shortcut[] }[] = [
  {
    category: 'Navigation',
    items: [
      { keys: ['Tab'], description: 'Move focus to next card/column' },
      { keys: ['Shift', 'Tab'], description: 'Move focus to previous card/column' },
      { keys: ['Arrow Keys'], description: 'Navigate between cards in same column' },
      { keys: ['Home'], description: 'Move to first card in column' },
      { keys: ['End'], description: 'Move to last card in column' },
    ],
  },
  {
    category: 'Drag and Drop',
    items: [
      { keys: ['Space'], description: 'Pick up focused card (start drag)' },
      { keys: ['Arrow Keys'], description: 'Move card between columns (while dragging)' },
      { keys: ['Space'], description: 'Drop card (end drag)' },
      { keys: ['Escape'], description: 'Cancel drag operation' },
    ],
  },
  {
    category: 'Actions',
    items: [
      { keys: ['Enter'], description: 'Open focused card details' },
      { keys: ['?'], description: 'Show this help dialog' },
      { keys: ['Escape'], description: 'Close this help dialog' },
    ],
  },
];

const shortcutsKo: { category: string; items: Shortcut[] }[] = [
  {
    category: '탐색',
    items: [
      { keys: ['Tab'], description: '다음 카드/열로 포커스 이동' },
      { keys: ['Shift', 'Tab'], description: '이전 카드/열로 포커스 이동' },
      { keys: ['방향키'], description: '같은 열 내에서 카드 간 이동' },
      { keys: ['Home'], description: '열의 첫 번째 카드로 이동' },
      { keys: ['End'], description: '열의 마지막 카드로 이동' },
    ],
  },
  {
    category: '드래그 앤 드롭',
    items: [
      { keys: ['Space'], description: '포커스된 카드 집기 (드래그 시작)' },
      { keys: ['방향키'], description: '카드를 열 간 이동 (드래그 중)' },
      { keys: ['Space'], description: '카드 놓기 (드래그 종료)' },
      { keys: ['Escape'], description: '드래그 작업 취소' },
    ],
  },
  {
    category: '동작',
    items: [
      { keys: ['Enter'], description: '포커스된 카드 상세 정보 열기' },
      { keys: ['?'], description: '이 도움말 대화상자 표시' },
      { keys: ['Escape'], description: '이 도움말 대화상자 닫기' },
    ],
  },
];

const localizedContent = {
  en: {
    title: 'Keyboard Shortcuts',
    intro: 'Use these keyboard shortcuts to navigate and interact with the Kanban board efficiently.',
    note: 'These shortcuts are available when the Kanban board is in focus. Some shortcuts may behave differently depending on your screen reader settings.',
    closeButton: 'Got it!',
  },
  ko: {
    title: '키보드 단축키',
    intro: '이 키보드 단축키를 사용하여 칸반 보드를 효율적으로 탐색하고 상호작용하세요.',
    note: '이 단축키는 칸반 보드에 포커스가 있을 때 사용할 수 있습니다. 일부 단축키는 스크린 리더 설정에 따라 다르게 동작할 수 있습니다.',
    closeButton: '확인',
  },
};

/**
 * KeyboardShortcutsHelp Component
 *
 * Displays a modal with keyboard shortcuts for the Kanban board.
 * Accessible via the '?' key or help button.
 *
 * Features:
 * - Organized shortcuts by category
 * - Keyboard accessible (Escape to close)
 * - Screen reader friendly with proper ARIA attributes
 * - Focus trap within modal
 * - Supports Korean and English localization
 *
 * @example
 * ```tsx
 * const [isOpen, setIsOpen] = useState(false);
 * <KeyboardShortcutsHelp isOpen={isOpen} locale="ko" onClose={() => setIsOpen(false)} />
 * ```
 */
export function KeyboardShortcutsHelp({ isOpen, onClose, locale = 'en' }: KeyboardShortcutsHelpProps) {
  const shortcuts = locale === 'ko' ? shortcutsKo : shortcutsEn;
  const content = localizedContent[locale];
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="keyboard-shortcuts-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
          <h2
            id="keyboard-shortcuts-title"
            className="text-xl font-semibold text-gray-900"
          >
            {content.title}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-white/50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            aria-label="Close keyboard shortcuts help"
          >
            <XMarkIcon className="w-5 h-5 text-gray-500" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-120px)]">
          <p className="text-sm text-gray-600 mb-6">
            {content.intro}
          </p>

          <div className="space-y-6">
            {shortcuts.map((section) => (
              <div key={section.category}>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
                  {section.category}
                </h3>
                <div className="space-y-2">
                  {section.items.map((shortcut, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2 px-3 rounded hover:bg-gray-50"
                    >
                      <span className="text-sm text-gray-700">{shortcut.description}</span>
                      <div className="flex gap-1">
                        {shortcut.keys.map((key, keyIndex) => (
                          <kbd
                            key={keyIndex}
                            className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-300 rounded shadow-sm"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer note */}
          <div className="mt-6 pt-4 border-t">
            <p className="text-xs text-gray-500">
              <strong>{locale === 'ko' ? '참고' : 'Note'}:</strong> {content.note}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            {content.closeButton}
          </button>
        </div>
      </div>
    </div>
  );
}
