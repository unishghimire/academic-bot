/**
 * Vitest global setup — provides safe dummy values for required env vars.
 * These are TEST-ONLY values. They never grant access to anything real:
 * the admin panel key and API secret are validated against these only
 * inside the test process.
 */
process.env.ADMIN_PANEL_KEY = process.env.ADMIN_PANEL_KEY || 'test_admin_key_NOT_REAL_0123456789abcdef';
process.env.ACADEMY_API_SECRET = process.env.ACADEMY_API_SECRET || 'test_api_secret_NOT_REAL_0123456789abcdef';
