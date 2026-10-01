export const getSafeCallback = (callback: string | null) => {
  // URLSearchParams has already decoded this once. Preserve literal '%' paths.
  if (
    !callback?.startsWith("/") ||
    callback.startsWith("//") ||
    callback.includes("\\") ||
    callback.includes("://") ||
    // biome-ignore lint/suspicious/noControlCharactersInRegex: reject browser URL normalization of control characters
    /[\u0000-\u001f\u007f]/.test(callback)
  ) {
    return null;
  }
  try {
    const base = "https://callback.invalid";
    if (new URL(callback, base).origin !== base) return null;
    return callback;
  } catch {
    return null;
  }
};
