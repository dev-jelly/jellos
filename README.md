# Jellos

> Development workflow automation platform

A modern monorepo platform that streamlines development workflows through intelligent agent orchestration, real-time event streaming, and comprehensive state management.

## Features

### Core Capabilities

- **Agent Orchestration**: Discover and manage development agents (Claude Code, Playwright, etc.) with configurable hooks and commands
- **Real-time Event Streaming**: Server-Sent Events (SSE) based streaming for live execution monitoring
- **State Management**: Finite State Machine (FSM) architecture for robust execution tracking
- **GitHub & Linear Integration**: Seamless integration with GitHub PRs and Linear issue tracking
- **Git Worktree Management**: Automated worktree creation with post-creation hooks
- **Health Monitoring**: Kubernetes-style liveness and readiness probes

### Platform Architecture

- **API Server**: Fastify 5 with TypeScript, Prisma ORM, and SSE support
- **Web Interface**: Next.js 15 with React 19, App Router, and Server Actions
- **Monorepo**: PNPM workspaces with Turborepo for optimized builds

## Quick Start

### Prerequisites

- Node.js >= 22.11.0 (Jod LTS)
- PNPM >= 9.0.0
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/dev-jelly/jellos.git
cd jellos

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
cp apps/api/.env.example apps/api/.env

# Generate Prisma client
pnpm --filter @jellos/api db:generate

# Run database migrations
pnpm --filter @jellos/api db:migrate:dev
```

### Development

```bash
# Start both web and API in dev mode
pnpm dev

# Start individual apps
pnpm --filter @jellos/web dev
pnpm --filter @jellos/api dev

# Build all apps
pnpm build

# Run tests
pnpm test

# Lint and format
pnpm lint
pnpm format
```

The web app will be available at `http://localhost:3000` and the API at `http://localhost:3001`.

## Project Structure

```
jellos/
├── apps/
│   ├── api/                    # Fastify API server
│   │   ├── docs/              # API documentation
│   │   ├── prisma/            # Database schema and migrations
│   │   └── src/
│   │       ├── lib/           # Core libraries
│   │       │   ├── agent-discovery/  # Agent config parsing
│   │       │   ├── diagnostics/      # Health checks
│   │       │   ├── logger/           # Logging utilities
│   │       │   ├── process/          # Process management
│   │       │   └── secrets/          # Secret management
│   │       ├── plugins/       # Fastify plugins
│   │       ├── repositories/  # Data access layer
│   │       ├── routes/        # API endpoints
│   │       ├── services/      # Business logic
│   │       ├── types/         # TypeScript types
│   │       └── validators/    # Request validation
│   └── web/                    # Next.js web application
│       ├── app/               # App Router pages
│       ├── components/        # React components
│       └── lib/               # Client utilities
├── packages/
│   ├── eslint-config/         # Shared ESLint configuration
│   └── typescript-config/     # Shared TypeScript configuration
└── .taskmaster/               # Task Master AI integration
```

## Configuration

### Agent Discovery

Create a `.jellos.yml` file to configure agents and external tool integrations:

```yaml
agents:
  - id: claude-code
    name: Claude Code
    command: claude
    enabled: true

links:
  github:
    baseUrl: "https://github.com/your-org/your-repo"
    prTemplate: "{baseUrl}/pull/{number}"

  linear:
    baseUrl: "https://linear.app/your-workspace"
    issueTemplate: "{baseUrl}/issue/{id}"
```

See `.jellos.example.yml` for a complete example.

### Environment Variables

Required environment variables:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/jellos"

# GitHub
GITHUB_TOKEN="your_github_token"

# Linear
LINEAR_API_KEY="your_linear_api_key"

