import type { AppConfig } from '@orq8/core';
import type { Db } from '@orq8/db';
import type { Logger } from 'pino';
import type { Pool } from 'pg';

export interface AppDeps {
  config: AppConfig;
  db: Db;
  pool: Pool;
  logger: Logger;
}

// docs/35.1 — org_id always comes from the session, never the client
export interface AuthContext {
  userId: string;
  orgId: string;
  sessionId: string;
  role: string;
  email: string;
}
