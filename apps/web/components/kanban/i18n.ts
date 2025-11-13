/**
 * Internationalization (i18n) for Kanban Board
 *
 * Supports Korean and English for screen reader announcements
 * and accessibility features.
 */

export type Locale = 'ko' | 'en';

interface Translations {
  // Board instructions
  boardInstructions: string;

  // Drag and drop announcements
  pickedUpCard: (cardTitle: string, columnTitle: string) => string;
  droppedInOriginal: string;
  droppedInSame: (cardTitle: string) => string;
  movedCard: (cardTitle: string, fromColumn: string, toColumn: string) => string;
  updateSuccess: (cardTitle: string, columnTitle: string) => string;
  updateFailed: (cardTitle: string) => string;
  dragCancelled: (cardTitle: string) => string;

  // Keyboard shortcuts
  keyboardShortcutsOpened: string;
  keyboardShortcutsClosed: string;

  // Card instructions
  cardInstructions: string;

  // Status labels
  status: {
    TODO: string;
    IN_PROGRESS: string;
    IN_REVIEW: string;
    DEPLOYED: string;
  };

  // General
  issueCount: (count: number) => string;
  noIssues: (columnTitle: string) => string;
}

const translations: Record<Locale, Translations> = {
  ko: {
    boardInstructions:
      '접근 가능한 칸반 보드입니다. Tab과 Shift+Tab으로 카드 간 이동이 가능합니다. ' +
      '카드를 이동하려면 포커스 후 Space를 눌러 집고, 화살표 키로 열 간 이동(좌우) 또는 열 내 이동(상하)을 하세요. ' +
      '다시 Space를 눌러 놓거나 Escape로 취소할 수 있습니다. 물음표 키로 키보드 단축키를 확인하세요.',

    pickedUpCard: (cardTitle, columnTitle) =>
      `카드를 집었습니다: ${cardTitle}. 현재 위치: ${columnTitle}. 화살표 키로 열 간 이동이 가능합니다.`,

    droppedInOriginal: '카드를 원래 위치에 놓았습니다. 변경 사항이 없습니다.',

    droppedInSame: (cardTitle) =>
      `카드 ${cardTitle}를 같은 열에 놓았습니다. 변경 사항이 없습니다.`,

    movedCard: (cardTitle, fromColumn, toColumn) =>
      `카드 ${cardTitle}를 ${fromColumn}에서 ${toColumn}로 이동했습니다.`,

    updateSuccess: (cardTitle, columnTitle) =>
      `${cardTitle}의 상태를 ${columnTitle}로 업데이트했습니다.`,

    updateFailed: (cardTitle) =>
      `${cardTitle} 이동에 실패했습니다. 다시 시도해주세요.`,

    dragCancelled: (cardTitle) =>
      `${cardTitle} 드래그가 취소되었습니다. 카드가 원래 위치로 돌아갔습니다.`,

    keyboardShortcutsOpened: '키보드 단축키 도움말이 열렸습니다.',
    keyboardShortcutsClosed: '키보드 단축키 도움말이 닫혔습니다.',

    cardInstructions:
      'Space를 눌러 이 카드를 집고 이동하세요. 화살표 키로 열 간 이동이 가능합니다. ' +
      'Enter를 눌러 카드 상세 정보를 열 수 있습니다. Escape를 눌러 취소할 수 있습니다.',

    status: {
      TODO: '할 일',
      IN_PROGRESS: '진행 중',
      IN_REVIEW: '리뷰 중',
      DEPLOYED: '배포됨',
    },

    issueCount: (count) => `${count}개의 이슈`,
    noIssues: (columnTitle) => `${columnTitle}에 이슈가 없습니다.`,
  },

  en: {
    boardInstructions:
      'This is an accessible Kanban board. Navigate between cards using Tab and Shift+Tab. ' +
      'To move a card, focus on it and press Space to pick it up. Use arrow keys to move ' +
      'between columns (left/right) or within a column (up/down). Press Space again to drop ' +
      'the card, or Escape to cancel. Press question mark for keyboard shortcuts.',

    pickedUpCard: (cardTitle, columnTitle) =>
      `Picked up card: ${cardTitle}. Current position: ${columnTitle}. Use arrow keys to move between columns.`,

    droppedInOriginal: 'Card dropped in original position. No changes made.',

    droppedInSame: (cardTitle) =>
      `Card ${cardTitle} dropped in same column. No changes made.`,

    movedCard: (cardTitle, fromColumn, toColumn) =>
      `Card ${cardTitle} moved from ${fromColumn} to ${toColumn}`,

    updateSuccess: (cardTitle, columnTitle) =>
      `Successfully updated ${cardTitle} status to ${columnTitle}`,

    updateFailed: (cardTitle) =>
      `Failed to move ${cardTitle}. Please try again.`,

    dragCancelled: (cardTitle) =>
      `Drag cancelled for ${cardTitle}. Card returned to original position.`,

    keyboardShortcutsOpened: 'Keyboard shortcuts help opened',
    keyboardShortcutsClosed: 'Keyboard shortcuts help closed',

    cardInstructions:
      'Press Space to pick up and move this card. Use arrow keys to move between columns. ' +
      'Press Enter to open card details. Press Escape to cancel.',

    status: {
      TODO: 'To Do',
      IN_PROGRESS: 'In Progress',
      IN_REVIEW: 'In Review',
      DEPLOYED: 'Deployed',
    },

    issueCount: (count) => `${count} ${count === 1 ? 'issue' : 'issues'}`,
    noIssues: (columnTitle) => `No issues in ${columnTitle}`,
  },
};

/**
 * Detect browser locale
 * Returns 'ko' for Korean browsers, 'en' otherwise
 */
export function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'en';

  const browserLang = window.navigator.language.toLowerCase();
  return browserLang.startsWith('ko') ? 'ko' : 'en';
}

/**
 * Get translations for the current locale
 */
export function useKanbanTranslations(locale?: Locale): Translations {
  const currentLocale = locale ?? detectLocale();
  return translations[currentLocale];
}

/**
 * Get localized status label
 */
export function getStatusLabel(status: string, locale?: Locale): string {
  const t = useKanbanTranslations(locale);
  const statusKey = status as keyof typeof t.status;
  return t.status[statusKey] || status;
}
