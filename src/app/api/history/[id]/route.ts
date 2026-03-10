import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

/** PATCH /api/history/[id] — update status, destinationTxHash, failureMessage */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { status, destinationTxHash, failureMessage } = body;

  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  if (status) {
    sets.push(`status = $${idx++}`);
    vals.push(status);
  }
  if (destinationTxHash !== undefined) {
    sets.push(`destination_tx_hash = $${idx++}`);
    vals.push(destinationTxHash);
  }
  if (failureMessage !== undefined) {
    sets.push(`failure_message = $${idx++}`);
    vals.push(failureMessage);
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  vals.push(id);
  await pool.query(
    `UPDATE bridge_history SET ${sets.join(", ")} WHERE id = $${idx}`,
    vals
  );

  return NextResponse.json({ ok: true });
}
