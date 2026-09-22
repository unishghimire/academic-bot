/**
 * Root entrypoint for container and cloud hosts (e.g. Bot-Hosting.net, Pterodactyl)
 * that execute `node ${STARTUP_FILE}` where STARTUP_FILE defaults to `index.js`.
 * Automatically boots the compiled production application in `./dist/index.js`.
 */
import './dist/index.js';
