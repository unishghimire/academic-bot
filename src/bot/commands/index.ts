import {
  linkCommand,
  subscriptionCommand,
  progressCommand,
  continueCommand,
} from './student.commands.js';
import { courseCommand } from './course.commands.js';
import { aiCommand } from './ai.commands.js';
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

export const allCommands = [
  // Student
  linkCommand,
  subscriptionCommand,
  progressCommand,
  continueCommand,
  // Course
  courseCommand,
  // AI
  aiCommand,
  // Gamification
  xpCommand,
  rankCommand,
  leaderboardCommand,
  challengeCommand,
  // Support
  supportCommand,
  // Instructor
  assignmentReviewCommand,
  projectReviewCommand,
  studentProgressCommand,
  // Admin
  adminDashboardCommand,
  grantPremiumCommand,
  revokePremiumCommand,
  unlockTierCommand,
  addXpCommand,
  broadcastCommand,
  serverStatsCommand,
  resetProgressCommand,
  setupServerCommand,
];

export const commandMap = new Map(allCommands.map(cmd => [cmd.data.name, cmd]));
