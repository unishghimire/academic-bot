/**
 * Academy Bot Constants & Business Logic Rules
 */
export const XP_REWARDS = {
    LESSON_COMPLETED: 100,
    QUIZ_PASSED: 50,
    ASSIGNMENT_APPROVED: 150,
    PROJECT_APPROVED: 500,
    CHALLENGE_SUBMITTED: 100,
    DAILY_ACTIVITY_STREAK: 25,
};
export const COMPLETION_THRESHOLDS = {
    VIDEO_WATCH_PERCENT: 90.0, // Student must watch at least 90% of video
    QUIZ_PASSING_PERCENT: 80, // Standard passing threshold
};
export const TIER_LEVELS = {
    ELITE: 1,
    TIER_1: 1, // Backward compatibility alias
};
export const ROLE_KEYS = {
    PREMIUM: 'ROLE_PREMIUM',
    ELITE: 'ROLE_ELITE',
    INSTRUCTOR: 'ROLE_INSTRUCTOR',
    ADMIN: 'ROLE_ADMIN',
};
export const COLORS = {
    PRIMARY: 0x5865F2, // Blurple
    SUCCESS: 0x57F287, // Green
    WARNING: 0xFEE75C, // Yellow
    DANGER: 0xED4245, // Red
    GOLD: 0xF1C40F, // Academy Gold / Graduate
    DARK: 0x1E1F22, // Sleek Dark
};
export const EMBED_FOOTER = {
    text: 'Premium AI Video Ads Academy • Single Source of Truth',
    iconURL: 'https://cdn.discordapp.com/embed/avatars/0.png',
};
//# sourceMappingURL=constants.js.map