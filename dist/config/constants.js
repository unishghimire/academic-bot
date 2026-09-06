"use strict";
/**
 * Academy Bot Constants & Business Logic Rules
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMBED_FOOTER = exports.COLORS = exports.ROLE_KEYS = exports.TIER_LEVELS = exports.COMPLETION_THRESHOLDS = exports.XP_REWARDS = void 0;
exports.XP_REWARDS = {
    LESSON_COMPLETED: 100,
    QUIZ_PASSED: 50,
    ASSIGNMENT_APPROVED: 150,
    PROJECT_APPROVED: 500,
    CHALLENGE_SUBMITTED: 100,
    DAILY_ACTIVITY_STREAK: 25,
};
exports.COMPLETION_THRESHOLDS = {
    VIDEO_WATCH_PERCENT: 90.0, // Student must watch at least 90% of video
    QUIZ_PASSING_PERCENT: 80, // Standard passing threshold
};
exports.TIER_LEVELS = {
    TIER_1: 1,
    TIER_2: 2,
    TIER_3: 3,
    GRADUATE: 4,
};
exports.ROLE_KEYS = {
    PREMIUM: 'ROLE_PREMIUM',
    TIER_1: 'ROLE_TIER_1',
    TIER_2: 'ROLE_TIER_2',
    TIER_3: 'ROLE_TIER_3',
    GRADUATE: 'ROLE_GRADUATE',
    INSTRUCTOR: 'ROLE_INSTRUCTOR',
    ADMIN: 'ROLE_ADMIN',
};
exports.COLORS = {
    PRIMARY: 0x5865F2, // Blurple
    SUCCESS: 0x57F287, // Green
    WARNING: 0xFEE75C, // Yellow
    DANGER: 0xED4245, // Red
    GOLD: 0xF1C40F, // Academy Gold / Graduate
    DARK: 0x1E1F22, // Sleek Dark
};
exports.EMBED_FOOTER = {
    text: 'Premium AI Video Ads Academy • Single Source of Truth',
    iconURL: 'https://cdn.discordapp.com/embed/avatars/0.png',
};
//# sourceMappingURL=constants.js.map