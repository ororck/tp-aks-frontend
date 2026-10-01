export const environment = {
  production: true,
  // Placeholder replaced by the Dockerfile (API_BASE_URL build arg) right before
  // `npm run build:prod`. No application API key: network isolation, see ADR 0009.
  apiBaseUrl: 'https://REPLACE_WITH_PROD_API_URL/api',
};
