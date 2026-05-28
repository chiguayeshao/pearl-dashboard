import { NextResponse } from "next/server"

// Pearl 白皮书发行公式: E(t) = S·H / ((t+H)·(t+H-1))
const EMISSION_S = 2_100_000_000 // 总供应量 PRL
const EMISSION_H = 650_226        // 半衰期区块数（约4年）

function calcBlockReward(blockHeight: number): number {
  const t = blockHeight
  return (EMISSION_S * EMISSION_H) / ((t + EMISSION_H) * (t + EMISSION_H - 1))
}

export async function GET() {
  try {
    // 同时请求矿池统计 + 链上信息
    const [statsRes, chainRes] = await Promise.all([
      fetch("https://pearlhash.xyz/api/stats", {
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "no-store",
      }),
      fetch("https://pearlhash.xyz/api/chain-info", {
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "no-store",
      }),
    ])

    const [stats, chain] = await Promise.all([statsRes.json(), chainRes.json()])

    // 全网算力来自 chain-info.networkhashps（注意：stats.hashrate 是矿池算力，不是全网）
    const totalHashrateTH = Number(chain.networkhashps) / 1e12
    // 矿池算力单独保存，用于展示矿池占比
    const poolHashrateTH = Number(stats.hashrate) / 1e12

    // 出块时间来自链上实测均值
    const blockTimeSeconds = Number(chain.avg_block_time_s)

    // 区块高度用于动态计算区块奖励（衰减公式）
    const blockHeight = Number(chain.blocks)
    const blockRewardPRL = calcBlockReward(blockHeight)

    return NextResponse.json({
      totalHashrateTH,      // 全网算力 TH/s（来自 chain-info.networkhashps）
      poolHashrateTH,       // 矿池算力 TH/s（来自 stats.hashrate）
      blockRewardPRL,       // 当前区块奖励 PRL（动态计算）
      blockTimeSeconds,     // 实测平均出块时间 s（来自 chain-info）
      blockHeight,          // 当前区块高度
      totalWorkers: stats.total_workers ?? null,
      totalAccounts: stats.total_accounts ?? null,
      source: "live",
    })
  } catch {
    // fallback：使用已知真实值
    const fallbackHeight = 62775
    return NextResponse.json({
      totalHashrateTH: 20_788_858, // ~20.79 EH/s 全网算力
      poolHashrateTH: 4_999_568,   // ~5 PH/s 矿池算力
      blockRewardPRL: calcBlockReward(fallbackHeight),
      blockTimeSeconds: 102.62,
      blockHeight: fallbackHeight,
      totalWorkers: null,
      totalAccounts: null,
      source: "fallback",
    })
  }
}
