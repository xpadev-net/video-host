// Synthetic local test credentials; never point tests at a deployed database.
process.env.NODE_ENV = "test";
process.env.BETTER_AUTH_SECRET =
  "test-only-better-auth-secret-at-least-32-chars";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.CALLBACK_SECRET = "test-callback-secret";
process.env.VOD_INTERNAL_SECRET = "test-vod-internal-secret";
