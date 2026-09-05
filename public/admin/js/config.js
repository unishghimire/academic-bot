/**
 * Academy Client API Configuration
 * 
 * When deploying on Vercel as a standalone static frontend:
 * 1. Set window.BACKEND_API_URL before loading this script, OR
 * 2. Add <meta name="backend-api-url" content="https://your-backend-api.com"> in index.html, OR
 * 3. Leave blank to default to the current domain (window.location.origin).
 */
(function () {
  const metaApiUrl = document.querySelector('meta[name="backend-api-url"]')?.getAttribute('content');
  const storedApiUrl = window.localStorage?.getItem('ACADEMY_BACKEND_URL');
  
  window.API_BASE = (
    window.BACKEND_API_URL ||
    metaApiUrl ||
    storedApiUrl ||
    window.location.origin
  ).replace(/\/+$/, ''); // Remove trailing slashes
})();
