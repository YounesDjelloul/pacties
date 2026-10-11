import { CLIENT_IDS } from '@/domain/clients/constants';
import { fail, ok } from '@/domain/shared/result';
import type { Result } from '@/domain/shared/types';
import type { ClientId } from '@/domain/clients/types';

export function parseClientIds(raw: string): Result<ClientId[]> {
  const requested = [...new Set(raw.split(',').map((id) => id.trim().toLowerCase()).filter((id) => id.length > 0))];
  if (requested.length === 0) {
    return fail(`Name at least one client: ${CLIENT_IDS.join(', ')}`);
  }

  const unknown = requested.filter((id) => !isClientId(id));
  if (unknown.length > 0) {
    return fail(`pacties does not support "${unknown.join('", "')}" yet; supported: ${CLIENT_IDS.join(', ')}. Run "pacties init --print" to register it by hand`);
  }
  return ok(requested as ClientId[]);
}

export function isClientId(value: string): value is ClientId {
  return (CLIENT_IDS as readonly string[]).includes(value);
}
