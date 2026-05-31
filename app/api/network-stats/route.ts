import { NextResponse } from "next/server"

const EMISSION_S = 2_100_000_000
const EMISSION_H = 650_226

function calcBlockReward(blockHeight: number): number {
  const t = blockHeight
  return (EMISSION_S * EMISSION_H) / ((t + EMISSION_H) * (t + EMISSION_H - 1))
}

/** 解析 "4.68 EH/s" / "9.07 PH/s" 等字符串 → TH/s */
function parseHashrateStr(s: string): number {
  const m = s.match(/([\d.]+)\s*(TH|PH|EH|ZH)\/s/i)
  if (!m) return 0
  const n = parseFloat(m[1])
  const u = m[2].toUpperCase()
  if (u === "TH") return n
  if (u === "PH") return n * 1e3
  if (u === "EH") return n * 1e6
  if (u === "ZH") return n * 1e9
  return 0
}

export async function GET() {
  try {
    // 同时拉三个接口；chain-info 较慢，设 5 秒超时
    const chainInfoCtrl = new AbortController()
    const chainInfoTimer = setTimeout(() => chainInfoCtrl.abort(), 5000)

    const [pearlhashStats, alphapoolStats, pearlhashChain] = await Promise.all([
      fetch("https://pearlhash.xyz/api/stats", {
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "no-store",
      }).then(r => r.json()),
      fetch("https://pearl.alphapool.tech/api/stats", {
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "no-store",
      }).then(r => r.json()),
      fetch("https://pearlhash.xyz/api/chain-info", {
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "no-store",
        signal: chainInfoCtrl.signal,
      }).then(r => r.json()).catch(() => null),
    ])
    clearTimeout(chainInfoTimer)

    // pearlhash: hashrate 是原始 H/s 整数
    const pool1HashrateTH = Number(pearlhashStats.hashrate) / 1e12
    const pool1Workers    = Number(pearlhashStats.total_workers ?? 0)

    // alphapool: hashrate 是字符串如 "4.68 EH/s"
    const pool2HashrateTH = parseHashrateStr(String(alphapoolStats.pool?.hashrate ?? ""))
    const pool2Workers    = Number(alphapoolStats.pool?.workers ?? alphapoolStats.pool?.miners24h ?? 0)

    // 全网算力：优先用 alphapool coins[0].network_hash
    const networkHashStr  = alphapoolStats.coins?.[0]?.network_hash ?? ""
    const totalHashrateTH = parseHashrateStr(networkHashStr) || (pool1HashrateTH + pool2HashrateTH)

    // 区块信息
    const blockHeight    = Number(alphapoolStats.chain?.height ?? alphapoolStats.coins?.[0]?.block_height ?? 0)
    const blockRewardPRL = calcBlockReward(blockHeight) || Number(alphapoolStats.coins?.[0]?.reward ?? 0)

    // 出块时间：优先用 pearlhash chain-info 实测值
    // 备用：用 alphapool blocks24h ÷ 矿池算力占比 推算全网出块速度
    let blockTimeSeconds = 102.62
    if (pearlhashChain?.avg_block_time_s && pearlhashChain.avg_block_time_s > 0) {
      blockTimeSeconds = Number(pearlhashChain.avg_block_time_s)
    } else {
      const alphaBlocks24h = Number(
        alphapoolStats.pool?.blocks24h ??
        alphapoolStats.pool?.blocks_per_day ??
        alphapoolStats.coins?.[0]?.blocks24h ?? 0
      )
      const alphaShare = totalHashrateTH > 0 ? pool2HashrateTH / totalHashrateTH : 0
      if (alphaBlocks24h > 0 && alphaShare > 0) {
        const networkBlocksPerDay = alphaBlocks24h / alphaShare
        blockTimeSeconds = 86400 / networkBlocksPerDay
      }
    }

    const totalWorkers = pool1Workers + pool2Workers

    return NextResponse.json({
      totalHashrateTH,
      pool1HashrateTH,
      pool1Workers,
      pool2HashrateTH,
      pool2Workers,
      blockRewardPRL,
      blockTimeSeconds,
      blockHeight,
      totalWorkers,
      source: "live",
    })
  } catch {
    const fallbackHeight = 64887
    return NextResponse.json({
      totalHashrateTH: 23_830_000,
      pool1HashrateTH: 9_068_327,
      pool1Workers: 36492,
      pool2HashrateTH: 4_680_000,
      pool2Workers: 34111,
      blockRewardPRL: calcBlockReward(fallbackHeight),
      blockTimeSeconds: 110,
      blockHeight: fallbackHeight,
      totalWorkers: 70603,
      source: "fallback",
    })
  }
}
