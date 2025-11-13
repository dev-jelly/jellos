/**
 * GitHub Webhook Routes
 *
 * Handles incoming GitHub webhook events for PR status synchronization
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  getGitHubWebhookService,
  WebhookVerificationError,
  type GitHubPRWebhookPayload,
  type GitHubWebhookEvent,
} from '../services/github-webhook.service';

/**
 * Webhook event response schema
 */
const webhookResponseSchema = z.object({
  success: z.boolean(),
  event: z.string(),
  action: z.string(),
  prNumber: z.number(),
  processed: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
  stateTransition: z
    .object({
      issueId: z.string(),
      from: z.string(),
      to: z.string(),
    })
    .optional(),
});

type WebhookResponse = z.infer<typeof webhookResponseSchema>;

/**
 * Webhook Routes Plugin
 */
export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /webhooks/github
   * Receive GitHub webhook events
   *
   * Handles:
   * - pull_request events (opened, closed, merged, etc.)
   * - Signature verification via X-Hub-Signature-256 header
   * - PR state updates in database
   * - Issue state transitions via event bus
   */
  fastify.post<{
    Body: any;
    Reply: WebhookResponse | { error: string; message: string };
  }>(
    '/webhooks/github',
    {
      schema: {
        description: 'Receive GitHub webhook events for PR synchronization',
        tags: ['webhooks'],
        headers: z.object({
          'x-github-event': z.string().describe('GitHub event type'),
          'x-hub-signature-256': z
            .string()
            .optional()
            .describe('HMAC signature for verification'),
          'x-github-delivery': z
            .string()
            .optional()
            .describe('Unique delivery ID'),
        }),
        response: {
          200: webhookResponseSchema,
          400: z.object({
            error: z.string(),
            message: z.string(),
          }),
          401: z.object({
            error: z.string(),
            message: z.string(),
          }),
          500: z.object({
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const eventType = request.headers['x-github-event'] as string;
      const signature = request.headers['x-hub-signature-256'] as
        | string
        | undefined;
      const deliveryId = request.headers['x-github-delivery'] as
        | string
        | undefined;

      // Log webhook receipt
      request.log.info(
        {
          event: eventType,
          deliveryId,
          hasSignature: !!signature,
        },
        'Received GitHub webhook'
      );

      try {
        // Initialize webhook service
        const webhookService = getGitHubWebhookService();

        // Validate event type
        if (!webhookService.isValidEventType(eventType)) {
          request.log.debug(
            { event: eventType },
            'Ignoring unsupported webhook event type'
          );
          return reply.code(200).send({
            success: true,
            event: eventType,
            action: 'ignored',
            prNumber: 0,
            processed: false,
            message: `Event type '${eventType}' is not supported`,
          });
        }

        // Get raw body for signature verification
        // Note: Fastify provides rawBody when configured
        const rawBody = (request as any).rawBody || JSON.stringify(request.body);

        // Verify webhook signature
        let isValidSignature: boolean;
        try {
          isValidSignature = webhookService.verifySignature(rawBody, signature);
        } catch (error) {
          if (error instanceof WebhookVerificationError) {
            request.log.warn(
              { error: error.message, deliveryId },
              'Webhook signature verification failed'
            );
            return reply.code(401).send({
              error: 'Unauthorized',
              message: error.message,
            });
          }
          throw error;
        }

        if (!isValidSignature) {
          request.log.warn(
            { deliveryId },
            'Invalid webhook signature - request rejected'
          );
          return reply.code(401).send({
            error: 'Unauthorized',
            message: 'Invalid webhook signature',
          });
        }

        // Process the webhook based on event type
        if (eventType === 'pull_request') {
          const payload = request.body as GitHubPRWebhookPayload;

          // Validate payload has required fields
          if (!payload.action || !payload.pull_request) {
            return reply.code(400).send({
              error: 'Bad Request',
              message: 'Invalid pull_request webhook payload',
            });
          }

          // Process PR event
          const result = await webhookService.processPullRequestEvent(payload);

          // Log processing result
          if (result.success) {
            request.log.info(
              {
                prNumber: result.prNumber,
                action: result.action,
                processed: result.processed,
                stateTransition: result.stateTransition,
              },
              'Successfully processed PR webhook'
            );
          } else {
            request.log.error(
              {
                prNumber: result.prNumber,
                action: result.action,
                error: result.error,
              },
              'Failed to process PR webhook'
            );
          }

          return reply.code(200).send(result);
        }

        // Handle other event types (pull_request_review, etc.)
        return reply.code(200).send({
          success: true,
          event: eventType,
          action: 'acknowledged',
          prNumber: 0,
          processed: false,
          message: `Event type '${eventType}' acknowledged but not yet implemented`,
        });
      } catch (error) {
        request.log.error(
          {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            event: eventType,
            deliveryId,
          },
          'Error processing GitHub webhook'
        );

        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to process webhook',
        });
      }
    }
  );

  /**
   * GET /webhooks/github/health
   * Health check endpoint for webhook service
   */
  fastify.get(
    '/webhooks/github/health',
    {
      schema: {
        description: 'Health check for GitHub webhook endpoint',
        tags: ['webhooks'],
        response: {
          200: z.object({
            status: z.string(),
            webhookSecretConfigured: z.boolean(),
            supportedEvents: z.array(z.string()),
          }),
        },
      },
    },
    async (request, reply) => {
      const webhookService = getGitHubWebhookService();
      const webhookSecretConfigured = !!process.env.GITHUB_WEBHOOK_SECRET;

      return reply.code(200).send({
        status: 'healthy',
        webhookSecretConfigured,
        supportedEvents: ['pull_request', 'pull_request_review'],
      });
    }
  );
};

export default webhookRoutes;
