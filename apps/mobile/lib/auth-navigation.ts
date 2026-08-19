export const DEFAULT_POST_AUTH_ROUTE = '/(tabs)/home' as const;

const PROTECTED_POST_AUTH_ROUTES = new Set([
  '/my-get',
  '/point-sharing',
  '/scan-card',
] as const);

export type ProtectedPostAuthRoute = '/my-get' | '/point-sharing' | '/scan-card';
export type PostAuthRoute = ProtectedPostAuthRoute | typeof DEFAULT_POST_AUTH_ROUTE;

export function getSafePostAuthRoute(value: string | string[] | undefined): PostAuthRoute {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && PROTECTED_POST_AUTH_ROUTES.has(candidate as ProtectedPostAuthRoute)
    ? candidate as ProtectedPostAuthRoute
    : DEFAULT_POST_AUTH_ROUTE;
}
