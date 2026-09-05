import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../db/client.js';
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

      const embed = createInfoEmbed(
        `📚 Lesson: ${lesson.title}`,
        `**Tier ${lesson.tier} • Module ${lesson.module} • Order ${lesson.orderIndex}**\n\n` +
        `${lesson.description}\n\n` +
        `**Available Resources:**\n` +
        `• 🎬 Video Player: [Watch on Portal](${lesson.videoUrl || 'https://academy.example.com'})\n` +
        `• 📝 Lesson Notes: ${lesson.notesUrl ? `[View Notes](${lesson.notesUrl})` : '*None*'}\n` +
        `• 📦 Resource Assets: ${lesson.resourcesUrl ? `[Download Assets](${lesson.resourcesUrl})` : '*None*'}\n` +
        `• 🤖 AI Prompt Pack: ${lesson.promptPackUrl ? `[Download Prompts](${lesson.promptPackUrl})` : '*None*'}`
      );

      await interaction.editReply({ embeds: [embed] });
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
        `👉 **[Click Here to Open Quiz in Web Portal](https://academy.example.com/quiz/${quiz.id})**`
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
        `👉 **[Watch Lesson on Portal](${nextLesson.videoUrl || 'https://academy.example.com'})**`
      );

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
