/**
 * Raw Body Plugin
 *
 * Adds raw body content to requests for webhook signature verification
 * Only enabled for routes that explicitly set config.rawBody = true
 */

import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Plugin options
 */
export interface RawBodyPluginOptions {
  /**
   * Field name to store raw body (default: 'rawBody')
   */
  field?: string;

  /**
   * Content types to capture raw body for (default: ['application/json'])
   */
  contentTypes?: string[];

  /**
   * Maximum body size (default: 1MB)
   */
  limit?: number;
}

/**
 * Raw Body Plugin
 *
 * Captures raw request body for routes that need it (e.g., webhook signature verification)
 */
const rawBodyPlugin: FastifyPluginAsync<RawBodyPluginOptions> = async (
  fastify,
  options
) => {
  const field = options.field || 'rawBody';
  const contentTypes = options.contentTypes || ['application/json'];
  const limit = options.limit || 1048576; // 1MB default

  // Add content type parser to capture raw body
  for (const contentType of contentTypes) {
    fastify.addContentTypeParser(
      contentType,
      { parseAs: 'buffer', bodyLimit: limit },
      async function (request: any, payload: Buffer) {
        // Store raw body on request object
        request[field] = payload;

        // Return parsed JSON
        try {
          const jsonString = payload.toString('utf8');
          return JSON.parse(jsonString);
        } catch (error) {
          throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    );
  }

  fastify.log.info(
    {
      field,
      contentTypes,
      limit,
    },
    'Raw body plugin registered'
  );
};

export default fp(rawBodyPlugin, {
  fastify: '4.x',
  name: 'raw-body',
});
