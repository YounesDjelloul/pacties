import type { Contract, ContractDiff } from '@/domain/ledger/types';

export function diffContracts(before: Contract | null, after: Contract): ContractDiff {
  return {
    interfaceAdded: linesOnlyIn(after.interface, before?.interface ?? []),
    interfaceRemoved: linesOnlyIn(before?.interface ?? [], after.interface),
    dependsOnAdded: linesOnlyIn(after.dependsOn, before?.dependsOn ?? []),
    dependsOnRemoved: linesOnlyIn(before?.dependsOn ?? [], after.dependsOn),
  };
}

function linesOnlyIn(source: string[], other: string[]): string[] {
  const otherLines = new Set(other);
  return source.filter((line) => !otherLines.has(line));
}
