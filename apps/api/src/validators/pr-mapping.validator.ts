/**
 * Validation utilities for PR mappings
 */

import type {
  CreateIssuePRMappingInput,
  UpdateIssuePRMappingInput,
  PRState,
} from '../types/issue-pr-mapping';

export class PRMappingValidationError extends Error {
  constructor(
    message: string,
    public field?: string
  ) {
    super(message);
    this.name = 'PRMappingValidationError';
  }
}

/**
 * Valid PR states
 */
const VALID_PR_STATES: PRState[] = ['open', 'closed', 'merged'];

/**
 * Validate PR state
 */
export function validatePRState(state: string): state is PRState {
  return VALID_PR_STATES.includes(state as PRState);
}

/**
 * Validate create input
 */
export function validateCreateInput(
  input: CreateIssuePRMappingInput
): void {
  // Validate required fields
  if (!input.issueId || typeof input.issueId !== 'string' || input.issueId.trim() === '') {
    throw new PRMappingValidationError('Issue ID is required', 'issueId');
  }

  if (!input.projectId || typeof input.projectId !== 'string' || input.projectId.trim() === '') {
    throw new PRMappingValidationError('Project ID is required', 'projectId');
  }

  if (typeof input.prNumber !== 'number' || input.prNumber <= 0) {
    throw new PRMappingValidationError(
      'PR number must be a positive integer',
      'prNumber'
    );
  }

  if (!input.prUrl || typeof input.prUrl !== 'string' || input.prUrl.trim() === '') {
    throw new PRMappingValidationError('PR URL is required', 'prUrl');
  }

  // Validate PR URL format
  try {
    const url = new URL(input.prUrl);
    if (!url.protocol.startsWith('http')) {
      throw new Error('Invalid protocol');
    }
  } catch (error) {
    throw new PRMappingValidationError(
      'PR URL must be a valid HTTP(S) URL',
      'prUrl'
    );
  }

  if (!input.branchName || typeof input.branchName !== 'string' || input.branchName.trim() === '') {
    throw new PRMappingValidationError('Branch name is required', 'branchName');
  }

  // Validate branch name format (basic git ref name rules)
  if (!/^[a-zA-Z0-9/_-]+$/.test(input.branchName)) {
    throw new PRMappingValidationError(
      'Branch name contains invalid characters',
      'branchName'
    );
  }

  // Validate optional state field
  if (input.state && !validatePRState(input.state)) {
    throw new PRMappingValidationError(
      `Invalid PR state. Must be one of: ${VALID_PR_STATES.join(', ')}`,
      'state'
    );
  }
}

/**
 * Validate update input
 */
export function validateUpdateInput(
  input: UpdateIssuePRMappingInput
): void {
  // At least one field must be provided
  if (!input.state && !input.closedAt) {
    throw new PRMappingValidationError(
      'At least one field must be provided for update'
    );
  }

  // Validate state if provided
  if (input.state && !validatePRState(input.state)) {
    throw new PRMappingValidationError(
      `Invalid PR state. Must be one of: ${VALID_PR_STATES.join(', ')}`,
      'state'
    );
  }

  // Validate closedAt if provided
  if (input.closedAt && !(input.closedAt instanceof Date)) {
    throw new PRMappingValidationError(
      'closedAt must be a valid Date object',
      'closedAt'
    );
  }

  // Logical validation: closedAt should only be set if state is closed or merged
  if (input.closedAt && input.state && input.state === 'open') {
    throw new PRMappingValidationError(
      'Cannot set closedAt for open PRs',
      'closedAt'
    );
  }
}

/**
 * Validate state transition
 */
export function validateStateTransition(
  currentState: PRState,
  newState: PRState
): void {
  // Define valid state transitions
  const validTransitions: Record<PRState, PRState[]> = {
    open: ['closed', 'merged'], // open can become closed or merged
    closed: ['open'], // closed can be reopened
    merged: [], // merged is terminal state
  };

  const allowedStates = validTransitions[currentState];

  if (!allowedStates.includes(newState)) {
    throw new PRMappingValidationError(
      `Invalid state transition from '${currentState}' to '${newState}'`
    );
  }
}

/**
 * Sanitize branch name
 */
export function sanitizeBranchName(branchName: string): string {
  return branchName.trim().replace(/\s+/g, '-');
}

/**
 * Validate PR number format
 */
export function validatePRNumber(prNumber: number): void {
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new PRMappingValidationError(
      'PR number must be a positive integer',
      'prNumber'
    );
  }
}
