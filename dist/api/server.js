"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApiServer = createApiServer;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const stripe_routes_js_1 = require("./routes/stripe.routes.js");
const progress_routes_js_1 = require("./routes/progress.routes.js");
const link_routes_js_1 = require("./routes/link.routes.js");
const payment_routes_js_1 = require("./routes/payment.routes.js");
const admin_routes_js_1 = require("./routes/admin.routes.js");
const client_js_1 = require("../db/client.js");
function createApiServer(discordClient) {
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)());
    // Raw body for Stripe webhook signature verification
    app.use('/webhooks', express_1.default.raw({ type: 'application/json' }), (0, stripe_routes_js_1.createStripeRouter)(discordClient));
    // Support up to 15MB JSON & form bodies for QR code and receipt image uploads
    app.use(express_1.default.json({ limit: '15mb' }));
    app.use(express_1.default.urlencoded({ extended: true, limit: '15mb' }));
    // Serve static UI assets (Admin Panel & Payment Proof portal)
    app.use(express_1.default.static(path_1.default.join(process.cwd(), 'public')));
    // Root endpoint for Render liveness ping
    app.get('/', (_req, res) => {
        res.status(200).json({
            service: 'Academy Bot & Control Center API',
            status: 'online',
            discordReady: discordClient?.isReady() ?? false,
            timestamp: new Date().toISOString(),
        });
    });
    app.get('/admin', (_req, res) => {
        res.redirect('/admin/index.html');
    });
    app.get('/health', async (_req, res) => {
        const dbOk = await (0, client_js_1.checkDbConnection)();
        res.status(200).json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: dbOk ? 'connected' : 'disconnected',
            discord: discordClient?.isReady() ? 'connected' : 'connecting',
        });
    });
    app.use('/api/progress', (0, progress_routes_js_1.createProgressRouter)(discordClient));
    app.use('/api/link', (0, link_routes_js_1.createLinkRouter)(discordClient));
    app.use('/api/payments', (0, payment_routes_js_1.createPaymentRouter)(discordClient));
    app.use('/api/admin', (0, admin_routes_js_1.createAdminRouter)(discordClient));
    return app;
}
//# sourceMappingURL=server.js.map