# Redis (optional)
REDIS_URL="redis://localhost:6379"
```

## API Documentation

### Health Endpoints

- `GET /health/healthz` - Liveness probe (always returns 200)
- `GET /health/readyz` - Readiness probe (checks dependencies)
- `GET /health/startup` - Startup probe (one-time initialization check)

### Agent Execution

- `POST /agents/execute` - Execute an agent with SSE streaming
- `GET /agents/status/:id` - Get execution status
- `GET /agents/history` - View execution history

### GitHub & Linear Integration

- `POST /projects/sync` - Sync GitHub PRs with Linear issues
- `GET /projects/:id/status` - Get project status

## Development Workflow

### Task Master Integration

This project uses [Task Master AI](https://www.npmjs.com/package/task-master-ai) for task management:

```bash
# View all tasks
task-master list

# Get next available task
task-master next

# View task details
task-master show 1.1

# Mark task as complete
task-master set-status --id=1.1 --status=done
```

See `.taskmaster/CLAUDE.md` for detailed integration guide.

### Git Workflow

```bash
# Create a worktree for a new feature
git worktree add ../jellos-feature feature/new-feature

# The API includes a worktree CLI tool
pnpm --filter @jellos/api build
./apps/api/dist/cli/worktrees.cli.js create feature/my-feature
```

### Commit Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```bash
feat: add new feature
fix: resolve bug
docs: update documentation
refactor: refactor code
test: add tests
chore: update dependencies
```

Commits are validated using commitlint and husky hooks.

## Testing

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm --filter @jellos/api test:coverage

# Run tests in watch mode
pnpm --filter @jellos/web test:watch
```

## Deployment

### Build for Production

```bash
# Build all apps
pnpm build

# Start in production mode
pnpm --filter @jellos/api start
pnpm --filter @jellos/web start
```

### Docker (Coming Soon)

Docker support is planned for future releases.

### Environment Configuration

For production deployments:

1. Set `NODE_ENV=production`
2. Configure production database
3. Set up Redis for caching
4. Configure GitHub and Linear API keys
5. Run database migrations

## Architecture

### State Management

The platform uses a Finite State Machine (FSM) for execution state tracking:

- **States**: `idle`, `pending`, `running`, `completed`, `failed`, `cancelled`
- **Transitions**: Validated state transitions with rollback support
- **History**: Complete state history tracking in database

See `apps/api/docs/fsm-design.md` for detailed FSM documentation.

### Permission Model

The process execution system includes a comprehensive permission model:

- Profile-based permissions (restrictive, standard, permissive)
- Command validation and auditing
- Permission logging and diagnostics

See `apps/api/src/lib/process/PERMISSION_MODEL.md` for details.

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and add tests
4. Ensure tests pass: `pnpm test`
5. Ensure linting passes: `pnpm lint`
6. Commit using conventional commits
7. Push to your fork and create a Pull Request

## Technology Stack

### Backend

- **Framework**: Fastify 5
- **Language**: TypeScript 5.7
- **ORM**: Prisma
- **Database**: PostgreSQL + SQLite (dev)
- **Cache**: Redis (optional)
- **Validation**: Zod
- **Logging**: Pino

### Frontend

- **Framework**: Next.js 15
- **React**: React 19
- **Styling**: Tailwind CSS 4
- **UI Components**: @heroicons/react
- **Drag & Drop**: @dnd-kit
- **Virtualization**: virtua

### Development

- **Monorepo**: PNPM workspaces
- **Build**: Turborepo
- **Testing**: Vitest + Jest
- **Linting**: ESLint 9
- **Formatting**: Prettier
- **Git Hooks**: Husky + lint-staged
- **Commit Linting**: commitlint

### External Integrations

- **GitHub**: @octokit/rest
- **Linear**: @linear/sdk
- **Task Management**: Task Master AI

## License

MIT License - see [LICENSE](LICENSE) file for details

## Acknowledgments

- Built with [Task Master AI](https://www.npmjs.com/package/task-master-ai)
- Powered by [Claude Code](https://claude.com/claude-code)

## Support

- **Documentation**: See `/apps/api/docs/` for detailed API documentation
- **Issues**: [GitHub Issues](https://github.com/dev-jelly/jellos/issues)
- **Discussions**: [GitHub Discussions](https://github.com/dev-jelly/jellos/discussions)

---

**Status**: Active Development

This project is currently in active development. APIs and features may change.
