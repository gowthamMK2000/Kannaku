export type Category = "food" | "stay" | "travel" | "fun";
export type SplitMethod = "equal" | "custom" | "select";
export type BotStatus = "connected" | "reconnecting" | "disconnected";

export interface TripUser {
  id: string;
  name: string;
  phone_number: string | null;
  is_admin: boolean;
  sort_order: number;
  created_at: string;
}

export interface ExpenseSplit {
  id: string;
  expense_id: string;
  user_id: string;
  split_amount: number;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: Category;
  split_method: SplitMethod;
  paid_by_id: string | null;
  occurred_at: string;
  created_at: string;
  splits: ExpenseSplit[];
}

export interface TripSettings {
  id: number;
  trip_name: string;
  trip_dates: string | null;
  banker_upi_id: string | null;
  whatsapp_group_jid: string | null;
  last_bad_cop_sent_at: string | null;
}

/** Money a member put into the shared pool, or paid the banker to settle
 * their own balance — both are the same kind of record: cash the banker now
 * holds. See lib/balances.ts for how this feeds into everyone's balance. */
export interface Deposit {
  id: string;
  user_id: string;
  amount: number;
  note: string | null;
  deposited_at: string;
  created_at: string;
}

/** Money the banker paid back to a member — the reverse of a Deposit. */
export interface Payout {
  id: string;
  user_id: string;
  amount: number;
  note: string | null;
  paid_at: string;
  created_at: string;
}

export interface TripData {
  settings: TripSettings;
  users: TripUser[];
  expenses: Expense[];
  deposits: Deposit[];
  payouts: Payout[];
}
