/**
 * PR Mapping Validator Tests
 */

import { describe, it, expect } from 'vitest';
import {
  PRMappingValidationError,
  validatePRState,
  validateCreateInput,
  validateUpdateInput,
  validateStateTransition,
  sanitizeBranchName,
  validatePRNumber,
} from '../pr-mapping.validator';
import type {
  CreateIssuePRMappingInput,
  UpdateIssuePRMappingInput,
  PRState,
} from '../../types/issue-pr-mapping';

describe('PR Mapping Validator', () => {
  describe('validatePRState', () => {
    it('should accept valid PR states', () => {
      expect(validatePRState('open')).toBe(true);
      expect(validatePRState('closed')).toBe(true);
      expect(validatePRState('merged')).toBe(true);
    });

    it('should reject invalid PR states', () => {
      expect(validatePRState('invalid')).toBe(false);
      expect(validatePRState('pending')).toBe(false);
      expect(validatePRState('')).toBe(false);
    });
  });

  describe('validateCreateInput', () => {
    const validInput: CreateIssuePRMappingInput = {
      issueId: 'issue-123',
      projectId: 'project-456',
      prNumber: 789,
      prUrl: 'https://github.com/owner/repo/pull/789',
      branchName: 'feature/test',
    };

    it('should accept valid input', () => {
      expect(() => validateCreateInput(validInput)).not.toThrow();
    });

    it('should accept valid input with state', () => {
      expect(() =>
        validateCreateInput({ ...validInput, state: 'open' })
      ).not.toThrow();
    });

    describe('issueId validation', () => {
      it('should reject missing issueId', () => {
        const input = { ...validInput, issueId: '' };
        expect(() => validateCreateInput(input)).toThrow(
          PRMappingValidationError
        );
      });

      it('should reject whitespace-only issueId', () => {
        const input = { ...validInput, issueId: '   ' };
        expect(() => validateCreateInput(input)).toThrow(
          PRMappingValidationError
        );
      });
    });

    describe('projectId validation', () => {
      it('should reject missing projectId', () => {
        const input = { ...validInput, projectId: '' };
        expect(() => validateCreateInput(input)).toThrow(
          PRMappingValidationError
        );
      });

      it('should reject whitespace-only projectId', () => {
        const input = { ...validInput, projectId: '   ' };
        expect(() => validateCreateInput(input)).toThrow(
          PRMappingValidationError
        );
      });
    });

    describe('prNumber validation', () => {
      it('should reject zero PR number', () => {
        const input = { ...validInput, prNumber: 0 };
        expect(() => validateCreateInput(input)).toThrow(
          PRMappingValidationError
        );
      });

      it('should reject negative PR number', () => {
        const input = { ...validInput, prNumber: -1 };
        expect(() => validateCreateInput(input)).toThrow(
          PRMappingValidationError
        );
      });

      it('should reject non-integer PR number', () => {
        const input = { ...validInput, prNumber: 1.5 as any };
        expect(() => validateCreateInput(input)).toThrow(
          PRMappingValidationError
        );
      });
    });

    describe('prUrl validation', () => {
      it('should reject empty PR URL', () => {
        const input = { ...validInput, prUrl: '' };
        expect(() => validateCreateInput(input)).toThrow(
          PRMappingValidationError
        );
      });

      it('should reject invalid URL format', () => {
        const input = { ...validInput, prUrl: 'not-a-url' };
        expect(() => validateCreateInput(input)).toThrow(
          PRMappingValidationError
        );
      });

      it('should reject non-HTTP URLs', () => {
        const input = { ...validInput, prUrl: 'ftp://github.com/pull/123' };
        expect(() => validateCreateInput(input)).toThrow(
          PRMappingValidationError
        );
      });

      it('should accept HTTPS URLs', () => {
        const input = {
          ...validInput,
          prUrl: 'https://github.com/owner/repo/pull/123',
        };
        expect(() => validateCreateInput(input)).not.toThrow();
      });

      it('should accept HTTP URLs', () => {
        const input = {
          ...validInput,
          prUrl: 'http://github.com/owner/repo/pull/123',
        };
        expect(() => validateCreateInput(input)).not.toThrow();
      });
    });

    describe('branchName validation', () => {
      it('should reject empty branch name', () => {
        const input = { ...validInput, branchName: '' };
        expect(() => validateCreateInput(input)).toThrow(
          PRMappingValidationError
        );
      });

      it('should reject whitespace-only branch name', () => {
        const input = { ...validInput, branchName: '   ' };
        expect(() => validateCreateInput(input)).toThrow(
          PRMappingValidationError
        );
      });

      it('should reject branch names with invalid characters', () => {
        const invalidNames = [
          'feature#123',
          'feature@test',
          'feature test',
          'feature!test',
        ];

        for (const branchName of invalidNames) {
          const input = { ...validInput, branchName };
          expect(() => validateCreateInput(input)).toThrow(
            PRMappingValidationError
          );
        }
      });

      it('should accept valid branch names', () => {
        const validNames = [
          'feature/test',
          'bugfix-123',
          'release_1.0',
          'feat/ABC-123',
          'main',
          'develop',
        ];

        for (const branchName of validNames) {
          const input = { ...validInput, branchName };
          expect(() => validateCreateInput(input)).not.toThrow();
        }
      });
    });

    describe('state validation', () => {
      it('should reject invalid state', () => {
        const input = { ...validInput, state: 'invalid' as PRState };
        expect(() => validateCreateInput(input)).toThrow(
          PRMappingValidationError
        );
      });

      it('should accept valid states', () => {
        const states: PRState[] = ['open', 'closed', 'merged'];
        for (const state of states) {
          const input = { ...validInput, state };
          expect(() => validateCreateInput(input)).not.toThrow();
        }
      });
    });
  });

  describe('validateUpdateInput', () => {
    it('should accept valid state update', () => {
      const input: UpdateIssuePRMappingInput = { state: 'closed' };
      expect(() => validateUpdateInput(input)).not.toThrow();
    });

    it('should accept valid closedAt update', () => {
      const input: UpdateIssuePRMappingInput = { closedAt: new Date() };
      expect(() => validateUpdateInput(input)).not.toThrow();
    });

    it('should accept both state and closedAt', () => {
      const input: UpdateIssuePRMappingInput = {
        state: 'merged',
        closedAt: new Date(),
      };
      expect(() => validateUpdateInput(input)).not.toThrow();
    });

    it('should reject empty update', () => {
      const input: UpdateIssuePRMappingInput = {};
      expect(() => validateUpdateInput(input)).toThrow(
        PRMappingValidationError
      );
    });

    it('should reject invalid state', () => {
      const input: UpdateIssuePRMappingInput = { state: 'invalid' as PRState };
      expect(() => validateUpdateInput(input)).toThrow(
        PRMappingValidationError
      );
    });

    it('should reject invalid closedAt type', () => {
      const input: UpdateIssuePRMappingInput = {
        closedAt: 'not-a-date' as any,
      };
      expect(() => validateUpdateInput(input)).toThrow(
        PRMappingValidationError
      );
    });

    it('should reject closedAt with open state', () => {
      const input: UpdateIssuePRMappingInput = {
        state: 'open',
        closedAt: new Date(),
      };
      expect(() => validateUpdateInput(input)).toThrow(
        PRMappingValidationError
      );
    });

    it('should allow closedAt with closed state', () => {
      const input: UpdateIssuePRMappingInput = {
        state: 'closed',
        closedAt: new Date(),
      };
      expect(() => validateUpdateInput(input)).not.toThrow();
    });

    it('should allow closedAt with merged state', () => {
      const input: UpdateIssuePRMappingInput = {
        state: 'merged',
        closedAt: new Date(),
      };
      expect(() => validateUpdateInput(input)).not.toThrow();
    });
  });

  describe('validateStateTransition', () => {
    it('should allow open -> closed transition', () => {
      expect(() => validateStateTransition('open', 'closed')).not.toThrow();
    });

    it('should allow open -> merged transition', () => {
      expect(() => validateStateTransition('open', 'merged')).not.toThrow();
    });

    it('should allow closed -> open transition (reopen)', () => {
      expect(() => validateStateTransition('closed', 'open')).not.toThrow();
    });

    it('should reject open -> open transition', () => {
      expect(() => validateStateTransition('open', 'open')).toThrow(
        PRMappingValidationError
      );
    });

    it('should reject merged -> any transition', () => {
      expect(() => validateStateTransition('merged', 'open')).toThrow(
        PRMappingValidationError
      );
      expect(() => validateStateTransition('merged', 'closed')).toThrow(
        PRMappingValidationError
      );
    });

    it('should reject closed -> merged transition', () => {
      expect(() => validateStateTransition('closed', 'merged')).toThrow(
        PRMappingValidationError
      );
    });
  });

  describe('sanitizeBranchName', () => {
    it('should trim whitespace', () => {
      expect(sanitizeBranchName('  feature/test  ')).toBe('feature/test');
    });

    it('should replace spaces with hyphens', () => {
      expect(sanitizeBranchName('feature test')).toBe('feature-test');
    });

    it('should replace multiple spaces with single hyphen', () => {
      expect(sanitizeBranchName('feature   test')).toBe('feature-test');
    });

    it('should handle mixed whitespace', () => {
      expect(sanitizeBranchName(' feature  test ')).toBe('feature-test');
    });

    it('should not change valid branch names', () => {
      expect(sanitizeBranchName('feature/test')).toBe('feature/test');
      expect(sanitizeBranchName('bugfix-123')).toBe('bugfix-123');
    });
  });

  describe('validatePRNumber', () => {
    it('should accept positive integers', () => {
      expect(() => validatePRNumber(1)).not.toThrow();
      expect(() => validatePRNumber(123)).not.toThrow();
      expect(() => validatePRNumber(999999)).not.toThrow();
    });

    it('should reject zero', () => {
      expect(() => validatePRNumber(0)).toThrow(PRMappingValidationError);
    });

    it('should reject negative numbers', () => {
      expect(() => validatePRNumber(-1)).toThrow(PRMappingValidationError);
      expect(() => validatePRNumber(-100)).toThrow(PRMappingValidationError);
    });

    it('should reject non-integers', () => {
      expect(() => validatePRNumber(1.5)).toThrow(PRMappingValidationError);
      expect(() => validatePRNumber(3.14)).toThrow(PRMappingValidationError);
    });
  });
});
