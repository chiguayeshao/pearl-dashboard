import { NextResponse } from "next/server"

const OFFERS_URL = "https://api.pearl-otc.com/offers"

export async function GET() {
  try {
    const res = await fetch(OFFERS_URL, { cache: "no-store" })
    if (!res.ok) throw new Error(`pearl-otc API ${res.status}`)

    const raw: { side: string; status: string; usdc_per_prl: string; prl_remaining: string }[] = await res.json()
    const active = raw.filter(o => o.status === "ACTIVE")

    // mirror pearl-otc.com: only consider offers with prl_remaining >= 5000
    const liquid = active.filter(o => parseFloat(o.prl_remaining) >= 5000)

    const asks = liquid
      .filter(o => o.side === "SELL_PRL")
      .map(o => parseFloat(o.usdc_per_prl))
      .filter(p => p > 0)
    const bids = liquid
      .filter(o => o.side === "BUY_PRL")
      .map(o => parseFloat(o.usdc_per_prl))
      .filter(p => p > 0)

    const bestAsk = asks.length ? Math.min(...asks) : null
    const bestBid = bids.length ? Math.max(...bids) : null

    if (bestAsk == null && bestBid == null) throw new Error("no active offers")

    return NextResponse.json({ bestAsk, bestBid, source: "pearl-otc.com", updatedAt: Date.now() })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
