export type Confidence = "high" | "medium" | "low";

export type Money = {
  currency: "BRL" | "USD" | "EUR";
  amountMinor: number;
};

export type InterpretationKind = "transaction" | "commitment";

export type FinancialInterpretation = {
  kind: InterpretationKind;
  description: string;
  money: Money;
  direction: "expense" | "income" | "transfer";
  occurredOn?: string;
  dueDay?: number;
  recurring: boolean;
  recurrence?: "monthly";
  installment?: { current: number; total: number };
  confidence: Confidence;
  fieldConfidence: Record<string, number>;
  sourceText: string;
  parserVersion: "text-v0.1";
  needsReview: string[];
};

export type HomeSnapshotInput = {
  availableMinor: number;
  incomeMinor: number;
  paidExpenseMinor: number;
  futureCommitmentsMinor: number;
  dueSoonMinor: number;
};

export type HomeSnapshot = HomeSnapshotInput & {
  projectedRemainderMinor: number;
};
