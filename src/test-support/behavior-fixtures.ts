import type { ProposalInput } from '@/domain/ledger/types';

export const transferOverDailyLimit: ProposalInput = {
  description: '  transfer over daily limit\r\nreturns 429 ',
  contract: {
    interface: [
      'POST /transfer {  from_id, to_id, amount }\r\n',
      '\t-> 429 { error: "DAILY_LIMIT_EXCEEDED", remaining }',
    ],
    dependsOn: ['get_daily_total(user_id) -> int', 'get_daily_total(user_id)  ->  int'],
  },
};

export const refundOutsideWindow: ProposalInput = {
  description: 'refund requested 31 days after purchase is refused',
  contract: {
    interface: ['POST /refunds { order_id, reason } -> 422 { error: "REFUND_WINDOW_CLOSED", closed_at }'],
    dependsOn: ['get_order(order_id) -> { purchased_at: ISO-8601 }'],
  },
};

export const accentedPayeeName: ProposalInput = {
  description: 'payee named "Zoë Ørsted-Ñúñez" is stored without transliteration',
  contract: {
    interface: ['PUT /payees/:id { display_name } -> 200 { display_name }'],
  },
};
