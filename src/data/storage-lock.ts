import fs from 'node:fs/promises';
import path from 'node:path';
import lockfile from 'proper-lockfile';
import { config } from '@/lib/config';
import { InternalError } from '@/lib/errors';

const LOCK_RETRIES = { retries: 120, minTimeout: 5, maxTimeout: 100, factor: 1.4 };
const STALE_LOCK_MS = 10_000;

declare const lockBrand: unique symbol;

export type StorageLock = {
  readonly dir: string;
  readonly [lockBrand]: true;
};

export function withLedgerLock<T>(projectDir: string, work: (lock: StorageLock) => Promise<T>): Promise<T> {
  return withDirectoryLock(projectDir, 'ledger.lock', work);
}

export function withHomeLock<T>(work: (lock: StorageLock) => Promise<T>): Promise<T> {
  return withDirectoryLock(config.pactiesHome, 'home.lock', work);
}

export function assertLockHeld(lock: StorageLock, dir: string): void {
  if (path.resolve(lock.dir) !== path.resolve(dir) || !heldLocks.has(lock)) {
    throw new InternalError(`Write to ${dir} attempted without holding its lock`);
  }
}

const heldLocks = new WeakSet<StorageLock>();

async function withDirectoryLock<T>(dir: string, lockName: string, work: (lock: StorageLock) => Promise<T>): Promise<T> {
  await fs.mkdir(dir, { recursive: true });
  const release = await acquire(dir, lockName);
  const lock = { dir } as StorageLock;
  heldLocks.add(lock);
  try {
    return await work(lock);
  } finally {
    heldLocks.delete(lock);
    await release();
  }
}

async function acquire(dir: string, lockName: string): Promise<() => Promise<void>> {
  try {
    return await lockfile.lock(dir, {
      lockfilePath: path.join(dir, lockName),
      retries: LOCK_RETRIES,
      stale: STALE_LOCK_MS,
      realpath: false,
    });
  } catch (error) {
    throw new InternalError(`Could not lock ${dir}; another pacties process may be stuck (${String(error)})`);
  }
}
