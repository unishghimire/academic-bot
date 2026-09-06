"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.meetingService = exports.MeetingService = void 0;
const client_js_1 = require("../db/client.js");
const local_store_js_1 = require("../db/local-store.js");
const logger_js_1 = require("../utils/logger.js");
class MeetingService {
    db;
    constructor(db = client_js_1.prisma) {
        this.db = db;
    }
    isOffline() {
        return this.db === client_js_1.prisma && !(0, client_js_1.isPostgresOnline)();
    }
    /**
     * Schedule a new meeting/class
     */
    async scheduleMeeting(input) {
        if (!input.title || !input.topic || !input.scheduledAt || !input.channelUrl) {
            throw new Error('Title, topic, date/time, and meeting URL are required.');
        }
        if (this.isOffline()) {
            const meeting = {
                id: `meet_${Date.now()}`,
                title: input.title.trim(),
                topic: input.topic.trim(),
                scheduledAt: input.scheduledAt,
                channelUrl: input.channelUrl.trim(),
                reminderRole: input.reminderRole ? input.reminderRole.trim() : null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            local_store_js_1.localStore.saveLiveClass(meeting);
            logger_js_1.logger.info({ meetingId: meeting.id }, 'Meeting scheduled in local offline storage');
            return meeting;
        }
        try {
            const meeting = await this.db.liveClass.create({
                data: {
                    title: input.title.trim(),
                    topic: input.topic.trim(),
                    scheduledAt: input.scheduledAt,
                    channelUrl: input.channelUrl.trim(),
                    reminderRole: input.reminderRole ? input.reminderRole.trim() : null,
                },
            });
            logger_js_1.logger.info({ meetingId: meeting.id }, 'Meeting scheduled successfully in database');
            return meeting;
        }
        catch (err) {
            logger_js_1.logger.warn({ err }, 'Database save failed, using local offline storage for meeting');
            const meeting = {
                id: `meet_${Date.now()}`,
                title: input.title.trim(),
                topic: input.topic.trim(),
                scheduledAt: input.scheduledAt,
                channelUrl: input.channelUrl.trim(),
                reminderRole: input.reminderRole ? input.reminderRole.trim() : null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            local_store_js_1.localStore.saveLiveClass(meeting);
            return meeting;
        }
    }
    /**
     * List upcoming meetings (from now onwards)
     */
    async listUpcomingMeetings() {
        const now = new Date();
        if (this.isOffline()) {
            const all = local_store_js_1.localStore.getLiveClasses();
            return all
                .filter(m => new Date(m.scheduledAt).getTime() >= now.getTime() - 15 * 60 * 1000) // within 15 min past or in future
                .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
        }
        try {
            return await this.db.liveClass.findMany({
                where: {
                    scheduledAt: { gte: new Date(now.getTime() - 15 * 60 * 1000) },
                },
                orderBy: { scheduledAt: 'asc' },
            });
        }
        catch {
            const all = local_store_js_1.localStore.getLiveClasses();
            return all
                .filter(m => new Date(m.scheduledAt).getTime() >= now.getTime() - 15 * 60 * 1000)
                .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
        }
    }
    /**
     * Cancel/delete a scheduled meeting
     */
    async cancelMeeting(id) {
        if (this.isOffline()) {
            return local_store_js_1.localStore.deleteLiveClass(id);
        }
        try {
            await this.db.liveClass.delete({ where: { id } });
            return true;
        }
        catch {
            return local_store_js_1.localStore.deleteLiveClass(id);
        }
    }
    /**
     * Get single meeting by ID
     */
    async getMeeting(id) {
        if (this.isOffline()) {
            return local_store_js_1.localStore.findLiveClassById(id);
        }
        try {
            return await this.db.liveClass.findUnique({ where: { id } });
        }
        catch {
            return local_store_js_1.localStore.findLiveClassById(id);
        }
    }
}
exports.MeetingService = MeetingService;
exports.meetingService = new MeetingService();
//# sourceMappingURL=meeting.service.js.map