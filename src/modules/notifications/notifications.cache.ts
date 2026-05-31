export const NOTIFICATIONS_TTL = {
  unread: 60 * 2,
  all: 60 * 1,
  version: 60 * 60, // version counter lives longer than the lists it governs
} as const;

export const NOTIFICATIONS_CK = {
  count: (userId: string) => `notifications:count:${userId}`,
  unread: (userId: string) => `notifications:unread:${userId}`,
  allVersion: (userId: string) => `notifications:all:version:${userId}`,
  all: (userId: string, version: number, page: number, limit: number) =>
    `notifications:all:${userId}:v${version}:${page}:${limit}`,
} as const;
