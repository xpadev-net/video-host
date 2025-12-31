import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { JWT_SECRET } from "../env";

/**
 * Tests for JWT token verification logic.
 * These tests validate the jwt.verify() behavior that is used in the auth middleware.
 */
describe("JWT verification", () => {
  const testUserId = "test-user-123";
  const testExpiredAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

  it("should verify a valid token", () => {
    const token = jwt.sign(
      { userId: testUserId, expiredAt: testExpiredAt },
      JWT_SECRET,
    );

    expect(() => jwt.verify(token, JWT_SECRET)).not.toThrow();
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    expect(decoded.userId).toBe(testUserId);
  });

  it("should reject a token with modified payload", () => {
    const token = jwt.sign(
      { userId: testUserId, expiredAt: testExpiredAt },
      JWT_SECRET,
    );

    // Modify the payload by changing a character in the middle
    const parts = token.split(".");
    const modifiedPayload = parts[1].replace(/./g, (c, i) =>
      i === 5 ? (c === "a" ? "b" : "a") : c,
    );
    const modifiedToken = `${parts[0]}.${modifiedPayload}.${parts[2]}`;

    expect(() => jwt.verify(modifiedToken, JWT_SECRET)).toThrow();
  });

  it("should reject a token signed with wrong secret", () => {
    const token = jwt.sign(
      { userId: testUserId, expiredAt: testExpiredAt },
      "wrong-secret",
    );

    expect(() => jwt.verify(token, JWT_SECRET)).toThrow();
  });

  it("should reject a token with modified signature", () => {
    const token = jwt.sign(
      { userId: testUserId, expiredAt: testExpiredAt },
      JWT_SECRET,
    );

    // Modify the signature
    const modifiedToken = `${token.slice(0, -5)}XXXXX`;

    expect(() => jwt.verify(modifiedToken, JWT_SECRET)).toThrow();
  });

  it("should reject malformed tokens", () => {
    expect(() => jwt.verify("not-a-jwt", JWT_SECRET)).toThrow();
    expect(() => jwt.verify("a.b.c", JWT_SECRET)).toThrow();
    expect(() => jwt.verify("", JWT_SECRET)).toThrow();
  });
});
