"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commandMap = exports.dormantFutureCommands = exports.allCommands = void 0;
const student_commands_js_1 = require("./student.commands.js");
const verification_commands_js_1 = require("./verification.commands.js");
const meeting_commands_js_1 = require("./meeting.commands.js");
const course_commands_js_1 = require("./course.commands.js");
const submission_commands_js_1 = require("./submission.commands.js");
const gamification_commands_js_1 = require("./gamification.commands.js");
const support_commands_js_1 = require("./support.commands.js");
const instructor_commands_js_1 = require("./instructor.commands.js");
const admin_commands_js_1 = require("./admin.commands.js");
const setup_command_js_1 = require("./setup.command.js");
/**
 * PHASE 1 ACTIVE COMMANDS:
 * Payment verification, role granting, subscription tracking, and meeting scheduling.
 * All other features are safely hidden until user requests expansion.
 */
exports.allCommands = [
    // Payment & Role Verification
    verification_commands_js_1.paymentMethodsCommand,
    verification_commands_js_1.portalCommand,
    verification_commands_js_1.verifyProofCommand,
    student_commands_js_1.linkCommand,
    student_commands_js_1.subscriptionCommand,
    admin_commands_js_1.grantPremiumCommand,
    admin_commands_js_1.revokePremiumCommand,
    // Meeting Scheduling
    meeting_commands_js_1.meetingCommand,
    // System & Administration
    admin_commands_js_1.adminDashboardCommand,
    setup_command_js_1.setupServerCommand,
];
/**
 * DORMANT / HIDDEN COMMANDS (Preserved for future phases when ready to launch):
 * Course lessons, submissions, grading reviews, gamification XP/ranks/leaderboards.
 */
exports.dormantFutureCommands = [
    course_commands_js_1.courseCommand,
    submission_commands_js_1.submitCommand,
    gamification_commands_js_1.xpCommand,
    gamification_commands_js_1.rankCommand,
    gamification_commands_js_1.leaderboardCommand,
    gamification_commands_js_1.challengeCommand,
    support_commands_js_1.supportCommand,
    instructor_commands_js_1.assignmentReviewCommand,
    instructor_commands_js_1.projectReviewCommand,
    instructor_commands_js_1.studentProgressCommand,
    admin_commands_js_1.unlockTierCommand,
    admin_commands_js_1.addXpCommand,
    admin_commands_js_1.broadcastCommand,
    admin_commands_js_1.serverStatsCommand,
    admin_commands_js_1.resetProgressCommand,
    student_commands_js_1.progressCommand,
    student_commands_js_1.continueCommand,
];
exports.commandMap = new Map(exports.allCommands.map(cmd => [cmd.data.name, cmd]));
//# sourceMappingURL=index.js.map