const normalizedBasePath = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

export const BASE_PATH = normalizedBasePath;

export const withBase = (path = "/") => {
  if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith("//")) return path;
  if (!path.startsWith("/")) throw new Error(`Internal paths must start with "/": ${path}`);
  if (BASE_PATH && (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`))) return path;
  return `${BASE_PATH}${path}` || "/";
};

export const withoutBase = (pathname: string) => {
  if (!BASE_PATH) return pathname || "/";
  if (pathname === BASE_PATH) return "/";
  if (pathname.startsWith(`${BASE_PATH}/`)) return pathname.slice(BASE_PATH.length) || "/";
  return pathname || "/";
};
