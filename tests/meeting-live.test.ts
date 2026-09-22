import { describe, it, expect, vi } from 'vitest';
import { runMeetingLiveCheck } from '../src/bot/jobs/meeting-live.job.js';
import { meetingService } from '../src/services/meeting.service.js';
import { env } from '../src/config/env.js';

describe('MeetingLiveJob — Voice Channel Creation & Live Broadcast', () => {
  it('creates voice channel and broadcasts live announcement when meeting is due', async () => {
    const dueMeeting = {
      id: 'meet_due_1',
      title: 'Scaling YouTube Ads 2026',
      topic: 'How to scale campaigns',
      scheduledAt: new Date(Date.now() - 1000 * 60), // 1 min ago
      channelUrl: 'Auto Voice Channel',
      categoryId: 'cat_live_training',
      reminderRole: null,
      targetChannelId: null,
      isLive: false,
    };

    vi.spyOn(meetingService, 'getDueUnannouncedMeetings').mockResolvedValue([dueMeeting]);
    const markLiveSpy = vi.spyOn(meetingService, 'markMeetingLive').mockResolvedValue({} as any);

    const mockSend = vi.fn().mockResolvedValue({});
    const mockWelcomeChannel = {
      id: 'chan_welcome',
      name: 'welcome',
      isTextBased: () => true,
      send: mockSend,
    };

    const mockCreateVoiceChannel = vi.fn().mockResolvedValue({
      id: 'voice_room_999',
      name: '🔊 │ Scaling YouTube Ads 2026',
    });

    const mockGuild = {
      id: env.DISCORD_GUILD_ID,
      channels: {
        cache: new Map([['chan_welcome', mockWelcomeChannel]]),
        create: mockCreateVoiceChannel,
      },
      roles: {
        cache: new Map([['role_elite_id', { id: 'role_elite_id', name: 'Elite' }]]),
      },
    };

    const mockClient: any = {
      isReady: () => true,
      guilds: {
        cache: new Map([[env.DISCORD_GUILD_ID, mockGuild]]),
      },
    };

    await runMeetingLiveCheck(mockClient);

    // Verify voice channel was created in category
    expect(mockCreateVoiceChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringContaining('Scaling YouTube Ads 2026'),
        parent: 'cat_live_training',
      })
    );

    // Verify live broadcast was posted
    expect(mockSend).toHaveBeenCalled();
    const sendArgs = mockSend.mock.calls[0][0];
    expect(sendArgs.content).toContain('<@&role_elite_id>');
    expect(sendArgs.embeds[0].data.title).toContain('LIVE NOW');

    // Verify meeting was marked live
    expect(markLiveSpy).toHaveBeenCalledWith('meet_due_1', 'voice_room_999', expect.stringContaining('voice_room_999'));
  });
});
