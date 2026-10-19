export const isPipRoute = (pathname: string) =>
  !/^\/movies\/[^/]+\/?$/.test(pathname);
