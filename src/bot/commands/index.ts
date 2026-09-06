import {
  linkCommand,
  subscriptionCommand,
  progressCommand,
  continueCommand,
} from './student.commands.js';
import {
  verifyProofCommand,
  paymentMethodsCommand,
  portalCommand,
} from './verification.commands.js';
import { meetingCommand } from './meeting.commands.js';
import { courseCommand } from './course.commands.js';
import { submitCommand } from './submission.commands.js';
import {
  xpCommand,
  rankCommand,
  leaderboardCommand,
  challengeCommand,
} from './gamification.commands.js';
import { supportCommand } from './support.commands.js';
import {
  assignmentReviewCommand,
  projectReviewCommand,
  studentProgressCommand,
} from './instructor.commands.js';
import {
  adminDashboardCommand,
  grantPremiumCommand,
  revokePremiumCommand,
  unlockTierCommand,
  addXpCommand,
  broadcastCommand,
  serverStatsCommand,
  resetProgressCommand,
} from './admin.commands.js';
import { setupServerCommand } from './setup.command.js';

/**
 * PHASE 1 ACTIVE COMMANDS:
 * Payment verification, role granting, subscription tracking, and meeting scheduling.
 * All other features are safely hidden until user requests expansion.
 */
export const allCommands = [
  // Payment & Role Verification
  paymentMethodsCommand,
  portalCommand,
  verifyProofCommand,
  linkCommand,
  subscriptionCommand,
  grantPremiumCommand,
  revokePremiumCommand,

  // Meeting Scheduling
  meetingCommand,

  // System & Administration
  adminDashboardCommand,
  setupServerCommand,
];

/**
 * DORMANT / HIDDEN COMMANDS (Preserved for future phases when ready to launch):
 * Course lessons, submissions, grading reviews, gamification XP/ranks/leaderboards.
 */
export const dormantFutureCommands = [
  courseCommand,
  submitCommand,
  xpCommand,
  rankCommand,
  leaderboardCommand,
  challengeCommand,
  supportCommand,
  assignmentReviewCommand,
  projectReviewCommand,
  studentProgressCommand,
  unlockTierCommand,
  addXpCommand,
  broadcastCommand,
  serverStatsCommand,
  resetProgressCommand,
  progressCommand,
  continueCommand,
];

export const commandMap = new Map(allCommands.map(cmd => [cmd.data.name, cmd]));
