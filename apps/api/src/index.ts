import { buildApp } from './app';
import {
  getPermissionConfig,
  validatePermissionConfig,
  displayPermissionConfig,
} from './lib/process/permission-profiles';
import {
  loadEnvironmentVariables,
  validateRequiredEnvVars,
  setupSecretMasking,
} from './lib/secrets';

const start = async () => {
  try {
    // Step 1: Load environment variables with secret injection
    console.log('🔐 Loading environment variables...');
    const envResult = await loadEnvironmentVariables({
      envFilePath: '.env',
      environment: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
      override: false,
      throwOnMissing: process.env.NODE_ENV === 'production',
      enableMasking: true,
    });

    console.log(
      `✓ Loaded ${envResult.loaded} variables, masked ${envResult.masked} secrets`
    );

    if (envResult.failed > 0) {
      console.warn(`⚠️  Failed to load ${envResult.failed} variables`);
      envResult.errors.forEach((error) => console.warn(`   - ${error}`));
    }

    // Step 2: Validate required environment variables
    const requiredVars = ['PORT', 'DATABASE_URL'];
    const validation = validateRequiredEnvVars(requiredVars);

    if (!validation.valid) {
      throw new Error(
        `Missing required environment variables: ${validation.missing.join(', ')}`
      );
    }

    // Step 3: Setup secret masking for console output
    setupSecretMasking();
    console.log('✓ Secret masking enabled');

    // Step 4: Display permission configuration
    const permissionConfig = getPermissionConfig();
    validatePermissionConfig(permissionConfig);
    displayPermissionConfig(permissionConfig);

    // Step 5: Build and start the application
    const app = await buildApp();
    const port = Number(process.env.PORT) || 3001;
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });
    app.log.info(`🚀 Server ready at http://${host}:${port}`);
    app.log.info(`📊 Health check: http://${host}:${port}/health`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

start();
