import { collapseWhitespace } from '@/domain/shared/normalize-text';
import { fail, ok } from '@/domain/shared/result';
import type { Result } from '@/domain/shared/types';
import type { BehaviorContent, ContractInput } from '@/domain/ledger/types';

export function normalizeContent(description: string, contract: ContractInput): Result<BehaviorContent> {
  const normalizedDescription = collapseWhitespace(description);
  if (normalizedDescription.length === 0) {
    return fail('Behavior description must not be empty');
  }

  const normalizedInterface = normalizeLines(contract.interface);
  if (normalizedInterface.length === 0) {
    return fail('Contract interface must contain at least one non-empty line, e.g. "POST /transfer { from_id, to_id, amount } -> 201"');
  }

  return ok({
    description: normalizedDescription,
    contract: {
      interface: normalizedInterface,
      dependsOn: normalizeLines(contract.dependsOn ?? []),
    },
  });
}

export function normalizeReason(reason: string): Result<string> {
  const normalized = collapseWhitespace(reason);
  if (normalized.length === 0) {
    return fail('A reason is required so the developer knows why this changed');
  }
  return ok(normalized);
}

export function contentsEqual(left: BehaviorContent, right: BehaviorContent): boolean {
  return (
    left.description === right.description &&
    linesEqual(left.contract.interface, right.contract.interface) &&
    linesEqual(left.contract.dependsOn, right.contract.dependsOn)
  );
}

function normalizeLines(lines: string[]): string[] {
  const normalized = lines.map(collapseWhitespace).filter((line) => line.length > 0);
  return [...new Set(normalized)];
}

function linesEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((line, index) => line === right[index]);
}
