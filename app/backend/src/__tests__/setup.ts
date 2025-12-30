// Set up test environment variables before any imports
// This ensures env.ts doesn't throw when imported by other modules during testing
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret";
process.env.CALLBACK_SECRET = "test-callback-secret";
process.env.VOD_INTERNAL_SECRET = "test-vod-internal-secret";
