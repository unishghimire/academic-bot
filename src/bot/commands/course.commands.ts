import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../db/client.js';
import { progressService } from '../../services/progress.service.js';
import { createInfoEmbed, createWarningEmbed, createSuccessEmbed } from '../../utils/embed-builder.js';

export const courseCommand = {
  data: new SlashCommandBuilder()
    .setName('course')
    .setDescription('Access lessons, resources, quizzes, and prompt packs')
    .addSubcommand(sub =>
      sub
        .setName('lesson')
        .setDescription('View a specific lesson and access downloadable resources')
        .addStringOption(opt =>
          opt.setName('lesson_id').setDescription('Lesson ID or title search').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('complete')
        .setDescription('Mark that you have watched/studied this lesson')
        .addStringOption(opt =>
          opt.setName('lesson').setDescription('Lesson ID or title').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('quiz')
        .setDescription('Check quiz requirements and launch quiz on portal')
        .addStringOption(opt =>
          opt.setName('lesson_id').setDescription('Lesson ID').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('next')
        .setDescription('Jump to your next lesson in sequence')
    )
    .addSubcommand(sub =>
      sub
        .setName('assignment')
        .setDescription('Check assignment requirements and submission status for a lesson')
        .addStringOption(opt =>
          opt.setName('lesson').setDescription('Lesson ID or title').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('project')
        .setDescription('Check capstone project requirements and evaluation status')
        .addIntegerOption(opt =>
          opt
            .setName('tier')
            .setDescription('Tier level (1, 2, or 3)')
            .setRequired(true)
            .addChoices(
              { name: 'Tier 1: AI Video Ads Fundamentals', value: 1 },
              { name: 'Tier 2: Advanced AI Prompting & Workflows', value: 2 },
              { name: 'Tier 3: Agency Scale Campaigns & Mastery', value: 3 }
            )
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const user = await prisma.user.findUnique({
      where: { discordId: interaction.user.id },
    });

    if (!user) {
      await interaction.editReply({
        embeds: [createWarningEmbed('Not Linked', 'Please run `/link` first.')],
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'lesson') {
      const lessonQuery = interaction.options.getString('lesson_id', true);
      const lesson = await prisma.lesson.findFirst({
        where: {
          OR: [
            { id: lessonQuery },
            { title: { contains: lessonQuery, mode: 'insensitive' } },
          ],
        },
      });

      if (!lesson) {
        await interaction.editReply({
          embeds: [createWarningEmbed('Lesson Not Found', `No lesson matches "${lessonQuery}".`)],
        });
        return;
      }

      if (lesson.tier > user.currentTier) {
        await interaction.editReply({
          embeds: [createWarningEmbed('Tier Locked', `This lesson requires **Tier ${lesson.tier}**. You are currently at **Tier ${user.currentTier}**. Complete prerequisite projects to unlock.`)],
        });
        return;
      }

      // Auto-record lesson access in database
      await prisma.lessonProgress.upsert({
        where: { userId_lessonId: { userId: user.id, lessonId: lesson.id } },
        create: {
          userId: user.id,
          lessonId: lesson.id,
          watchPercent: 100,
          videoCompleted: true,
        },
        update: {
          watchPercent: 100,
          videoCompleted: true,
        },
      });

      const videoLink = lesson.videoUrl
        ? `[Watch Lesson Video](${lesson.videoUrl})`
        : `Check the video upload in **#tier-${lesson.tier}-lessons**`;

      const docLink = lesson.notesUrl
        ? `[View Lesson Document](${lesson.notesUrl})`
        : `Check the pinned docs in **#tier-${lesson.tier}-resources**`;

      const promptLink = lesson.promptPackUrl
        ? `[Download AI Prompt Pack](${lesson.promptPackUrl})`
        : '*None*';

      const nextAction = lesson.requiresAssignment
        ? `\n\n📌 **Next Step — Assignment Required:**\nSubmit your video ad work via: \`/submit assignment lesson:${lesson.id} submission_url:<link>\``
        : `\n\n✅ Finished studying? Run \`/course complete lesson:${lesson.id}\` to claim your +100 XP!`;

      const embed = createInfoEmbed(
        `📚 Lesson: ${lesson.title}`,
        `**Tier ${lesson.tier} • Module ${lesson.module} • Order ${lesson.orderIndex}**\n\n` +
        `${lesson.description}\n\n` +
        `**Lesson Materials:**\n` +
        `• 🎬 **Video:** ${videoLink}\n` +
        `• 📄 **Docs & Notes:** ${docLink}\n` +
        `• 📦 **Resource Assets:** ${lesson.resourcesUrl ? `[Download Assets](${lesson.resourcesUrl})` : '*None*'}\n` +
        `• 🤖 **AI Prompt Pack:** ${promptLink}` +
        nextAction
      );

      await interaction.editReply({ embeds: [embed] });
    } else if (sub === 'complete') {
      const lessonQuery = interaction.options.getString('lesson', true);
      const lesson = await prisma.lesson.findFirst({
        where: {
          OR: [
            { id: lessonQuery },
            { title: { contains: lessonQuery, mode: 'insensitive' } },
          ],
        },
      });

      if (!lesson) {
        await interaction.editReply({
          embeds: [createWarningEmbed('Lesson Not Found', `No lesson matches "${lessonQuery}".`)],
        });
        return;
      }

      await prisma.lessonProgress.upsert({
        where: { userId_lessonId: { userId: user.id, lessonId: lesson.id } },
        create: {
          userId: user.id,
          lessonId: lesson.id,
          watchPercent: 100,
          videoCompleted: true,
        },
        update: {
          watchPercent: 100,
          videoCompleted: true,
        },
      });

      const result = await progressService.evaluateLessonCompletion(user.id, lesson.id);

      if (result.completed) {
        await interaction.editReply({
          embeds: [
            createSuccessEmbed(
              'Lesson Completed! 🎉',
              `You have completed **${lesson.title}**!\n\n` +
              `• **XP Earned:** **+${result.xpAwarded || 100} XP**\n` +
              `• **Status:** ✅ 100% Completed\n\n` +
              `Run \`/course next\` to proceed to your next lesson!`
            ),
          ],
        });
      } else if (lesson.requiresAssignment) {
        await interaction.editReply({
          embeds: [
            createInfoEmbed(
              'Study Progress Saved 📝',
              `You marked the video/docs for **${lesson.title}** as studied!\n\n` +
              `To finish this lesson, submit your practical assignment:\n` +
              `👉 \`/submit assignment lesson:${lesson.id} submission_url:<link-to-deliverable>\``
            ),
          ],
        });
      } else {
        await interaction.editReply({
          embeds: [
            createSuccessEmbed(
              'Lesson Completed! 🎉',
              `You have finished **${lesson.title}**!\n\n` +
              `Run \`/course next\` to continue your training!`
            ),
          ],
        });
      }
    } else if (sub === 'quiz') {
      const lessonId = interaction.options.getString('lesson_id', true);
      const quiz = await prisma.quiz.findFirst({
        where: {
          OR: [{ lessonId }, { id: lessonId }],
        },
        include: { lesson: true },
      });

      if (!quiz) {
        await interaction.editReply({
          embeds: [createWarningEmbed('Quiz Not Found', 'No interactive quiz is configured for this lesson.')],
        });
        return;
      }

      const attempt = await prisma.quizAttempt.findFirst({
        where: { userId: user.id, quizId: quiz.id, passed: true },
      });

      const embed = createInfoEmbed(
        `📝 Quiz: ${quiz.lesson.title}`,
        `**Passing Score:** ${quiz.passingScore}%\n` +
        `**Attempt Limit:** ${quiz.attemptLimit} attempts\n` +
        `**Your Status:** ${attempt ? '✅ Passed' : '⏳ Pending'}\n\n` +
        `👉 In this academy, all evaluations are practical deliverables.\n` +
        `Submit your work directly with: \`/submit assignment lesson:${quiz.lessonId} submission_url:<link>\``
      );

      await interaction.editReply({ embeds: [embed] });
    } else if (sub === 'next') {
      // Re-use next lesson logic
      const completed = await prisma.lessonProgress.findMany({
        where: { userId: user.id, completed: true },
        select: { lessonId: true },
      });
      const completedIds = new Set(completed.map(c => c.lessonId));

      const nextLesson = await prisma.lesson.findFirst({
        where: {
          tier: { lte: user.currentTier },
          id: { notIn: Array.from(completedIds) },
        },
        orderBy: [{ tier: 'asc' }, { module: 'asc' }, { orderIndex: 'asc' }],
      });

      if (!nextLesson) {
        await interaction.editReply({
          embeds: [createSuccessEmbed('Tier Completed', 'You have completed all available lessons for your current tier!')],
        });
        return;
      }

      const embed = createInfoEmbed(
        `▶️ Next Up: ${nextLesson.title}`,
        `**Tier ${nextLesson.tier} • Module ${nextLesson.module} • Lesson ${nextLesson.orderIndex}**\n\n` +
        `${nextLesson.description}\n\n` +
        `👉 **Access Materials in Discord:**\n` +
        `• 🎬 Video upload: **#tier-${nextLesson.tier}-lessons**\n` +
        `• 📄 Lesson docs: **#tier-${nextLesson.tier}-resources**\n\n` +
        `Run \`/course lesson lesson_id:${nextLesson.id}\` to view full details and mark progress!`
      );

      await interaction.editReply({ embeds: [embed] });
    } else if (sub === 'assignment') {
      const lessonQuery = interaction.options.getString('lesson', true);
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
          embeds: [createWarningEmbed('Lesson Not Found', `No lesson matches "${lessonQuery}".`)],
        });
        return;
      }

      const submission = lesson.assignment
        ? await prisma.assignmentSubmission.findFirst({
            where: { userId: user.id, assignmentId: lesson.assignment.id },
          })
        : null;

      const reqs = (lesson.assignment?.requirements as string[]) || ['Follow video instructions and guidelines to create your ad deliverable.'];
      const statusText = submission
        ? `Submission Status: **${submission.status}**${submission.feedback ? `\nInstructor Feedback: *${submission.feedback}*` : ''}`
        : 'Submission Status: ⏳ *Not submitted yet*';

      const embed = createInfoEmbed(
        `📋 Assignment: ${lesson.title}`,
        `**Tier ${lesson.tier} • Module ${lesson.module}**\n\n` +
        `**Requirements:**\n${reqs.map(r => `• ${r}`).join('\n')}\n\n` +
        `${statusText}\n\n` +
        `👉 **To submit your work, run:**\n` +
        `\`/submit assignment lesson:${lesson.id} submission_url:<link-to-deliverable>\``
      );

      await interaction.editReply({ embeds: [embed] });
    } else if (sub === 'project') {
      const tier = interaction.options.getInteger('tier', true);
      const project = await prisma.project.findFirst({
        where: { tier },
      });

      const submission = project
        ? await prisma.projectSubmission.findFirst({
            where: { userId: user.id, projectId: project.id },
          })
        : null;

      const title = project?.title || `Tier ${tier} Capstone Project`;
      const reqs = (project?.requirements as string[]) || ['Complete end-to-end video ad campaign with hooks, visual prompts, and creative analysis.'];
      const statusText = submission
        ? `Submission Status: **${submission.status}**${submission.feedback ? `\nInstructor Feedback: *${submission.feedback}*` : ''}`
        : 'Submission Status: ⏳ *Not submitted yet*';

      const embed = createInfoEmbed(
        `🏆 Capstone Project: Tier ${tier}`,
        `**${title}**\n\n` +
        `**Evaluation Criteria:**\n${reqs.map(r => `• ${r}`).join('\n')}\n\n` +
        `${statusText}\n\n` +
        `👉 **To submit your capstone project, run:**\n` +
        `\`/submit project tier:${tier} submission_url:<link-to-deliverables>\``
      );

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
