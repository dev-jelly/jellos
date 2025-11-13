# GitHub Webhooks Integration

## Overview

The GitHub webhooks integration enables automatic synchronization of Pull Request (PR) status with issue states in the Jellos system. When PR events occur on GitHub (opened, merged, closed), the webhook endpoint receives these events and updates the corresponding issue-PR mappings and issue states.

## Features

- **Webhook Signature Verification**: HMAC-SHA256 signature verification for security
- **PR Event Processing**: Handles `pull_request` events (opened, reopened, closed, merged)
- **Automatic State Transitions**: Updates issue states based on PR status
- **Event Bus Integration**: Publishes state change events for downstream processing
- **Error Handling**: Comprehensive error handling and logging

## Architecture

```
GitHub PR Event
    ↓
GitHub Webhook (HTTPS)
    ↓
API Server: /api/webhooks/github
    ↓
Signature Verification
    ↓
GitHubWebhookService.processPullRequestEvent()
    ↓
┌─────────────────────────────────────────┐
│ 1. Find Issue-PR Mappings               │
│ 2. Update PR Mapping State              │
│ 3. Determine Issue State Transition     │
│ 4. Update Issue Status in Database      │
│ 5. Publish State Change Event           │
└─────────────────────────────────────────┘
    ↓
Event Bus → Downstream Subscribers
```

## Setup

### 1. Configure Environment Variables

Add the following to your `.env` file:

```bash
# GitHub webhook secret (generate a secure random string)
GITHUB_WEBHOOK_SECRET=your-secure-webhook-secret

# GitHub API credentials (required for PR operations)
GITHUB_TOKEN=your-github-token
GITHUB_OWNER=your-github-username-or-org
GITHUB_REPO=your-repository-name
```

### 2. Configure GitHub Webhook

1. Go to your GitHub repository settings
2. Navigate to **Settings** → **Webhooks** → **Add webhook**
3. Configure the webhook:
   - **Payload URL**: `https://your-domain.com/api/webhooks/github`
   - **Content type**: `application/json`
   - **Secret**: Use the same value as `GITHUB_WEBHOOK_SECRET`
   - **Events**: Select "Let me select individual events"
     - ✅ Pull requests
   - **Active**: ✅ Enabled

4. Click "Add webhook"

### 3. Verify Setup

Test the webhook health endpoint:

```bash
curl https://your-domain.com/api/webhooks/github/health
```

Expected response:

```json
{
  "status": "healthy",
  "webhookSecretConfigured": true,
  "supportedEvents": ["pull_request", "pull_request_review"]
}
```

## API Endpoints

### POST /api/webhooks/github

Receives GitHub webhook events for PR synchronization.

**Headers:**
- `X-GitHub-Event`: Event type (e.g., "pull_request")
- `X-Hub-Signature-256`: HMAC-SHA256 signature for verification
- `X-GitHub-Delivery`: Unique delivery ID (optional)
- `Content-Type`: application/json

**Request Body:**
GitHub webhook payload (varies by event type)

**Response:**

```json
{
  "success": true,
  "event": "pull_request",
  "action": "opened",
  "prNumber": 123,
  "processed": true,
  "message": "Updated 1 issue-PR mappings",
  "stateTransition": {
    "issueId": "abc123",
    "from": "IN_PROGRESS",
    "to": "IN_REVIEW"
  }
}
```

**Status Codes:**
- `200`: Success
- `401`: Invalid signature
- `400`: Invalid payload
- `500`: Internal server error

### GET /api/webhooks/github/health

Health check endpoint for webhook service.

**Response:**

```json
{
  "status": "healthy",
  "webhookSecretConfigured": true,
  "supportedEvents": ["pull_request", "pull_request_review"]
}
```

## PR Status to Issue State Mapping

| PR Action | PR State | Merged | Issue State Transition |
|-----------|----------|--------|------------------------|
| `opened` | open | false | TODO/IN_PROGRESS → IN_REVIEW |
| `reopened` | open | false | * → IN_REVIEW |
| `closed` | closed | false | IN_REVIEW → REJECTED |
| `closed` | closed | true | IN_REVIEW → MERGED |

*Other actions like `edited`, `synchronize`, `labeled` do not trigger state changes.*

## Security

### Signature Verification

All webhook requests are verified using HMAC-SHA256 signatures:

1. GitHub generates a signature using the configured webhook secret
2. Signature is sent in the `X-Hub-Signature-256` header
3. Server recomputes the signature and compares using constant-time comparison
4. Requests with invalid or missing signatures are rejected with 401 status

