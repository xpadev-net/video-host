import bcrypt from "bcryptjs";
import { PASSWORD_HASH_ROUNDS, PASSWORD_SALT } from "@/env";

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password + PASSWORD_SALT, PASSWORD_HASH_ROUNDS);
};

export const isPasswordValid = async (
  password: string,
  hash: string,
): Promise<boolean> => {
  return bcrypt.compare(password + PASSWORD_SALT, hash);
};
