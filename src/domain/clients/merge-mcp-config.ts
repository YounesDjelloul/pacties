import { SERVER_NAME_PREFIX } from '@/domain/clients/constants';
import { toStdioEntry } from '@/domain/clients/server-specs';
import { fail, ok } from '@/domain/shared/result';
import type { Result } from '@/domain/shared/types';
import type { ServerSpec } from '@/domain/clients/types';

type JsonObject = Record<string, unknown>;

export function mergeServersIntoMcpConfig(existing: unknown, servers: ServerSpec[]): Result<JsonObject> {
  const config = existing ?? {};
  if (!isJsonObject(config)) {
    return fail('the MCP config file must contain a JSON object');
  }

  const currentServers = config.mcpServers ?? {};
  if (!isJsonObject(currentServers)) {
    return fail('"mcpServers" in the MCP config file must be a JSON object');
  }

  const foreignServers = Object.fromEntries(Object.entries(currentServers).filter(([name]) => !name.startsWith(SERVER_NAME_PREFIX)));
  const pactiesServers = Object.fromEntries(servers.map((spec) => [spec.name, toStdioEntry(spec)]));
  return ok({ ...config, mcpServers: { ...foreignServers, ...pactiesServers } });
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
