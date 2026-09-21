export function remainingInstallments(current: number, total: number): number {
  if (!Number.isInteger(current) || !Number.isInteger(total) || current < 1 || total < current) {
    throw new Error("INVALID_INSTALLMENT_PLAN");
  }
  return total - current;
}

export function projectedInstallmentTotalMinor(valueMinor: number, current: number, total: number): number {
  return valueMinor * remainingInstallments(current, total);
}
