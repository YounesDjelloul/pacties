import type { Launcher } from '@/domain/clients/types';

export function shellCommand(launcher: Launcher, args: string[]): string {
  return [launcher.command, ...launcher.args, ...args].map((part) => `'${part.split("'").join(String.raw`'\''`)}'`).join(' ');
}
