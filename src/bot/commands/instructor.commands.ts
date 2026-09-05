import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../db/client.js';
import { requireInstructor } from '../middleware/permissions.js';
import { progressService } from '../../services/progress.service.js';
import { tierEngine } from '../../services/tier-engine.service.js';
import { roleSyncService } from '../../services/role-sync.service.js';
import { xpService } from '../../services/xp.service.js';
import { auditService } from '../../services/audit.service.js';
import { createSuccessEmbed, createWarningEmbed, createInfoEmbed } from '../../utils/embed-builder.js';
import { AssignmentStatus, ProjectStatus } from '@prisma/client';
import { XP_REWARDS } from '../../config/constants.js';

export const assignmentReviewCommand = {
  data: new SlashCommandBuilder()
    .setName('assignment-review')
    .setDescription('Review and grade a student assignment submission')
    .addStringOption(opt => opt.setName('submission_id').setDescription('Assignment Submission ID').setRequired(true))
    .addStringOption(opt =>
      opt
        .setName('decision')
        .setDescription('Grading decision')
        .setRequired(true)
        .addChoices(
          { name: 'Approve (+150 XP)', value: 'APPROVED' },
          { name: 'Reject (Needs Work)', value: 'REJECTED' }
        )
    )
    .addStringOption(opt => opt.setName('feedback').setDescription('Constructive feedback for student').setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    const isAllowed = await requireInstructor(interaction);
    if (!isAllowed) return;

    await interaction.deferReply({ ephemeral: true });

    const submissionId = interaction.options.getString('submission_id', true);
    const decision = interaction.options.getString('decision', true) as AssignmentStatus;
    const feedback = interaction.options.getString('feedback', true);

    const submission = await prisma.assignmentSubmission.findUnique({
      where: { id: submissionId },
      include: { assignment: true, user: true },
    });

    if (!submission) {
      await interaction.editReply({
        embeds: [createWarningEmbed('Submission Not Found', `No assignment submission with ID \`${submissionId}\`.`)],
      });
      return;
    }

    const previousStatus = submission.status;

    await prisma.assignmentSubmission.update({
      where: { id: submissionId },
      data: {
        status: decision,
        reviewedBy: interaction.user.id,
        reviewedAt: new Date(),
        feedback,
      },
    });

    await auditService.log({
      actorType: 'ADMIN',
      actorId: interaction.user.id,
      action: 'INSTRUCTOR_ASSIGNMENT_REVIEW',
      targetType: 'ASSIGNMENT_SUBMISSION',
      targetId: submissionId,
      reason: `Instructor reviewed assignment for student ${submission.user.email}`,
      before: { status: previousStatus },
      after: { status: decision, feedback },
    });

    if (decision === 'APPROVED') {
      await xpService.awardXp(
        submission.userId,
        XP_REWARDS.ASSIGNMENT_APPROVED,
        `Assignment Approved: ${submission.assignment.title}`,
        'assignment',
        submissionId
      );

      // Re-evaluate lesson completion
      await progressService.evaluateLessonCompletion(submission.userId, submission.assignment.lessonId);
    }

    await interaction.editReply({
      embeds: [
        createSuccessEmbed(
          'Assignment Review Recorded',
          `Submission \`${submissionId}\` marked as **${decision}**.\nFeedback: *${feedback}*`
        ),
      ],
    });
  },
};

