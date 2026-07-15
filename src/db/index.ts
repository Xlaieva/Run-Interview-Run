import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

type DB = ReturnType<typeof drizzle<typeof schema>>;

let cached: DB | null = null;

// Connecting lazily (on first real property access, not at import time)
// lets `next build` collect route/page metadata before DATABASE_URL is
// configured. A missing/empty URL surfaces as a clear error the first time
// a query actually runs, instead of crashing the build.
function getDb(): DB {
  if (!cached) {
    const sql = neon(process.env.DATABASE_URL ?? "");
    cached = drizzle(sql, { schema });
  }
  return cached;
}

export const db: DB = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
});
