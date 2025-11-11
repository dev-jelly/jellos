import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

const projectRoutes: FastifyPluginAsync = async (fastify) => {
  // Placeholder routes - will be implemented in next subtasks
  fastify.get('/', async () => {
    return { message: 'Project routes - to be implemented' };
  });
};

export default fp(projectRoutes);
export { projectRoutes };
