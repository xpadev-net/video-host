import { statfs } from "node:fs/promises";
import { TEMP_DIR } from "./env";

export type DiskSpace = {
  availableBytes: number;
  totalBytes: number;
};

export const getDiskSpace = async (path = TEMP_DIR): Promise<DiskSpace> => {
  const space = await statfs(path);
  return {
    availableBytes: Number(space.bavail) * Number(space.bsize),
    totalBytes: Number(space.blocks) * Number(space.bsize),
  };
};
