import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create sample project
  const project = await prisma.project.upsert({
    where: { localPath: '/Users/sample/jellos-demo' },
    update: {},
    create: {
      name: 'Jellos Demo Project',
      localPath: '/Users/sample/jellos-demo',
      defaultBranch: 'main',
    },
  });

  console.log('✅ Created project:', project.name);

  // Create sample issues
  const issues = await Promise.all([
    prisma.issue.upsert({
      where: { id: 'sample-issue-1' },
      update: {},
      create: {
        id: 'sample-issue-1',
        projectId: project.id,
        title: 'Implement user authentication',
        description:
          'Add JWT-based authentication system with login and registration',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
      },
    }),
    prisma.issue.upsert({
      where: { id: 'sample-issue-2' },
      update: {},
      create: {
        id: 'sample-issue-2',
        projectId: project.id,
        title: 'Set up CI/CD pipeline',
        description: 'Configure GitHub Actions for automated testing and deployment',
        status: 'TODO',
        priority: 'MEDIUM',
      },
    }),
    prisma.issue.upsert({
      where: { id: 'sample-issue-3' },
      update: {},
      create: {
        id: 'sample-issue-3',
        projectId: project.id,
        title: 'Add dark mode support',
        description: 'Implement dark mode theme with user preference toggle',
        status: 'TODO',
        priority: 'LOW',
      },
    }),
  ]);

  console.log(`✅ Created ${issues.length} issues`);

  // Create sample worktree
  const worktree = await prisma.worktree.upsert({
    where: { branch: 'jellos/issue-1-user-auth' },
    update: {},
    create: {
      projectId: project.id,
      issueId: issues[0].id,
      path: '/Users/sample/jellos-demo-worktrees/issue-1-user-auth',
      branch: 'jellos/issue-1-user-auth',
      status: 'ACTIVE',
    },
  });

  console.log('✅ Created worktree:', worktree.branch);

  // Create sample code agent runtime
  const agent = await prisma.codeAgentRuntime.upsert({
    where: {
      projectId_externalId: {
        projectId: project.id,
        externalId: 'claude-code-v1',
      },
    },
    update: {},
    create: {
      projectId: project.id,
      externalId: 'claude-code-v1',
      label: 'Claude Code',
      cmd: 'claude',
      args: JSON.stringify(['--api-key', '$ANTHROPIC_API_KEY']),
      envMask: JSON.stringify(['ANTHROPIC_API_KEY']),
      version: '1.0.0',
      path: '/usr/local/bin/claude',
      healthStatus: 'healthy',
      enabled: true,
    },
  });

  console.log('✅ Created code agent runtime:', agent.label);

  // Create sample issue comment
  await prisma.issueComment.create({
    data: {
      issueId: issues[0].id,
      content:
        'Started working on this. Will implement JWT with refresh tokens.',
      author: 'developer@example.com',
    },
  });

  console.log('✅ Created sample comment');

  console.log('🎉 Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
