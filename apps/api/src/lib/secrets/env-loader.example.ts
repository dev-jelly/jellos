/**
 * Environment Variable Injection Pipeline - Usage Examples
 *
 * This file demonstrates how to use the env-loader to:
 * 1. Load environment variables from .env files
 * 2. Inject secrets from Keychain/1Password
 * 3. Mask secrets in logs and console output
 * 4. Validate required variables
 */

import {
  loadEnvironmentVariables,
  validateRequiredEnvVars,
  setupSecretMasking,
  getMaskedEnv,
} from './env-loader';

/**
 * Example 1: Basic Usage - Load .env file
 */
export async function basicExample() {
  console.log('=== Example 1: Basic Usage ===\n');

  // Load from default .env file
  const result = await loadEnvironmentVariables({
    envFilePath: '.env',
    override: false, // Don't override existing env vars
    enableMasking: true, // Enable secret masking
  });

  console.log(`Loaded ${result.loaded} variables`);
  console.log(`Masked ${result.masked} secrets`);
  console.log(`Variables: ${result.variables.join(', ')}`);

  if (result.errors.length > 0) {
    console.error('Errors:', result.errors);
  }
}

/**
 * Example 2: With Secret Injection
 *
 * .env file content:
 * ```
 * # GitHub Configuration
 * GITHUB_TOKEN=${secret:prod/GITHUB_TOKEN}
 *
 * # Database
 * DATABASE_URL=${secret:prod/DATABASE_URL}
 *
 * # Regular variables
 * NODE_ENV=production
 * PORT=3000
 * ```
 */
export async function secretInjectionExample() {
  console.log('=== Example 2: Secret Injection ===\n');

  const result = await loadEnvironmentVariables({
    envFilePath: '.env.production',
    environment: 'prod', // Use production namespace
    override: true, // Override existing values
    enableMasking: true,
  });

  // Secrets are now loaded into process.env
  console.log('GitHub token loaded:', !!process.env.GITHUB_TOKEN);
  console.log('Database URL loaded:', !!process.env.DATABASE_URL);

  // When logged, secrets will be masked
  console.log('Masked env:', getMaskedEnv());
}

/**
 * Example 3: Validation
 */
export async function validationExample() {
  console.log('=== Example 3: Validation ===\n');

  // Load environment variables
  await loadEnvironmentVariables({
    envFilePath: '.env',
    enableMasking: true,
  });

  // Define required variables
  const required = [
    'NODE_ENV',
    'PORT',
    'DATABASE_URL',
    'API_KEY',
    'GITHUB_TOKEN',
  ];

  // Validate
  const validation = validateRequiredEnvVars(required);

  if (validation.valid) {
    console.log('✓ All required variables are present');
  } else {
    console.error('✗ Missing required variables:', validation.missing);
    process.exit(1);
  }
}

/**
 * Example 4: Custom Secret Patterns
 */
export async function customPatternsExample() {
  console.log('=== Example 4: Custom Secret Patterns ===\n');

  // Define custom patterns for your application
  const customPatterns = [
    /MYAPP-[A-Z0-9]{32}/, // Custom token format
    /proj_[a-z0-9]{40}/, // Project-specific keys
  ];

  const result = await loadEnvironmentVariables({
    envFilePath: '.env',
    enableMasking: true,
    additionalSecretPatterns: customPatterns,
  });

  console.log(`Detected ${result.masked} secrets (including custom patterns)`);
}

/**
 * Example 5: Development vs Production
 */
export async function environmentSpecificExample() {
  console.log('=== Example 5: Environment-Specific Loading ===\n');

  const nodeEnv = process.env.NODE_ENV || 'development';

  // Load appropriate .env file
  const envFile = nodeEnv === 'production' ? '.env.production' : '.env.development';

  const result = await loadEnvironmentVariables({
    envFilePath: envFile,
    environment: nodeEnv === 'production' ? 'prod' : 'dev',
    override: true,
    enableMasking: nodeEnv === 'production', // Only mask in production
  });

  console.log(`Loaded ${result.loaded} variables for ${nodeEnv}`);
}

/**
 * Example 6: Application Startup
 *
 * This is the recommended pattern for application initialization
 */
export async function applicationStartupExample() {
  console.log('=== Example 6: Application Startup ===\n');

  try {
    // Step 1: Load environment variables
    const result = await loadEnvironmentVariables({
      envFilePath: '.env',
      environment: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
      override: false, // Don't override system env vars
      throwOnMissing: true, // Fail fast if secrets can't be loaded
      enableMasking: true, // Always mask secrets
    });

    console.log(`✓ Loaded ${result.loaded} environment variables`);
    console.log(`✓ Masked ${result.masked} secrets`);

    // Step 2: Validate required variables
    const required = ['NODE_ENV', 'PORT', 'DATABASE_URL'];
    const validation = validateRequiredEnvVars(required);

    if (!validation.valid) {
      throw new Error(`Missing required env vars: ${validation.missing.join(', ')}`);
    }

    console.log('✓ All required variables present');

    // Step 3: Setup secret masking for console output
    setupSecretMasking();
    console.log('✓ Secret masking enabled');

    // Step 4: Start application
    console.log('\n✓ Environment ready - starting application...');

    // Example: Now safe to log configuration
    console.log('Configuration:', {
      env: process.env.NODE_ENV,
      port: process.env.PORT,
      // These will be automatically masked:
      databaseUrl: process.env.DATABASE_URL,
      apiKey: process.env.API_KEY,
    });
  } catch (error) {
    console.error('Failed to initialize environment:', error);
    process.exit(1);
  }
}

/**
 * Example 7: With Fastify Integration
 */
