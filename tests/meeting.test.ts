import { describe, it, expect, vi } from 'vitest';
import { MeetingService } from '../src/services/meeting.service.js';

describe('MeetingService — Meeting Scheduling & Access', () => {
  it('schedules a new meeting with title, optional topic, category, datetime, and channelUrl', async () => {
    const scheduledDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const mockDb: any = {
      liveClass: {
        create: vi.fn().mockImplementation(args => Promise.resolve({ id: 'meet_123', ...args.data })),
      },
    };

    const service = new MeetingService(mockDb);

    const meeting = await service.scheduleMeeting({
      title: 'Weekly Live Q&A Strategy Call',
      scheduledAt: scheduledDate,
      channelUrl: 'https://meet.google.com/abc-defg-hij',
      reminderRole: '100000000000000002',
      categoryId: '123456789012345678',
      categoryName: 'Classes',
    });

    expect(meeting.id).toBe('meet_123');
    expect(meeting.title).toBe('Weekly Live Q&A Strategy Call');
    expect(meeting.topic).toBe('Weekly Live Q&A Strategy Call'); // defaulted from title
    expect(meeting.channelUrl).toBe('https://meet.google.com/abc-defg-hij');
    expect(meeting.reminderRole).toBe('100000000000000002');
    expect((meeting as any).categoryId).toBe('123456789012345678');
    expect((meeting as any).categoryName).toBe('Classes');
    expect(mockDb.liveClass.create).toHaveBeenCalled();
  });

  it('rejects scheduling if title or datetime is missing', async () => {
    const service = new MeetingService({} as any);

    await expect(
      service.scheduleMeeting({
        title: '',
        scheduledAt: new Date(),
      })
    ).rejects.toThrow('Title and date/time are required to schedule a meeting.');
  });

  it('lists upcoming scheduled meetings ordered by scheduledAt', async () => {
    const futureDate = new Date(Date.now() + 10 * 60 * 60 * 1000);
    const mockDb: any = {
      liveClass: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'meet_1',
            title: 'Onboarding Call',
            topic: 'Welcome and setup',
            scheduledAt: futureDate,
            channelUrl: 'https://meet.google.com/xyz',
          },
        ]),
      },
    };

    const service = new MeetingService(mockDb);
    const meetings = await service.listUpcomingMeetings();

    expect(meetings.length).toBe(1);
    expect(meetings[0].title).toBe('Onboarding Call');
    expect(mockDb.liveClass.findMany).toHaveBeenCalled();
  });

  it('cancels/deletes a scheduled meeting by ID', async () => {
    const mockDb: any = {
      liveClass: {
        delete: vi.fn().mockResolvedValue({ id: 'meet_to_cancel' }),
      },
    };

    const service = new MeetingService(mockDb);
    const cancelled = await service.cancelMeeting('meet_to_cancel');

    expect(cancelled).toBe(true);
    expect(mockDb.liveClass.delete).toHaveBeenCalledWith({ where: { id: 'meet_to_cancel' } });
  });
});
