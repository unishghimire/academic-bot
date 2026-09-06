import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  TextChannel,
} from 'discord.js';
import { prisma } from '../../db/client.js';
import { env } from '../../config/env.js';
import { requirePremium } from '../middleware/permissions.js';
import { auditService } from '../../services/audit.service.js';
import {
  createSuccessEmbed,
  createWarningEmbed,
  createInfoEmbed,
} from '../../utils/embed-builder.js';

export const submitCommand = {
  data: new SlashCommandBuilder()
    .setName('submit')
    .setDescription('Submit coursework assignments or tier capstone projects for instructor evaluation')
    .addSubcommand(sub =>
      sub
        .setName('assignment')
        .setDescription('Submit your completed lesson assignment or practical video exercise')
        .addStringOption(opt =>
          opt
            .setName('lesson')
            .setDescription('Lesson ID, number, or title (e.g. "lesson_1" or "Module 1 Lesson 2")')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('submission_url')
            .setDescription('Link to your deliverables (YouTube, Loom, Google Drive, Vimeo, Figma, etc.)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('notes')
            .setDescription('Optional remarks, prompts used, AI tools leveraged, or questions')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('project')
        .setDescription('Submit your tier capstone project for evaluation and tier advancement')
        .addIntegerOption(opt =>
          opt
            .setName('tier')
            .setDescription('Tier level for this capstone project (1, 2, or 3)')
            .setRequired(true)
            .addChoices(
              { name: 'Tier 1: AI Video Ads Fundamentals', value: 1 },
              { name: 'Tier 2: Advanced AI Prompting & Workflows', value: 2 },
              { name: 'Tier 3: Agency Scale Campaigns & Mastery', value: 3 }
            )
        )
        .addStringOption(opt =>
          opt
            .setName('submission_url')
            .setDescription('Link to your capstone video project or deliverables folder')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('notes')
            .setDescription('Optional project brief, creative strategy, prompts, or breakdown')
            .setRequired(false)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const hasPremium = await requirePremium(interaction);
    if (!hasPremium) return;

    await interaction.deferReply({ ephemeral: true });

    const user = await prisma.user.findUnique({
      where: { discordId: interaction.user.id },
    });

    if (!user) {
      await interaction.editReply({
        embeds: [
          createWarningEmbed(
            'Account Not Linked',
            'Please connect your Academy account first using `/link` before submitting coursework.'
          ),
        ],
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'assignment') {
      await handleAssignmentSubmission(interaction, user);
    } else if (sub === 'project') {
      await handleProjectSubmission(interaction, user);
    }
  },
};

async function handleAssignmentSubmission(
  interaction: ChatInputCommandInteraction,
  user: { id: string; email: string; currentTier: number }
) {
  const lessonQuery = interaction.options.getString('lesson', true).trim();
  const rawUrl = interaction.options.getString('submission_url', true).trim();
  const notes = interaction.options.getString('notes')?.trim() || null;

  if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
    await interaction.editReply({
      embeds: [
        createWarningEmbed(
          'Invalid Submission URL',
          'Please provide a valid web link starting with `http://` or `https://` (e.g., Google Drive, YouTube, Loom, Vimeo, etc.).'
        ),
      ],
    });
    return;
  }

  // Find lesson by ID or title match
  const lesson = await prisma.lesson.findFirst({
    where: {
      OR: [
        { id: lessonQuery },
        { title: { contains: lessonQuery, mode: 'insensitive' } },
      ],
    },
    include: { assignment: true },
  });

  if (!lesson) {
    await interaction.editReply({
      embeds: [
        createWarningEmbed(
          'Lesson Not Found',
          `Could not locate a lesson matching **"${lessonQuery}"**.\n\n` +
          `Tip: Run \`/progress\` or \`/continue\` to see your active lessons and exact titles.`
        ),
      ],
    });
    return;
  }

  if (lesson.tier > user.currentTier) {
    await interaction.editReply({
      embeds: [
        createWarningEmbed(
          'Tier Locked',
          `This lesson belongs to **Tier ${lesson.tier}**, but your current level is **Tier ${user.currentTier}**.\n` +
          `Complete prerequisite lessons and projects to advance to this tier.`
        ),
      ],
    });
    return;
  }

  // Ensure an assignment record exists for this lesson
  let assignment = lesson.assignment;
  if (!assignment) {
    assignment = await prisma.assignment.create({
      data: {
        lessonId: lesson.id,
        title: `${lesson.title} Assignment`,
        requirements: ['Complete practical video assignment following the lesson specifications.'],
      },
    });
  }

  // Check existing submission
  const existing = await prisma.assignmentSubmission.findFirst({
    where: {
      userId: user.id,
      assignmentId: assignment.id,
    },
  });

  if (existing && existing.status === 'APPROVED') {
    await interaction.editReply({
      embeds: [
        createSuccessEmbed(
          'Already Approved',
          `Your assignment for **${lesson.title}** has already been evaluated and **APPROVED**! (+150 XP already awarded).`
        ),
      ],
    });
    return;
  }

  let submission;
  if (existing) {
    submission = await prisma.assignmentSubmission.update({
      where: { id: existing.id },
      data: {
        submissionUrl: rawUrl,
        notes,
        status: 'SUBMITTED',
        reviewedAt: null,
        reviewedBy: null,
        feedback: null,
      },
    });
  } else {
    submission = await prisma.assignmentSubmission.create({
      data: {
        userId: user.id,
        assignmentId: assignment.id,
        submissionUrl: rawUrl,
        notes,
        status: 'SUBMITTED',
      },
    });
  }

  // Audit log entry
  await auditService.log({
    actorType: 'USER',
    actorId: user.id,
    action: 'STUDENT_ASSIGNMENT_SUBMITTED',
    targetType: 'ASSIGNMENT_SUBMISSION',
    targetId: submission.id,
    reason: `Student submitted assignment for ${lesson.title}`,
    after: { submissionUrl: rawUrl, notes },
  });

  // Notify instructor-only review channel
  const alertChannelId = env.CHANNEL_ASSIGNMENT_REVIEWS || env.CHANNEL_AUDIT_LOGS || env.CHANNEL_SHOWCASE;
  if (alertChannelId) {
    try {
      const ch = await interaction.client.channels.fetch(alertChannelId).catch(() => null);
      if (ch && ch.isTextBased()) {
        const staffEmbed = createInfoEmbed(
          '📋 New Student Assignment Submission',
          `**Student:** <@${interaction.user.id}> (\`${user.email}\`)\n` +
          `**Lesson:** ${lesson.title} *(Tier ${lesson.tier}, Module ${lesson.module})*\n` +
          `**Deliverable URL:** [🔗 Open Student Deliverable](${rawUrl})\n` +
          (notes ? `**Student Notes / Tools:** *${notes}*\n` : '') +
          `\n**Instructor Review Command:**\n` +
          `\`\`\`\n/assignment-review submission_id:${submission.id} decision:Approve feedback:Great work!\n\`\`\``
        );
        await (ch as TextChannel).send({ embeds: [staffEmbed] }).catch(() => {});
      }
    } catch {
      // Non-blocking if channel notification fails
    }
  }

  const studentEmbed = createSuccessEmbed(
    'Assignment Submitted Successfully! 🎯',
    `Your submission for **${lesson.title}** has been recorded and queued for instructor evaluation.\n\n` +
    `• **Submission ID:** \`${submission.id}\`\n` +
    `• **Deliverable Link:** [Open Link](${rawUrl})\n` +
    (notes ? `• **Notes:** *${notes}*\n` : '') +
    `• **Reward upon Approval:** **+150 XP**\n\n` +
    `⏳ *Instructors review submissions regularly. Once approved, your lesson progress and XP will automatically update!*`
  );

  await interaction.editReply({ embeds: [studentEmbed] });
}

async function handleProjectSubmission(
  interaction: ChatInputCommandInteraction,
  user: { id: string; email: string; currentTier: number }
) {
  const tier = interaction.options.getInteger('tier', true);
  const rawUrl = interaction.options.getString('submission_url', true).trim();
  const notes = interaction.options.getString('notes')?.trim() || null;

  if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
    await interaction.editReply({
      embeds: [
        createWarningEmbed(
          'Invalid Submission URL',
          'Please provide a valid web link starting with `http://` or `https://` (e.g., Google Drive, YouTube, Loom, etc.).'
        ),
      ],
    });
    return;
  }

  if (tier > user.currentTier) {
    await interaction.editReply({
      embeds: [
        createWarningEmbed(
          'Tier Locked',
          `You cannot submit a Capstone Project for **Tier ${tier}** because your current level is **Tier ${user.currentTier}**.\n` +
          `Please complete the coursework for Tier ${user.currentTier} first.`
        ),
      ],
    });
    return;
  }

  // Find or create project for this tier
  let project = await prisma.project.findFirst({
    where: { tier },
  });

  if (!project) {
    const tierTitles: Record<number, string> = {
      1: 'Tier 1 Capstone: End-to-End AI Video Ad Campaign',
      2: 'Tier 2 Capstone: Advanced Multi-Angle Creative Testing Suite',
      3: 'Tier 3 Capstone: Agency Scale Campaign & Client Pitch',
    };

    project = await prisma.project.create({
      data: {
        tier,
        title: tierTitles[tier] || `Tier ${tier} Capstone Project`,
        requirements: ['Complete end-to-end video ad campaign with hooks, visual prompts, and creative analysis.'],
      },
    });
  }

  // Check existing submission
  const existing = await prisma.projectSubmission.findFirst({
    where: {
      userId: user.id,
      projectId: project.id,
    },
  });

  if (existing && existing.status === 'APPROVED') {
    await interaction.editReply({
      embeds: [
        createSuccessEmbed(
          'Project Already Approved',
          `Your Tier ${tier} Capstone Project was already evaluated and **APPROVED**! (+500 XP already earned).`
        ),
      ],
    });
    return;
  }

  let submission;
  if (existing) {
    submission = await prisma.projectSubmission.update({
      where: { id: existing.id },
      data: {
        submissionUrl: rawUrl,
        feedback: null,
        reviewedAt: null,
        reviewedBy: null,
        status: 'NEEDS_REVISION',
      },
    });
  } else {
    submission = await prisma.projectSubmission.create({
      data: {
        userId: user.id,
        projectId: project.id,
        submissionUrl: rawUrl,
        status: 'NEEDS_REVISION',
      },
    });
  }

  // Audit log entry
  await auditService.log({
    actorType: 'USER',
    actorId: user.id,
    action: 'STUDENT_PROJECT_SUBMITTED',
    targetType: 'PROJECT_SUBMISSION',
    targetId: submission.id,
    reason: `Student submitted Tier ${tier} capstone project`,
    after: { submissionUrl: rawUrl, notes },
  });

  // Notify instructor-only review channel
  const alertChannelId = env.CHANNEL_ASSIGNMENT_REVIEWS || env.CHANNEL_AUDIT_LOGS || env.CHANNEL_SHOWCASE;
  if (alertChannelId) {
    try {
      const ch = await interaction.client.channels.fetch(alertChannelId).catch(() => null);
      if (ch && ch.isTextBased()) {
        const staffEmbed = createInfoEmbed(
          '🏆 New Tier Capstone Project Submission',
          `**Student:** <@${interaction.user.id}> (\`${user.email}\`)\n` +
          `**Tier Level:** Tier ${tier} Capstone Project\n` +
          `**Deliverable URL:** [🔗 Open Project Deliverable](${rawUrl})\n` +
          (notes ? `**Strategy & Creative Breakdown:** *${notes}*\n` : '') +
          `\n**Instructor Evaluation Command:**\n` +
          `\`\`\`\n/project-review submission_id:${submission.id} decision:Approve feedback:Outstanding work!\n\`\`\``
        );
        await (ch as TextChannel).send({ embeds: [staffEmbed] }).catch(() => {});
      }
    } catch {
      // Non-blocking
    }
  }

  const studentEmbed = createSuccessEmbed(
    `Tier ${tier} Capstone Project Submitted! 🏆`,
    `Your capstone project has been submitted for instructor review.\n\n` +
    `• **Submission ID:** \`${submission.id}\`\n` +
    `• **Deliverables:** [Open Link](${rawUrl})\n` +
    (notes ? `• **Strategy Notes:** *${notes}*\n` : '') +
    `• **Reward upon Approval:** **+500 XP & Next Tier Role Unlock!**\n\n` +
    `🎉 *Our instructors evaluate capstone projects thoroughly. You will be notified when your evaluation is complete!*`
  );

  await interaction.editReply({ embeds: [studentEmbed] });
}