export async function fastifyIntegrationExample() {
  console.log('=== Example 7: Fastify Integration ===\n');

  // Load environment before creating Fastify instance
  await loadEnvironmentVariables({
    envFilePath: '.env',
    enableMasking: true,
  });

  // Setup masking for console
  setupSecretMasking();

  // Now create Fastify with logger
  // The logger will automatically redact fields defined in REDACT_FIELDS
  // AND secret masking will catch any actual secret values
  const fastify = await import('fastify');
  const { createLoggerConfig } = await import('../logger');

  const app = fastify.default({
    logger: createLoggerConfig(),
  });

  app.log.info('Application started with masked secrets');

  // Example: Log configuration (secrets will be masked)
  app.log.info({
    config: {
      port: process.env.PORT,
      database: process.env.DATABASE_URL, // Will be masked
      apiKey: process.env.API_KEY, // Will be masked
    },
  });
}

/**
 * Example 8: Testing Setup
 */
export async function testingSetupExample() {
  console.log('=== Example 8: Testing Setup ===\n');

  // In tests, you might want to use a test .env file
  const result = await loadEnvironmentVariables({
    envFilePath: '.env.test',
    environment: 'test',
    override: true, // Override to ensure test values
    enableMasking: false, // Disable masking in tests for easier debugging
  });

  console.log('Test environment loaded:', result.variables);

  // Validate test-specific variables
  const testRequired = ['TEST_API_KEY', 'TEST_DATABASE_URL'];
  const validation = validateRequiredEnvVars(testRequired);

  if (!validation.valid) {
    throw new Error(`Missing test env vars: ${validation.missing.join(', ')}`);
  }

  console.log('✓ Test environment ready');
}

/**
 * Example 9: Error Handling
 */
export async function errorHandlingExample() {
  console.log('=== Example 9: Error Handling ===\n');

  try {
    // Attempt to load with strict validation
    const result = await loadEnvironmentVariables({
      envFilePath: '.env',
      throwOnMissing: true,
      enableMasking: true,
    });

    if (result.errors.length > 0) {
      console.warn('Non-fatal errors occurred:', result.errors);
    }

    // Validate critical variables
    const critical = ['DATABASE_URL', 'API_KEY'];
    const validation = validateRequiredEnvVars(critical);

    if (!validation.valid) {
      // Log error without exposing secrets
      console.error('Critical variables missing:', validation.missing);
      throw new Error('Environment validation failed');
    }
  } catch (error) {
    // Errors are automatically masked if they contain secrets
    console.error('Failed to load environment:', error);

    // Fallback to defaults or exit
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
}

/**
 * Example 10: Dynamic Injection
 */
export async function dynamicInjectionExample() {
  console.log('=== Example 10: Dynamic Injection ===\n');

  // Initial load
  await loadEnvironmentVariables({
    envFilePath: '.env',
    enableMasking: true,
  });

  console.log('Initial environment loaded');

  // Later, you might want to reload with different settings
  // For example, switching environments or updating secrets
  setTimeout(async () => {
    console.log('Reloading environment with new secrets...');

    const result = await loadEnvironmentVariables({
      envFilePath: '.env.updated',
      override: true, // Override previous values
      enableMasking: true,
    });

    console.log(`Reloaded ${result.loaded} variables`);
  }, 5000);
}

/**
 * Complete Application Example
 */
export async function completeApplicationExample() {
  console.log('=== Complete Application Example ===\n');

  // 1. Load environment variables with secrets
  console.log('1. Loading environment variables...');
  const loadResult = await loadEnvironmentVariables({
    envFilePath: process.env.ENV_FILE || '.env',
    environment: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
    override: false,
    throwOnMissing: true,
    enableMasking: true,
  });

  console.log(`   ✓ Loaded ${loadResult.loaded} variables`);
  console.log(`   ✓ Masked ${loadResult.masked} secrets`);

  // 2. Validate required variables
  console.log('2. Validating required variables...');
  const requiredVars = [
    'NODE_ENV',
    'PORT',
    'DATABASE_URL',
    'API_KEY',
    'GITHUB_TOKEN',
    'LINEAR_API_KEY',
  ];

  const validation = validateRequiredEnvVars(requiredVars);
  if (!validation.valid) {
    console.error(`   ✗ Missing: ${validation.missing.join(', ')}`);
    process.exit(1);
  }
  console.log('   ✓ All required variables present');

  // 3. Setup secret masking
  console.log('3. Setting up secret masking...');
  setupSecretMasking();
  console.log('   ✓ Console output will be masked');

  // 4. Display masked configuration
  console.log('4. Configuration summary:');
  const maskedEnv = getMaskedEnv();
  const configSummary = {
    environment: maskedEnv.NODE_ENV,
    port: maskedEnv.PORT,
    database: maskedEnv.DATABASE_URL, // Masked
    githubToken: maskedEnv.GITHUB_TOKEN, // Masked
    linearApiKey: maskedEnv.LINEAR_API_KEY, // Masked
  };
  console.log('   ', configSummary);

  // 5. Ready to start application
  console.log('\n✓ Environment initialization complete');
  console.log('✓ Application ready to start\n');
}

// Run examples if executed directly
if (require.main === module) {
  (async () => {
    try {
      // Uncomment the example you want to run:

      // await basicExample();
      // await secretInjectionExample();
      // await validationExample();
      // await customPatternsExample();
      // await environmentSpecificExample();
      await applicationStartupExample();
      // await fastifyIntegrationExample();
      // await testingSetupExample();
      // await errorHandlingExample();
      // await dynamicInjectionExample();
      // await completeApplicationExample();
    } catch (error) {
      console.error('Example failed:', error);
      process.exit(1);
    }
  })();
}
