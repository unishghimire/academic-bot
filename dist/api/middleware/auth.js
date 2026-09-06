"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAcademyAuth = requireAcademyAuth;
const env_js_1 = require("../../config/env.js");
function requireAcademyAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const secretHeader = req.headers['x-academy-secret'];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : secretHeader;
    if (!token || token !== env_js_1.env.ACADEMY_API_SECRET) {
        res.status(401).json({ error: 'Unauthorized: Invalid Academy API Secret' });
        return;
    }
    next();
}
//# sourceMappingURL=auth.js.map