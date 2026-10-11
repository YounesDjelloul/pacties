import { describe, expect, it } from 'vitest';
import { diffContracts } from '@/domain/ledger/contract-diff';

const transfer = {
  interface: ['POST /transfer { from_id, to_id, amount }', '-> 429 { error: "DAILY_LIMIT_EXCEEDED", remaining }'],
  dependsOn: ['get_daily_total(user_id) -> int'],
};

describe('diffContracts', () => {
  it('reports every line as added when there is no previous contract', () => {
    expect(diffContracts(null, transfer)).toEqual({
      interfaceAdded: transfer.interface,
      interfaceRemoved: [],
      dependsOnAdded: transfer.dependsOn,
      dependsOnRemoved: [],
    });
  });

  it('reports nothing for identical contracts', () => {
    expect(diffContracts(transfer, structuredClone(transfer))).toEqual({
      interfaceAdded: [],
      interfaceRemoved: [],
      dependsOnAdded: [],
      dependsOnRemoved: [],
    });
  });

  it('reports a changed line as one removal plus one addition', () => {
    const after = { ...transfer, interface: [transfer.interface[0]!, '-> 429 { error: "DAILY_LIMIT_EXCEEDED", remaining, retry_after }'] };
    expect(diffContracts(transfer, after)).toMatchObject({
      interfaceAdded: ['-> 429 { error: "DAILY_LIMIT_EXCEEDED", remaining, retry_after }'],
      interfaceRemoved: ['-> 429 { error: "DAILY_LIMIT_EXCEEDED", remaining }'],
    });
  });

  it('ignores pure reordering of lines', () => {
    const after = { ...transfer, interface: [...transfer.interface].reverse() };
    expect(diffContracts(transfer, after).interfaceAdded).toEqual([]);
    expect(diffContracts(transfer, after).interfaceRemoved).toEqual([]);
  });

  it('tracks dependencies separately from interface lines that share text', () => {
    const after = { interface: [...transfer.interface, 'get_daily_total(user_id) -> int'], dependsOn: [] };
    expect(diffContracts(transfer, after)).toEqual({
      interfaceAdded: ['get_daily_total(user_id) -> int'],
      interfaceRemoved: [],
      dependsOnAdded: [],
      dependsOnRemoved: ['get_daily_total(user_id) -> int'],
    });
  });
});
