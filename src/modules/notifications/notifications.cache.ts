export const NOTIFICATIONS_TTL = {
  unread: 60 * 2,
  all: 60 * 1,
} as const;

export const NOTIFICATIONS_CK = {
  count: (userId: string) => `notifications:count:${userId}`,
  unread: (userId: string) => `notifications:unread:${userId}`,
  all: (userId: string, page: number, limit: number) =>
    `notifications:all:${userId}:${page}:${limit}`,
} as const;
