/**
 * PrismaClient Singleton — Next.js safe
 *
 * Em desenvolvimento o hot-reload cria múltiplas instâncias do Prisma,
 * esgotando conexões. Este padrão usa o globalThis para reutilizar
 * a instância entre reloads.
 *
 * Ref: https://www.prisma.io/docs/guides/other/troubleshooting-orm/help-articles/nextjs-prisma-client-dev-practices
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