export const projectReviewCommand = {
  data: new SlashCommandBuilder()
    .setName('project-review')
    .setDescription('Review and evaluate a tier capstone project')
    .addStringOption(opt => opt.setName('submission_id').setDescription('Project Submission ID').setRequired(true))
    .addStringOption(opt =>
      opt
        .setName('decision')
        .setDescription('Grading decision')
        .setRequired(true)
        .addChoices(
          { name: 'Approve (+500 XP)', value: 'APPROVED' },
          { name: 'Needs Revision', value: 'NEEDS_REVISION' },
          { name: 'Reject', value: 'REJECTED' }
        )
    )
    .addStringOption(opt => opt.setName('feedback').setDescription('Feedback for student').setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    const isAllowed = await requireInstructor(interaction);
    if (!isAllowed) return;

    await interaction.deferReply({ ephemeral: true });

    const submissionId = interaction.options.getString('submission_id', true);
    const decision = interaction.options.getString('decision', true) as ProjectStatus;
    const feedback = interaction.options.getString('feedback', true);

    const submission = await prisma.projectSubmission.findUnique({
      where: { id: submissionId },
      include: { project: true, user: true },
    });

    if (!submission) {
      await interaction.editReply({
        embeds: [createWarningEmbed('Not Found', `No project submission with ID \`${submissionId}\`.`)],
      });
      return;
    }

    await prisma.projectSubmission.update({
      where: { id: submissionId },
      data: {
        status: decision,
        reviewedBy: interaction.user.id,
        reviewedAt: new Date(),
        feedback,
      },
    });

    await auditService.log({
      actorType: 'ADMIN',
      actorId: interaction.user.id,
      action: 'INSTRUCTOR_PROJECT_REVIEW',
      targetType: 'PROJECT_SUBMISSION',
      targetId: submissionId,
      reason: `Project review decision: ${decision}`,
      after: { decision, feedback },
    });

    if (decision === 'APPROVED') {
      await xpService.awardXp(
        submission.userId,
        XP_REWARDS.PROJECT_APPROVED,
        `Tier ${submission.project.tier} Final Project Approved!`,
        'project',
        submissionId
      );

      // Trigger central Tier Unlock Engine!
      const tierResult = await tierEngine.evaluateTier(submission.userId);

      // If a new tier was unlocked, trigger role sync immediately
      if (tierResult.unlocked) {
        await roleSyncService.syncUserRoles(submission.userId, interaction.client);
      }
    }

    await interaction.editReply({
      embeds: [
        createSuccessEmbed(
          'Project Evaluation Submitted',
          `Student: <@${submission.user.discordId || submission.userId}>\n` +
          `Project: Tier ${submission.project.tier} Capstone\n` +
          `Status: **${decision}**\n` +
          `Feedback: *${feedback}*`
        ),
      ],
    });
  },
};

export const studentProgressCommand = {
  data: new SlashCommandBuilder()
    .setName('student-progress')
    .setDescription('Look up detailed progress and metrics for a student')
    .addUserOption(opt => opt.setName('student').setDescription('Select Discord user').setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    const isAllowed = await requireInstructor(interaction);
    if (!isAllowed) return;

    await interaction.deferReply({ ephemeral: true });

    const targetDiscordUser = interaction.options.getUser('student', true);

    const user = await prisma.user.findUnique({
      where: { discordId: targetDiscordUser.id },
    });

    if (!user) {
      await interaction.editReply({
        embeds: [createWarningEmbed('Student Not Found', 'This Discord user has not linked an Academy account.')],
      });
      return;
    }

    const summary = await progressService.getUserProgressSummary(user.id);

    const embed = createInfoEmbed(
      `📊 Student Profile: ${targetDiscordUser.tag}`,
      `**Email:** \`${user.email}\`\n` +
      `**Subscription Status:** \`${user.subscriptionStatus}\`\n` +
      `**Tier:** **Tier ${user.currentTier}**\n` +
      `**Total XP:** **${summary.totalXp.toLocaleString()} XP**\n` +
      `**Streak:** 🔥 **${summary.streakCount} day(s)**\n` +
      `**Overall Progress:** **${summary.overallPercentage}%** (${summary.totalCompleted}/${summary.totalLessons} lessons)\n\n` +
      `**Tier Completion:**\n` +
      summary.tierStats
        .map(ts => `• Tier ${ts.tier}: ${ts.percentage}% (${ts.completedLessons}/${ts.totalLessons})`)
        .join('\n')
    );

    await interaction.editReply({ embeds: [embed] });
  },
};
