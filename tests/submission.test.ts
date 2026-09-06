import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitCommand } from '../src/bot/commands/submission.commands.js';
import { prisma } from '../src/db/client.js';
import * as permissions from '../src/bot/middleware/permissions.js';

describe('Submission Commands (/submit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('correctly configures Discord slash command definition with assignment and project subcommands', () => {
    const json = submitCommand.data.toJSON();
    expect(json.name).toBe('submit');
    expect(json.options).toHaveLength(2);

    const subcommands = json.options?.map((opt: any) => opt.name);
    expect(subcommands).toContain('assignment');
    expect(subcommands).toContain('project');

    const assignmentSub = json.options?.find((opt: any) => opt.name === 'assignment') as any;
    const assignmentOptNames = assignmentSub.options.map((o: any) => o.name);
    expect(assignmentOptNames).toContain('lesson');
    expect(assignmentOptNames).toContain('submission_url');
    expect(assignmentOptNames).toContain('notes');

    const projectSub = json.options?.find((opt: any) => opt.name === 'project') as any;
    const projectOptNames = projectSub.options.map((o: any) => o.name);
    expect(projectOptNames).toContain('tier');
    expect(projectOptNames).toContain('submission_url');
    expect(projectOptNames).toContain('notes');
  });

  it('rejects submissions if student has not linked their Discord account', async () => {
    vi.spyOn(permissions, 'requirePremium').mockResolvedValue(true);
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);

    const mockInteraction: any = {
      user: { id: 'discord_unlinked_123' },
      deferReply: vi.fn().mockResolvedValue({}),
      editReply: vi.fn().mockResolvedValue({}),
      options: {
        getSubcommand: vi.fn().mockReturnValue('assignment'),
      },
    };

    await submitCommand.execute(mockInteraction);

    expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: expect.stringContaining('Account Not Linked'),
            }),
          }),
        ]),
      })
    );
  });

  it('rejects invalid submission URLs that lack http or https protocol', async () => {
    vi.spyOn(permissions, 'requirePremium').mockResolvedValue(true);
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'user_1',
      discordId: 'discord_123',
      email: 'student@example.com',
      currentTier: 1,
    } as any);

    const mockInteraction: any = {
      user: { id: 'discord_123' },
      deferReply: vi.fn().mockResolvedValue({}),
      editReply: vi.fn().mockResolvedValue({}),
      options: {
        getSubcommand: vi.fn().mockReturnValue('assignment'),
        getString: vi.fn((name: string) => {
          if (name === 'lesson') return 'lesson_1';
          if (name === 'submission_url') return 'ftp://invalid-url.com/file.mp4';
          return null;
        }),
      },
    };

    await submitCommand.execute(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: expect.stringContaining('Invalid Submission URL'),
            }),
          }),
        ]),
      })
    );
  });

  it('blocks assignment submission if lesson belongs to a locked tier', async () => {
    vi.spyOn(permissions, 'requirePremium').mockResolvedValue(true);
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'user_1',
      discordId: 'discord_123',
      email: 'student@example.com',
      currentTier: 1, // Student is Tier 1
    } as any);

    vi.spyOn(prisma.lesson, 'findFirst').mockResolvedValue({
      id: 'lesson_tier3_1',
      title: 'Agency Scale Media Buying',
      tier: 3, // Lesson requires Tier 3
      module: 1,
      orderIndex: 1,
    } as any);

    const mockInteraction: any = {
      user: { id: 'discord_123' },
      deferReply: vi.fn().mockResolvedValue({}),
      editReply: vi.fn().mockResolvedValue({}),
      options: {
        getSubcommand: vi.fn().mockReturnValue('assignment'),
        getString: vi.fn((name: string) => {
          if (name === 'lesson') return 'lesson_tier3_1';
          if (name === 'submission_url') return 'https://youtube.com/watch?v=sample';
          return null;
        }),
      },
    };

    await submitCommand.execute(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: expect.stringContaining('Tier Locked'),
            }),
          }),
        ]),
      })
    );
  });

  it('records assignment submission and returns confirmation embed with submission ID', async () => {
    vi.spyOn(permissions, 'requirePremium').mockResolvedValue(true);
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'user_1',
      discordId: 'discord_123',
      email: 'student@example.com',
      currentTier: 2,
    } as any);

    vi.spyOn(prisma.lesson, 'findFirst').mockResolvedValue({
      id: 'lesson_10',
      title: 'Hook Writing Masterclass',
      tier: 1,
      module: 2,
      orderIndex: 1,
      assignment: { id: 'asgn_1', title: 'Hook Assignment' },
    } as any);

    vi.spyOn(prisma.assignmentSubmission, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.assignmentSubmission, 'create').mockResolvedValue({
      id: 'sub_test_999',
      userId: 'user_1',
      assignmentId: 'asgn_1',
      submissionUrl: 'https://loom.com/share/test123',
      status: 'SUBMITTED',
    } as any);

    const mockInteraction: any = {
      user: { id: 'discord_123' },
      client: { channels: { fetch: vi.fn().mockResolvedValue(null) } },
      deferReply: vi.fn().mockResolvedValue({}),
      editReply: vi.fn().mockResolvedValue({}),
      options: {
        getSubcommand: vi.fn().mockReturnValue('assignment'),
        getString: vi.fn((name: string) => {
          if (name === 'lesson') return 'lesson_10';
          if (name === 'submission_url') return 'https://loom.com/share/test123';
          if (name === 'notes') return 'Used Midjourney v6 for initial storyboards';
          return null;
        }),
      },
    };

    await submitCommand.execute(mockInteraction);

    expect(prisma.assignmentSubmission.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        assignmentId: 'asgn_1',
        submissionUrl: 'https://loom.com/share/test123',
        notes: 'Used Midjourney v6 for initial storyboards',
        status: 'SUBMITTED',
      },
    });

    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: expect.stringContaining('Assignment Submitted Successfully'),
              description: expect.stringContaining('sub_test_999'),
            }),
          }),
        ]),
      })
    );
  });
});
