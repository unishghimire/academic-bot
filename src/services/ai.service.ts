import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../db/client.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export type AiTaskType =
  | 'ad'
  | 'prompt'
  | 'script'
  | 'hook'
  | 'storyboard'
  | 'caption'
  | 'cta'
  | 'voiceover';

export interface AiRequestParams {
  userId: string;
  command: AiTaskType;
  prompt: string;
  niche?: string;
  targetAudience?: string;
}

export interface AiResponseResult {
  output: string;
  remainingQuota: number;
  tokensUsed: number;
}

export class AiService {
  constructor(private db: PrismaClient = defaultPrisma) {}

  /**
   * Checks remaining daily usage for a user
   */
  async getDailyUsage(userId: string): Promise<{ count: number; remaining: number }> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const count = await this.db.aiUsage.count({
      where: {
        userId,
        createdAt: { gte: startOfDay },
      },
    });

    const cap = env.AI_DAILY_CAP_PER_USER;
    return {
      count,
      remaining: Math.max(0, cap - count),
    };
  }

  /**
   * Executes AI task with daily quota checks and structured prompt formatting
   */
  async generate(params: AiRequestParams): Promise<AiResponseResult> {
    const { remaining } = await this.getDailyUsage(params.userId);

    if (remaining <= 0) {
      throw new Error(
        `Daily AI quota reached (${env.AI_DAILY_CAP_PER_USER}/${env.AI_DAILY_CAP_PER_USER}). Your quota will reset at midnight UTC.`
      );
    }

    // System templates tailored for AI Video Ads Academy
    const systemPrompts: Record<AiTaskType, string> = {
      ad: 'You are an elite direct-response AI Video Ads Director. Generate a full high-converting video ad strategy.',
      prompt: 'You are an AI Video Prompt Engineer (Midjourney, Runway Gen-3, Kling, Luma Dream Machine). Generate photorealistic, cinematographic video prompts.',
      script: 'You are a direct-response copywriter. Generate a high-retention 30-45s video script with hook, body, and CTA.',
      hook: 'Generate 5 high-converting pattern-interrupt hooks designed for TikTok/Reels/Shorts paid ads.',
      storyboard: 'Generate a scene-by-scene visual storyboard breakdown (0-3s, 3-10s, 10-25s, 25-30s) including camera angles and movement.',
      caption: 'Generate 3 high-converting ad copy variations with emojis and targeted hashtags.',
      cta: 'Generate 5 irresistible direct-response Call-To-Actions driving clicks and conversions.',
      voiceover: 'Write an energetic, natural pacing voiceover script with pronunciation guidance and tone notes.',
    };

    let generatedOutput = '';

    // If an external LLM API key is configured, call it; otherwise generate using standard academy templates
    if (env.OPENAI_API_KEY && env.OPENAI_API_KEY !== 'sk-proj-xxx') {
      try {
        // OpenAI / compatible fetch call
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompts[params.command] },
              {
                role: 'user',
                content: `Target: ${params.targetAudience || 'General Audience'}\nNiche: ${params.niche || 'General E-Commerce'}\nPrompt Brief: ${params.prompt}`,
              },
            ],
            temperature: 0.7,
            max_tokens: 800,
          }),
        });

        if (res.ok) {
          const data: any = await res.json();
          generatedOutput = data.choices?.[0]?.message?.content || '';
        }
      } catch (err) {
        logger.error({ err }, 'Error contacting LLM API, falling back to template engine');
      }
    }

    // Default high-quality structured academy generation template if no external API
    if (!generatedOutput) {
      generatedOutput = this.generateFallbackTemplate(params);
    }

    // Log usage to database
    await this.db.aiUsage.create({
      data: {
        userId: params.userId,
        command: params.command,
        tokensUsed: 250,
      },
    });

    logger.info(
      { userId: params.userId, command: params.command, remaining: remaining - 1 },
      'AI assistant generation completed'
    );

    return {
      output: generatedOutput,
      remainingQuota: remaining - 1,
      tokensUsed: 250,
    };
  }

  private generateFallbackTemplate(params: AiRequestParams): string {
    const niche = params.niche || 'Digital Product / E-Commerce';
    const brief = params.prompt;

    switch (params.command) {
      case 'hook':
        return `🔥 **Top 5 AI Video Ad Hooks for ${niche}**:\n` +
          `1. *"Stop scrolling if you're still wasting 4 hours doing ${brief} manually..."*\n` +
          `2. *"The #1 secret 7-figure creators use to generate ${brief} in 60 seconds."*\n` +
          `3. *"I tested 10 different AI tools for ${niche}. Here is the only one that worked."*\n` +
          `4. *"Don't buy another course on ${brief} until you see this demonstration."*\n` +
          `5. *"What if I told you that 90% of what you know about ${brief} is completely obsolete?"*`;

      case 'script':
        return `🎬 **High-Converting Video Ad Script (30-Second Format)**:\n\n` +
          `**[0:00 - 0:03] Pattern Interrupt Hook:**\nVisual: Quick zoom-in, energetic expression.\nAudio: *"If you're trying to master ${brief}, stop what you're doing right now."*\n\n` +
          `**[0:03 - 0:15] Agitation & Discovery:**\nVisual: Screen recording showing common frustrating bottlenecks.\nAudio: *"Most creators waste days tweaking manual prompts, but modern AI video models can do it instantly."*\n\n` +
          `**[0:15 - 0:25] The Solution:**\nVisual: Split-screen comparison showcasing cinematic AI video generation.\nAudio: *"With our step-by-step framework, you turn single sentences into cinematic 4K video ads."*\n\n` +
          `**[0:25 - 0:30] Call to Action:**\nVisual: Clear on-screen button pointing to the Academy link.\nAudio: *"Click below and start building high-CTR ads today."*`;

      case 'prompt':
        return `🎨 **Cinematic AI Video Generation Prompt Pack**:\n\n` +
          `**Midjourney v6 Base Image:**\n` +
          `\`cinematic commercial still of ${brief}, 35mm lens, hyper-realistic, volumetric studio lighting, 8k resolution, photorealistic, shallow depth of field --ar 16:9 --v 6.0\`\n\n` +
          `**Runway Gen-3 / Kling Motion Prompt:**\n` +
          `\`slow smooth cinematic camera dolly forward, subtle atmospheric dust particles, natural realistic movement, high-end commercial grading, 4k ultra-detailed\``;

      default:
        return `✨ **Academy AI Assistant Result for [${params.command.toUpperCase()}]**:\n\n` +
          `**Target Niche:** ${niche}\n` +
          `**Focus:** ${brief}\n\n` +
          `• Step 1: Hook the viewer within the first 1.5 seconds using high-contrast motion.\n` +
          `• Step 2: Introduce the core benefit addressing the target audience pain point.\n` +
          `• Step 3: Conclude with a direct, single call to action to maximize retention and CTR.`;
    }
  }
}

export const aiService = new AiService();
