import { PLATFORM_FEE_BPS } from "@/config/constants";

export function calculatePlatformFee(amount: bigint, feeBps: number = PLATFORM_FEE_BPS): bigint {
  return (amount * BigInt(feeBps)) / 10000n;
}

export function calculateOutputAmount(
  inputAmount: bigint,
  platformFeeBps: number = PLATFORM_FEE_BPS,
  bridgeFeeBps: number = 0
): { outputAmount: bigint; platformFee: bigint; bridgeFee: bigint } {
  const platformFee = calculatePlatformFee(inputAmount, platformFeeBps);
  const afterPlatformFee = inputAmount - platformFee;
  const bridgeFee = (afterPlatformFee * BigInt(bridgeFeeBps)) / 10000n;
  const outputAmount = afterPlatformFee - bridgeFee;

  return { outputAmount, platformFee, bridgeFee };
}

export function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

export function formatFeeBps(bps: number): string {
  if (bps === 0) return "Free";
  if (bps < 10) return `${bps} bps (${bpsToPercent(bps)})`;
  return bpsToPercent(bps);
}
