import { fail, ok } from '@/domain/shared/result';
import type { Result } from '@/domain/shared/types';

type JsonObject = Record<string, unknown>;

export const LOCAL_SETTINGS_RELATIVE_PATH = '.claude/settings.local.json';

export function buildPlannerGuardRules(testGlobs: string[]): string[] {
  return [...new Set(testGlobs.map((glob) => `Edit(${glob})`))];
}

export function addPlannerGuard(existing: unknown, rules: string[]): Result<JsonObject> {
  const parts = splitSettings(existing);
  if (!parts.ok) {
    return parts;
  }
  const { settings, permissions, deny } = parts.value;
  return ok({ ...settings, permissions: { ...permissions, deny: [...deny, ...rules.filter((rule) => !deny.includes(rule))] } });
}

export function removePlannerGuard(existing: unknown, rules: string[]): Result<JsonObject> {
  const parts = splitSettings(existing);
  if (!parts.ok) {
    return parts;
  }
  const { settings, permissions, deny } = parts.value;
  return ok({ ...settings, permissions: { ...permissions, deny: deny.filter((rule) => !rules.includes(rule)) } });
}

export function addExcludeLine(content: string, line: string): string | null {
  const lines = content.split(/\r?\n/u).map((entry) => entry.trim());
  if (lines.includes(line) || lines.includes(`/${line}`)) {
    return null;
  }
  const separator = content.length === 0 || content.endsWith('\n') ? '' : '\n';
  return `${content}${separator}${line}\n`;
}

function splitSettings(existing: unknown): Result<{ settings: JsonObject; permissions: JsonObject; deny: string[] }> {
  const settings = existing ?? {};
  if (!isJsonObject(settings)) {
    return fail(`${LOCAL_SETTINGS_RELATIVE_PATH} must contain a JSON object`);
  }
  const permissions = settings['permissions'] ?? {};
  if (!isJsonObject(permissions)) {
    return fail(`"permissions" in ${LOCAL_SETTINGS_RELATIVE_PATH} must be a JSON object`);
  }
  const deny = permissions['deny'] ?? [];
  if (!Array.isArray(deny) || !deny.every((rule) => typeof rule === 'string')) {
    return fail(`"permissions.deny" in ${LOCAL_SETTINGS_RELATIVE_PATH} must be a list of rules`);
  }
  return ok({ settings, permissions, deny });
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
