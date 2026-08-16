export const createIdempotencyKey = (): string => crypto.randomUUID();
