import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

/** GET /api/history?address=0x... */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const { rows } = await pool.query(
    `SELECT id, wallet_address, created_at, provider, from_chain, to_chain,
            from_token, to_token, amount, recipient, source_tx_hash, status,
            destination_tx_hash, failure_message, deposit_address, deposit_memo
     FROM bridge_history
     WHERE wallet_address = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [address.toLowerCase()]
  );

  const entries = rows.map((r) => ({
    id: r.id,
    createdAt: Number(r.created_at),
    provider: r.provider,
    fromChain: r.from_chain,
    toChain: r.to_chain,
    fromToken: r.from_token,
    toToken: r.to_token,
    amount: r.amount,
    recipient: r.recipient,
    sourceTxHash: r.source_tx_hash,
    status: r.status,
    destinationTxHash: r.destination_tx_hash ?? undefined,
    failureMessage: r.failure_message ?? undefined,
    depositAddress: r.deposit_address ?? undefined,
    depositMemo: r.deposit_memo ?? undefined,
  }));

  return NextResponse.json(entries);
}

/** POST /api/history — create a new entry */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    walletAddress,
    provider,
    fromChain,
    toChain,
    fromToken,
    toToken,
    amount,
    recipient,
    sourceTxHash,
    depositAddress,
    depositMemo,
  } = body;

  if (!walletAddress || !sourceTxHash) {
    return NextResponse.json({ error: "walletAddress and sourceTxHash required" }, { status: 400 });
  }

  const id = `${sourceTxHash}-${Date.now()}`;
  const createdAt = Date.now();

  await pool.query(
    `INSERT INTO bridge_history
       (id, wallet_address, created_at, provider, from_chain, to_chain,
        from_token, to_token, amount, recipient, source_tx_hash, status,
        deposit_address, deposit_memo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending',$12,$13)`,
    [
      id,
      walletAddress.toLowerCase(),
      createdAt,
      provider,
      fromChain,
      toChain,
      fromToken,
      toToken,
      amount,
      recipient,
      sourceTxHash,
      depositAddress ?? null,
      depositMemo ?? null,
    ]
  );

  return NextResponse.json({
    id,
    createdAt,
    provider,
    fromChain,
    toChain,
    fromToken,
    toToken,
    amount,
    recipient,
    sourceTxHash,
    status: "pending",
    depositAddress,
    depositMemo,
  });
}
