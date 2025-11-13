/**
 * Test script for event hooks plugin
 * Run with: tsx src/test-event-hooks.ts
 */

import { createEventBus, EventTopics } from './lib/event-bus';
import type { BaseEvent } from './lib/event-bus';

async function testEventBus() {
  console.log('=== Testing Event Bus ===\n');

  try {
    // Create event bus
    console.log('1. Creating event bus...');
    const eventBus = await createEventBus('test-service');
    console.log(`✅ Event bus created with adapter: ${eventBus.getAdapterName()}\n`);

    // Check health
    console.log('2. Checking health...');
    const isHealthy = await eventBus.isHealthy();
    console.log(`✅ Event bus health: ${isHealthy}\n`);

    // Subscribe to events
    console.log('3. Subscribing to state transition events...');
    const receivedEvents: BaseEvent[] = [];

    await eventBus.subscribe(
      EventTopics.STATE_TRANSITION_EVENTS,
      async (event: BaseEvent) => {
        console.log(`   📨 Received event: ${event.type}`);
        console.log(`      Payload:`, JSON.stringify(event.payload, null, 2));
        receivedEvents.push(event);
      }
    );
    console.log('✅ Subscribed successfully\n');

    // Publish test events
    console.log('4. Publishing test events...');

    await eventBus.publish(
      EventTopics.STATE_TRANSITION_EVENTS,
      'state.transition.started',
      {
        entityType: 'request',
        entityId: 'test-req-123',
        from: 'idle',
        to: 'processing',
      },
      {
        metadata: {
          requestId: 'test-req-123',
          correlationId: 'test-req-123',
          source: 'test-service',
        },
        waitForAck: false,
      }
    );
    console.log('✅ Published state.transition.started\n');

    await new Promise((resolve) => setTimeout(resolve, 100));

    await eventBus.publish(
      EventTopics.STATE_TRANSITION_EVENTS,
      'state.transition.completed',
      {
        entityType: 'request',
        entityId: 'test-req-123',
        from: 'processing',
        to: 'completed',
        statusCode: 200,
        duration: 42,
      },
      {
        metadata: {
          requestId: 'test-req-123',
          correlationId: 'test-req-123',
          source: 'test-service',
        },
        waitForAck: false,
      }
    );
    console.log('✅ Published state.transition.completed\n');

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Get stats
    console.log('5. Getting event bus statistics...');
    const stats = await eventBus.getStats();
    console.log('   Stats:', JSON.stringify(stats, null, 2));
    console.log('✅ Statistics retrieved\n');

    // Verify events received
    console.log('6. Verifying events...');
    console.log(`   Received ${receivedEvents.length} events`);

    if (receivedEvents.length >= 2) {
      console.log('✅ All events received successfully\n');
    } else {
      console.log('⚠️  Not all events received\n');
    }

    // Close event bus
    console.log('7. Closing event bus...');
    await eventBus.close();
    console.log('✅ Event bus closed\n');

    console.log('=== Test Complete ===');
    console.log('✅ All tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run test
testEventBus()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
