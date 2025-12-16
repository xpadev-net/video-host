import "dotenv/config";
import * as process from "node:process";

export const PUBLIC_ENDPOINTS = process.env.PUBLIC_ENDPOINTS?.split(",") ?? [];
export const CORS_ORIGIN = process.env.CORS_ORIGIN?.split(",") ?? [];
export const PASSWORD_SALT = process.env.PASSWORD_SALT || "passwordsalt";
export const PASSWORD_HASH_ROUNDS = parseInt(
  process.env.PASSWORD_HASH_ROUNDS || "10",
  10,
);
export const TOKEN_EXPIRY =
  parseInt(process.env.TOKEN_EXPIRY || "604800", 10) * 1000; //convert seconds to milliseconds
export const SIGNUP_ENABLED = process.env.SIGNUP_ENABLED === "true";
export const SIGNUP_CODE = process.env.SIGNUP_CODE;
export const PORT = parseInt(process.env.PORT || "3000", 10);
export const JWT_SECRET = process.env.JWT_SECRET || "secret";
