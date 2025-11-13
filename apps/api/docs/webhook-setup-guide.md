# GitHub Webhook Setup Guide

This guide walks you through setting up GitHub webhooks for automatic PR status synchronization with Jellos.

## Prerequisites

- Jellos API server running and accessible from the internet
- GitHub repository with admin access
- HTTPS endpoint (required by GitHub)

## Step 1: Generate Webhook Secret

Generate a secure random secret for webhook signature verification:

```bash
# Using OpenSSL (recommended)
openssl rand -hex 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using Python
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Save this secret - you'll need it for both GitHub and your server configuration.

## Step 2: Configure Environment Variables

Add the webhook secret to your `.env` file:

```bash
# GitHub Webhook Configuration
GITHUB_WEBHOOK_SECRET=your-generated-secret-here

# Also ensure GitHub API credentials are set
GITHUB_TOKEN=ghp_your_github_token
GITHUB_OWNER=your-github-username-or-org
GITHUB_REPO=your-repository-name
```

## Step 3: Restart API Server

Restart your API server to load the new configuration:

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## Step 4: Verify Webhook Endpoint

Test that the webhook endpoint is accessible:

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

## Step 5: Configure GitHub Webhook

1. Navigate to your GitHub repository
2. Go to **Settings** → **Webhooks** → **Add webhook**

3. Configure webhook settings:

   **Payload URL:**
   ```
   https://your-domain.com/api/webhooks/github
   ```

   **Content type:**
   ```
   application/json
   ```

   **Secret:**
   ```
   [Paste the secret from Step 1]
   ```

   **SSL verification:**
   ```
   ✅ Enable SSL verification (recommended)
   ```

   **Which events would you like to trigger this webhook?**
   ```
   ○ Let me select individual events
   ✅ Pull requests
   ☐ Issues
   ☐ Push
   [Other events unchecked]
   ```

   **Active:**
   ```
   ✅ Active
   ```

4. Click **Add webhook**

## Step 6: Test Webhook

GitHub automatically sends a `ping` event when you create a webhook. Check the "Recent Deliveries" tab to verify:

1. Go to **Settings** → **Webhooks** → Click your webhook
2. Click **Recent Deliveries**
3. Look for a delivery with:
   - ✅ Green checkmark (success)
   - Response code: 200
   - Event: `ping`

## Step 7: Test with Real PR Event

Create a test PR to verify the integration:

1. Create a new branch:
   ```bash
   git checkout -b test/webhook-integration
   echo "test" > test.txt
   git add test.txt
   git commit -m "test: webhook integration"
   git push origin test/webhook-integration
   ```

2. Create a PR via the Jellos API (this creates the issue-PR mapping):
   ```bash
   curl -X POST https://your-domain.com/api/pull-requests \
     -H "Content-Type: application/json" \
     -d '{
       "issueId": "your-issue-id",
       "issueNumber": "ISSUE-123",
       "issueTitle": "Test Issue",
       "projectId": "your-project-id",
       "branchName": "test/webhook-integration",
       "baseBranch": "main"
     }'
   ```

3. Check webhook delivery in GitHub:
   - Go to **Settings** → **Webhooks** → Recent Deliveries
   - Look for `pull_request` event with action `opened`
   - Verify response code is 200

4. Check your API logs:
   ```bash
   # Look for webhook processing logs
   grep "webhook" /path/to/your/logs
   ```

   Expected log entries:
   ```
   INFO: Received GitHub webhook {event: "pull_request", deliveryId: "..."}
   INFO: Successfully processed PR webhook {prNumber: 123, action: "opened", processed: true}
   ```

5. Verify issue state was updated:
   ```bash
   curl https://your-domain.com/api/issues/your-issue-id
   ```

   Expected status: `IN_REVIEW`

## Troubleshooting

### Webhook Deliveries Failing with 401

**Problem:** GitHub shows 401 Unauthorized responses

**Solutions:**
1. Verify `GITHUB_WEBHOOK_SECRET` matches the secret in GitHub settings
2. Check server logs for signature verification errors
3. Regenerate secret and update both GitHub and server

### Webhook Deliveries Timing Out

**Problem:** GitHub shows timeout errors

**Solutions:**
1. Verify server is running and accessible
2. Check firewall rules
3. Ensure endpoint URL is correct
4. Check server logs for errors

### Webhook Received but No State Change

**Problem:** Webhook succeeds but issue state doesn't change

**Solutions:**
1. Verify issue-PR mapping exists:
   ```bash
   curl https://your-domain.com/api/issues/your-issue-id/pull-requests
   ```

2. Check server logs for processing errors
3. Verify database connection is working
4. Check event bus configuration

### SSL Verification Failed

**Problem:** GitHub can't verify SSL certificate

**Solutions:**
1. Ensure HTTPS is configured with valid certificate
2. Use services like Let's Encrypt for free SSL certificates
3. For development, use ngrok with HTTPS
4. Temporarily disable SSL verification (not recommended for production)

## Development Setup with ngrok

For local development, use ngrok to expose your local server:

1. Install ngrok:
   ```bash
   brew install ngrok  # macOS
   # or download from https://ngrok.com/download
   ```

2. Start your local API server:
   ```bash
   npm run dev
   ```

3. Start ngrok tunnel:
   ```bash
   ngrok http 3001
   ```

4. Use the ngrok HTTPS URL as your webhook URL:
   ```
   https://abc123.ngrok.io/api/webhooks/github
   ```

5. Remember to update webhook URL in GitHub settings when ngrok URL changes

## Security Best Practices

1. **Always use HTTPS** in production
2. **Use strong secrets** - minimum 32 bytes of random data
3. **Rotate secrets periodically** - update every 90 days
4. **Monitor webhook logs** - watch for suspicious activity
5. **Rate limit webhooks** - consider implementing rate limits
6. **Validate payloads** - webhook service validates all incoming data
7. **Keep secrets secure** - never commit to git, use environment variables

## Webhook Event Flow

```
┌─────────────────────────────────────────────────┐
│ Developer Actions on GitHub                      │
│ - Opens PR                                       │
│ - Merges PR                                      │
│ - Closes PR                                      │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│ GitHub Webhook System                            │
│ - Generates webhook event                        │
│ - Signs payload with HMAC-SHA256                │
│ - Sends POST to webhook URL                     │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│ Jellos API: /api/webhooks/github                │
│ 1. Verifies signature                           │
│ 2. Finds issue-PR mappings                      │
│ 3. Updates mapping state                        │
│ 4. Updates issue status                         │
│ 5. Publishes event to event bus                 │
│ 6. Returns 200 OK to GitHub                     │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│ System Updates                                   │
│ - Issue state: TODO → IN_REVIEW → MERGED        │
│ - PR mapping updated                             │
│ - State change events published                  │
│ - Downstream subscribers notified                │
└─────────────────────────────────────────────────┘
```

## Next Steps

After successfully setting up webhooks:

1. **Monitor webhook deliveries** in GitHub settings
2. **Check API logs** regularly for errors
3. **Set up alerts** for webhook failures
4. **Test edge cases** (force pushes, branch deletions, etc.)
5. **Document your setup** for team members
6. **Consider backup mechanisms** for missed webhook events

## Additional Resources

- [GitHub Webhooks Documentation](https://docs.github.com/en/developers/webhooks-and-events/webhooks)
- [GitHub Webhook Events](https://docs.github.com/en/developers/webhooks-and-events/webhook-events-and-payloads)
- [HMAC Signature Verification](https://docs.github.com/en/developers/webhooks-and-events/webhooks/securing-your-webhooks)
- [Jellos GitHub Webhooks API Documentation](./github-webhooks.md)
