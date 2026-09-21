import type { HomeSnapshot, HomeSnapshotInput } from "./types.js";

export function deriveHomeSnapshot(input: HomeSnapshotInput): HomeSnapshot {
  return {
    ...input,
    projectedRemainderMinor: input.availableMinor + input.incomeMinor - input.futureCommitmentsMinor
  };
}
