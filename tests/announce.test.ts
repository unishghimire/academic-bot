import { describe, it, expect, vi } from 'vitest';
import { announceCommand } from '../src/bot/commands/announce.command.js';

describe('announceCommand — Official Academy Broadcasts', () => {
  it('posts announcement embed with title and message to target channel', async () => {
    const mockSend = vi.fn().mockResolvedValue({ url: 'https://discord.com/channels/1/2/3' });
    const mockChannel = {
      id: 'chan_welcome',
      isTextBased: () => true,
      send: mockSend,
    };

    const mockInteraction: any = {
      user: {
        id: 'usr_admin',
        username: 'AdminUser',
        displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/1/abc.png',
      },
      member: {
        permissions: { has: () => true },
        roles: { cache: new Map() },
      },
      guild: {
        id: 'guild_1443245164200988724',
        channels: {
          cache: new Map([['chan_welcome', mockChannel]]),
        },
      },
      options: {
        getString: (name: string) => {
          if (name === 'message') return 'Join our live class tonight at 7 PM UTC!';
          if (name === 'title') return '📢 Special Live Session Announcement';
          return null;
        },
        getChannel: () => mockChannel,
        getRole: () => ({ id: 'role_elite_123' }),
      },
      deferReply: vi.fn().mockResolvedValue({}),
      editReply: vi.fn().mockResolvedValue({}),
    };

    await announceCommand.execute(mockInteraction);

    expect(mockSend).toHaveBeenCalled();
    const sendArgs = mockSend.mock.calls[0][0];
    expect(sendArgs.content).toBe('<@&role_elite_123>');
    expect(sendArgs.embeds[0].data.title).toBe('📢 Special Live Session Announcement');
    expect(sendArgs.embeds[0].data.description).toBe('Join our live class tonight at 7 PM UTC!');
    expect(mockInteraction.editReply).toHaveBeenCalled();
  });
});