**Development Mode:**
If `GITHUB_WEBHOOK_SECRET` is not set, signature verification is skipped (with a warning). This is only suitable for local development.

### Best Practices

1. **Use HTTPS**: Always use HTTPS for webhook endpoints in production
2. **Strong Secret**: Generate a cryptographically secure random string for the webhook secret
3. **Rotate Secrets**: Periodically rotate webhook secrets
4. **Monitor Logs**: Monitor webhook logs for suspicious activity
5. **Rate Limiting**: Consider implementing rate limiting for webhook endpoints

## Event Flow

### PR Opened/Reopened

```
1. Developer creates/reopens PR on GitHub
2. GitHub sends "pull_request" webhook with action="opened"/"reopened"
3. Webhook service finds issue-PR mappings by PR number
4. Updates mapping state to "open"
5. Updates issue status to "IN_REVIEW"
6. Publishes "issue.state.changed" event to event bus
7. Returns success response to GitHub
```

### PR Merged

```
1. PR is merged on GitHub
2. GitHub sends "pull_request" webhook with action="closed", merged=true
3. Webhook service finds issue-PR mappings
4. Updates mapping state to "merged"
5. Sets mapping closedAt timestamp
6. Updates issue status to "MERGED"
7. Publishes "issue.state.changed" event to event bus
8. Returns success response to GitHub
```

### PR Closed (Not Merged)

```
1. PR is closed without merging
2. GitHub sends "pull_request" webhook with action="closed", merged=false
3. Webhook service finds issue-PR mappings
4. Updates mapping state to "closed"
5. Sets mapping closedAt timestamp
6. Updates issue status to "REJECTED"
7. Publishes "issue.state.changed" event to event bus
8. Returns success response to GitHub
```

## Error Handling

### No Mappings Found

If no issue-PR mappings exist for the PR number:
- Returns success (200) with `processed: false`
- Logs informational message
- Does not trigger any state changes

### Database Errors

If database operations fail:
- Returns error (500)
- Logs error details
- Does not update any states (atomic operation)

### Partial Failures

If multiple mappings exist and some fail:
- Continues processing remaining mappings
- Logs failed operations
- Returns success with details of processed mappings

## Monitoring and Debugging

### Log Levels

- **INFO**: Successful webhook processing
- **WARN**: Signature verification failures, configuration issues
- **ERROR**: Database errors, processing failures

### Example Logs

```
INFO: Received GitHub webhook {event: "pull_request", deliveryId: "abc-123"}
INFO: Successfully processed PR webhook {prNumber: 123, action: "merged", processed: true}
ERROR: Failed to process PR webhook {prNumber: 456, error: "Database connection failed"}
```

### Testing Webhooks Locally

Use GitHub's webhook testing tools:

1. Go to webhook settings in GitHub
2. Click "Recent Deliveries"
3. Select a delivery and click "Redeliver"
4. Check your local server logs

Or use a tool like [ngrok](https://ngrok.com/) to expose local server:

```bash
ngrok http 3001
# Use ngrok URL as webhook URL in GitHub
```

### Manual Testing

Create a test webhook payload:

```bash
# Generate signature
SECRET="your-webhook-secret"
PAYLOAD='{"action":"opened","number":123,...}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')

# Send request
curl -X POST https://your-domain.com/api/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
  -d "$PAYLOAD"
```

## Troubleshooting

### Webhook Signature Verification Failed

- **Cause**: Mismatch between GitHub secret and server secret
- **Solution**: Verify `GITHUB_WEBHOOK_SECRET` matches GitHub webhook settings

### No Mappings Found

- **Cause**: PR was created outside of Jellos workflow
- **Solution**: Create issue-PR mapping manually or via API before PR creation

### Issue State Not Updating

- **Cause**: Event bus not configured or downstream handlers failing
- **Solution**: Check event bus configuration and subscriber logs

### Webhook Not Receiving Events

- **Cause**: Network issues, firewall, or incorrect URL
- **Solution**:
  - Verify webhook URL is accessible from internet
  - Check GitHub webhook delivery logs
  - Ensure server is running and endpoint is registered

## Future Enhancements

- [ ] Support for `pull_request_review` events
- [ ] Support for PR comments and reviews
- [ ] Configurable state transition rules
- [ ] Webhook retry and queuing
- [ ] Webhook event replay for recovery
- [ ] Additional GitHub events (issues, comments)

## Related Documentation

- [PR Template Service](./pr-templates.md)
- [Issue-PR Mapping](./issue-pr-mapping.md)
- [Event Bus](../src/lib/event-bus/README.md)
- [GitHub Client Service](../src/services/github-client.README.md)
