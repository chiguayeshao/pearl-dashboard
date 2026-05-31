"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Plus, Trash2, Cpu, TrendingUp, TrendingDown, DollarSign, Zap, RefreshCw } from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts"

interface GPU {
  id: string
  name: string
  hashrateTH: number   // TH/s
  costPerHour: number  // USD
  count: number
}

interface NetworkStats {
  totalHashrateTH: number
  pool1HashrateTH: number
  pool1Workers: number
  pool2HashrateTH: number
  pool2Workers: number
  blockRewardPRL: number
  blockTimeSeconds: number
  blockHeight: number
  totalWorkers: number | null
  loading: boolean
  lastUpdated: string
}

const DEFAULT_GPUS: GPU[] = []

// GPU 预设（实测来源标注）
// H100 SXM 80GB: RunPod 实测 246 TH/s
// RTX 4090: matpool 实测均值 (27589机5卡=1250TH→250TH/卡; 26070机2卡=492TH→246TH/卡) 取 250 TH/s
// H200 SXM: Spheron 实测进行中，当前为基于硬件规格的估算值，待矿池数据更新
const GPU_PRESETS = [
  { name: "H100 SXM 80GB", hashrateTH: 246, costPerHour: 3.29, note: "RunPod 实测" },
  { name: "H200 SXM", hashrateTH: 340, costPerHour: 4.00, note: "预估·待实测" },
  { name: "RTX 4090", hashrateTH: 250, costPerHour: 0.30, note: "matpool 实测 ¥2.2/h" },
]

function generateId() {
  return Math.random().toString(36).slice(2, 9)
}

function formatNumber(n: number, decimals = 2) {
  if (n >= 1e6) return (n / 1e6).toFixed(decimals) + "M"
  if (n >= 1e3) return (n / 1e3).toFixed(decimals) + "K"
  return n.toFixed(decimals)
}

export default function PearlDashboard() {
  const [gpus, setGpus] = useState<GPU[]>(DEFAULT_GPUS)
  const [prlPrice, setPrlPrice] = useState<number>(0.95)
  const [prlPriceSource, setPrlPriceSource] = useState<"live" | "manual">("manual")
  const [prlPriceLoading, setPrlPriceLoading] = useState(false)
  const [prlPriceUpdated, setPrlPriceUpdated] = useState("")
  const [prlBestAsk, setPrlBestAsk] = useState<number | null>(null)
  const [prlBestBid, setPrlBestBid] = useState<number | null>(null)
  const [network, setNetwork] = useState<NetworkStats>({
    totalHashrateTH: 23_830_000,
    pool1HashrateTH: 9_068_327,
    pool1Workers: 36492,
    pool2HashrateTH: 4_680_000,
    pool2Workers: 34111,
    blockRewardPRL: 2670,
    blockTimeSeconds: 110,
    blockHeight: 64887,
    totalWorkers: 70603,
    loading: false,
    lastUpdated: "",
  })
  const [newGpu, setNewGpu] = useState({ name: "", hashrateTH: "", costPerHour: "", count: "1" })

  // ---- Fetch network stats ----
  const fetchNetworkStats = useCallback(async () => {
    setNetwork(prev => ({ ...prev, loading: true }))
    try {
      const res = await fetch("/api/network-stats")
      if (res.ok) {
        const data = await res.json()
        setNetwork({
          totalHashrateTH: data.totalHashrateTH,
          pool1HashrateTH: data.pool1HashrateTH ?? 0,
          pool1Workers:    data.pool1Workers ?? 0,
          pool2HashrateTH: data.pool2HashrateTH ?? 0,
          pool2Workers:    data.pool2Workers ?? 0,
          blockRewardPRL:  data.blockRewardPRL,
          blockTimeSeconds: data.blockTimeSeconds,
          blockHeight:     data.blockHeight ?? 0,
          totalWorkers:    data.totalWorkers ?? null,
          loading: false,
          lastUpdated: new Date().toLocaleTimeString(),
        })
      } else {
        setNetwork(prev => ({ ...prev, loading: false, lastUpdated: new Date().toLocaleTimeString() }))
      }
    } catch {
      setNetwork(prev => ({ ...prev, loading: false, lastUpdated: new Date().toLocaleTimeString() }))
    }
  }, [])

  useEffect(() => {
    fetchNetworkStats()
    const interval = setInterval(fetchNetworkStats, 60000)
    return () => clearInterval(interval)
  }, [fetchNetworkStats])

  // ---- Fetch PRL price from pearl-otc.com (no API key needed) ----
  const fetchPrlPrice = useCallback(async () => {
    setPrlPriceLoading(true)
    try {
      const res = await fetch("/api/prl-price")
      if (res.ok) {
        const data = await res.json()
        if (data.bestAsk != null || data.bestBid != null) {
          setPrlBestAsk(data.bestAsk)
          setPrlBestBid(data.bestBid)
          // 用 mid price 作为收益计算基准
          const mid = data.bestAsk != null && data.bestBid != null
            ? (data.bestAsk + data.bestBid) / 2
            : (data.bestAsk ?? data.bestBid)
          setPrlPrice(mid)
          setPrlPriceSource("live")
          setPrlPriceUpdated(new Date().toLocaleTimeString())
        }
      }
    } catch {
      // 保留当前价格
    } finally {
      setPrlPriceLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPrlPrice()
    const interval = setInterval(fetchPrlPrice, 5 * 60 * 1000) // 每 5 分钟刷新
    return () => clearInterval(interval)
  }, [fetchPrlPrice])

  // ---- LocalStorage persistence ----
  // 挂载后从 localStorage 恢复（避免 SSR hydration mismatch）
  useEffect(() => {
    try {
      const savedGpus = localStorage.getItem("pearl-gpus")
      if (savedGpus) setGpus(JSON.parse(savedGpus))
    } catch {}
    try {
      const savedPrice = localStorage.getItem("pearl-prl-price")
      if (savedPrice) setPrlPrice(parseFloat(savedPrice))
    } catch {}
  }, []) // 仅挂载时执行一次

  useEffect(() => {
    try { localStorage.setItem("pearl-gpus", JSON.stringify(gpus)) } catch {}
  }, [gpus])

  useEffect(() => {
    if (prlPriceSource === "manual") {
      try { localStorage.setItem("pearl-prl-price", String(prlPrice)) } catch {}
    }
  }, [prlPrice, prlPriceSource])

  // ---- Calculations ----
  const totalMyHashrateTH = gpus.reduce((sum, g) => sum + g.hashrateTH * g.count, 0)
  const totalCostPerHour = gpus.reduce((sum, g) => sum + g.costPerHour * g.count, 0)
  const totalCostPerDay = totalCostPerHour * 24

  const networkTH = network.totalHashrateTH // already in TH/s from API
  const myShare = totalMyHashrateTH / (networkTH + totalMyHashrateTH)

  const blocksPerDay = 86400 / network.blockTimeSeconds
  const dailyNetworkPRL = blocksPerDay * network.blockRewardPRL
  const myDailyPRL = dailyNetworkPRL * myShare
  const myDailyRevenue = myDailyPRL * prlPrice
  const myDailyProfit = myDailyRevenue - totalCostPerDay

  // breakeven price: cost = prl * myDailyPRL => prl = cost / myDailyPRL
  const breakevenPrice = myDailyPRL > 0 ? totalCostPerDay / myDailyPRL : 0

  // Chart: revenue vs PRL price ($0 to $5), price as number for accurate ReferenceLine positioning
  const chartData = Array.from({ length: 101 }, (_, i) => {
    const price = parseFloat((i * 0.05).toFixed(2))
    const rev = myDailyPRL * price
    return { price, revenue: parseFloat(rev.toFixed(2)), cost: parseFloat(totalCostPerDay.toFixed(2)) }
  })

  // ---- GPU Management ----
  function addGpu() {
    if (!newGpu.name || !newGpu.hashrateTH || !newGpu.costPerHour) return
    setGpus(prev => [...prev, {
      id: generateId(),
      name: newGpu.name,
      hashrateTH: parseFloat(newGpu.hashrateTH),
      costPerHour: parseFloat(newGpu.costPerHour),
      count: parseInt(newGpu.count) || 1,
    }])
    setNewGpu({ name: "", hashrateTH: "", costPerHour: "", count: "1" })
  }

  function removeGpu(id: string) {
    setGpus(prev => prev.filter(g => g.id !== id))
  }

  function updateGpu(id: string, field: keyof GPU, value: string | number) {
    setGpus(prev => prev.map(g => g.id === id ? { ...g, [field]: typeof value === "string" ? parseFloat(value) || 0 : value } : g))
  }

  const isProfit = myDailyProfit >= 0

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <span className="text-violet-400">⬡</span> Pearl Mining Dashboard
            </h1>
            <p className="text-zinc-500 text-sm mt-1">实时收益计算 · 盈亏平衡分析</p>
          </div>
          <div className="flex items-center gap-3">
            {network.lastUpdated && (
              <span className="text-xs text-zinc-500">更新于 {network.lastUpdated}</span>
            )}
            <a
              href="https://x.com/0x_JBCat"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-sky-500 hover:text-sky-400 transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              关注 @0x_JBCat
            </a>
            <Button variant="outline" size="sm" onClick={fetchNetworkStats} disabled={network.loading} className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
              <RefreshCw className={`w-3.5 h-3.5 ${network.loading ? "animate-spin" : ""}`} />
              刷新网络
            </Button>
          </div>
        </div>

        {/* Network Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

          {/* 全网算力 + 双矿池 */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-500">全网算力</span>
                <Zap className="w-4 h-4 text-violet-400" />
              </div>
              <div className="text-xl font-bold">
                {(network.totalHashrateTH / 1e6).toFixed(2)} EH/s
              </div>
              <div className="mt-2 space-y-1">
                <a href="https://pearlhash.xyz/" target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between group">
                  <span className="text-[10px] text-zinc-500 group-hover:text-violet-400 transition-colors underline decoration-dotted">
                    pearlhash.xyz
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    {(network.pool1HashrateTH / 1e6).toFixed(2)} EH/s
                    <span className="text-zinc-600 ml-1">
                      {network.totalHashrateTH > 0
                        ? `${((network.pool1HashrateTH / network.totalHashrateTH) * 100).toFixed(1)}%`
                        : "—"}
                    </span>
                  </span>
                </a>
                <a href="https://pearl.alphapool.tech/" target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between group">
                  <span className="text-[10px] text-zinc-500 group-hover:text-violet-400 transition-colors underline decoration-dotted">
                    alphapool.tech
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    {(network.pool2HashrateTH / 1e6).toFixed(2)} EH/s
                    <span className="text-zinc-600 ml-1">
                      {network.totalHashrateTH > 0
                        ? `${((network.pool2HashrateTH / network.totalHashrateTH) * 100).toFixed(1)}%`
                        : "—"}
                    </span>
                  </span>
                </a>
              </div>
            </CardContent>
          </Card>

          {[
            {
              label: "区块高度 / 奖励",
              value: `${network.blockRewardPRL.toFixed(0)} PRL`,
              icon: <TrendingUp className="w-4 h-4 text-emerald-400" />,
              sub: `#${network.blockHeight.toLocaleString()} · 出块 ${network.blockTimeSeconds.toFixed(0)}s`,
            },
            {
              label: "全网日产出 PRL",
              value: formatNumber(blocksPerDay * network.blockRewardPRL),
              icon: <DollarSign className="w-4 h-4 text-yellow-400" />,
              sub: `${blocksPerDay.toFixed(0)} 块/天 · 在线矿工 ${network.totalWorkers?.toLocaleString() ?? "—"}`,
            },
          ].map(item => (
            <Card key={item.label} className="bg-zinc-900 border-zinc-800">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-zinc-500">{item.label}</span>
                  {item.icon}
                </div>
                <div className="text-xl font-bold">{item.value}</div>
                <div className="text-xs text-zinc-500 mt-1">{item.sub}</div>
              </CardContent>
            </Card>
          ))}

          {/* PRL OTC Price Card */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-500">PRL 价格（OTC）</span>
                <button
                  onClick={fetchPrlPrice}
                  disabled={prlPriceLoading}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${prlPriceLoading ? "animate-spin" : ""}`} />
                </button>
              </div>

              {prlPriceLoading ? (
                <div className="text-xl font-bold text-zinc-500">…</div>
              ) : prlPriceSource === "live" ? (
                <div className="flex items-center gap-3 mt-1">
                  <div>
                    <div className="text-[10px] text-emerald-500 mb-0.5">Bid</div>
                    <div className="text-lg font-bold font-mono text-emerald-400">
                      ${prlBestBid?.toFixed(4) ?? "—"}
                    </div>
                  </div>
                  <div className="text-zinc-600 text-sm font-light">|</div>
                  <div>
                    <div className="text-[10px] text-red-400 mb-0.5">Ask</div>
                    <div className="text-lg font-bold font-mono text-red-400">
                      ${prlBestAsk?.toFixed(4) ?? "—"}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xl font-bold">${prlPrice.toFixed(2)}</div>
              )}

              <div className="flex items-center gap-1 mt-2">
                {prlPriceSource === "live" ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] text-zinc-500">
                      pearl-otc.com · {prlPriceUpdated}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                    <span className="text-[10px] text-zinc-500">手动输入</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: Config */}
          <div className="lg:col-span-1 space-y-4">

            {/* PRL Price Config */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm text-zinc-300">参数配置</CardTitle>
                  {prlPriceSource === "live" ? (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      pearl-otc.com 实时
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                      手动输入
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label className="text-xs text-zinc-400">PRL 计算价格 (USD)</Label>
                    <button
                      onClick={fetchPrlPrice}
                      disabled={prlPriceLoading}
                      className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${prlPriceLoading ? "animate-spin" : ""}`} />
                      {prlPriceUpdated ? `${prlPriceUpdated}` : "刷新"}
                    </button>
                  </div>

                  {/* Bid / Ask display */}
                  {prlPriceSource === "live" && (
                    <div className="flex gap-2 mb-2">
                      <div className="flex-1 rounded bg-zinc-800 px-3 py-1.5 text-center">
                        <div className="text-[10px] text-emerald-500 mb-0.5">Best Bid</div>
                        <div className="text-sm font-mono font-semibold text-emerald-400">
                          ${prlBestBid?.toFixed(4) ?? "—"}
                        </div>
                      </div>
                      <div className="flex-1 rounded bg-zinc-800 px-3 py-1.5 text-center">
                        <div className="text-[10px] text-red-400 mb-0.5">Best Ask</div>
                        <div className="text-sm font-mono font-semibold text-red-400">
                          ${prlBestAsk?.toFixed(4) ?? "—"}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={prlPrice}
                      onChange={e => {
                        setPrlPrice(parseFloat(e.target.value) || 0)
                        setPrlPriceSource("manual")
                      }}
                      className="bg-zinc-800 border-zinc-700 text-zinc-100"
                    />
                    <div className="flex gap-1">
                      {[0.5, 1, 1.5, 2].map(p => (
                        <button
                          key={p}
                          onClick={() => { setPrlPrice(p); setPrlPriceSource("manual") }}
                          className={`text-xs px-2 py-1 rounded border transition-colors ${prlPrice === p ? "bg-violet-600 border-violet-500 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}
                        >
                          ${p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-1.5">
                    {prlPriceSource === "live"
                      ? "收益按 mid price 计算 · 来源 pearl-otc.com"
                      : "手动模式 · 点击刷新获取 OTC 实时报价"}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* GPU List */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
                  <Cpu className="w-4 h-4" /> 我的矿机
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* GPU 预设快速添加 */}
                <div>
                  <p className="text-xs text-zinc-500 mb-2">快速添加（H100/4090 为实测值，H200 为预估值待矿池更新）</p>
                  <div className="flex flex-wrap gap-1.5">
                    {GPU_PRESETS.map(preset => (
                      <button
                        key={preset.name}
                        onClick={() => setGpus(prev => [...prev, { id: generateId(), name: preset.name, hashrateTH: preset.hashrateTH, costPerHour: preset.costPerHour, count: 1 }])}
                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-violet-500 hover:text-violet-300 transition-colors bg-zinc-800"
                        title={preset.note}
                      >
                        <Plus className="w-3 h-3" />
                        {preset.name}
                        <span className={`text-[10px] ${preset.note.includes("实测") ? "text-emerald-400" : "text-yellow-600"}`}>
                          {preset.note.includes("实测") ? "✓实测" : "参考"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {gpus.map(gpu => (
                  <div key={gpu.id} className="p-3 rounded-lg bg-zinc-800/60 border border-zinc-700/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-zinc-200">{gpu.name}</span>
                      <button onClick={() => removeGpu(gpu.id)} className="text-zinc-500 hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs text-zinc-500">算力 TH/s</Label>
                        <Input type="number" min="0" step="1" value={gpu.hashrateTH} onChange={e => updateGpu(gpu.id, "hashrateTH", e.target.value)} className="h-7 text-xs bg-zinc-700 border-zinc-600 mt-1" />
                      </div>
                      <div>
                        <Label className="text-xs text-zinc-500">$/小时</Label>
                        <Input type="number" min="0" step="0.1" value={gpu.costPerHour} onChange={e => updateGpu(gpu.id, "costPerHour", e.target.value)} className="h-7 text-xs bg-zinc-700 border-zinc-600 mt-1" />
                      </div>
                      <div>
                        <Label className="text-xs text-zinc-500">数量</Label>
                        <Input type="number" min="1" step="1" value={gpu.count} onChange={e => updateGpu(gpu.id, "count", e.target.value)} className="h-7 text-xs bg-zinc-700 border-zinc-600 mt-1" />
                      </div>
                    </div>
                    <div className="flex gap-2 text-xs text-zinc-500">
                      <span>算力: <span className="text-zinc-300">{(gpu.hashrateTH * gpu.count).toFixed(0)} TH/s</span></span>
                      <span>·</span>
                      <span>成本: <span className="text-zinc-300">${(gpu.costPerHour * gpu.count * 24).toFixed(1)}/天</span></span>
                    </div>
                  </div>
                ))}

                {/* Add GPU */}
                <div className="p-3 rounded-lg border border-dashed border-zinc-700 space-y-2">
                  <p className="text-xs text-zinc-500">添加显卡</p>
                  <Input placeholder="型号 (e.g. RTX 4090)" value={newGpu.name} onChange={e => setNewGpu(p => ({ ...p, name: e.target.value }))} className="h-7 text-xs bg-zinc-800 border-zinc-700" />
                  <div className="grid grid-cols-3 gap-2">
                    <Input placeholder="TH/s" type="number" value={newGpu.hashrateTH} onChange={e => setNewGpu(p => ({ ...p, hashrateTH: e.target.value }))} className="h-7 text-xs bg-zinc-800 border-zinc-700" />
                    <Input placeholder="$/hr" type="number" value={newGpu.costPerHour} onChange={e => setNewGpu(p => ({ ...p, costPerHour: e.target.value }))} className="h-7 text-xs bg-zinc-800 border-zinc-700" />
                    <Input placeholder="数量" type="number" value={newGpu.count} onChange={e => setNewGpu(p => ({ ...p, count: e.target.value }))} className="h-7 text-xs bg-zinc-800 border-zinc-700" />
                  </div>
                  <Button size="sm" onClick={addGpu} className="w-full h-7 text-xs bg-violet-600 hover:bg-violet-700 border-0">
                    <Plus className="w-3 h-3" /> 添加
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right: Results */}
          <div className="lg:col-span-2 space-y-4">

            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "我的总算力", value: `${totalMyHashrateTH.toFixed(0)} TH/s`, sub: `全网占比 ${(myShare * 100).toFixed(4)}%`, color: "text-violet-400" },
                { label: "日挖出 PRL", value: `${myDailyPRL.toFixed(1)}`, sub: `≈ $${myDailyRevenue.toFixed(2)}`, color: "text-yellow-400" },
                { label: "日成本", value: `$${totalCostPerDay.toFixed(2)}`, sub: `$${totalCostPerHour.toFixed(2)}/小时`, color: "text-red-400" },
                {
                  label: "日净利润",
                  value: `${isProfit ? "+" : ""}$${myDailyProfit.toFixed(2)}`,
                  sub: `月 ${isProfit ? "+" : ""}$${(myDailyProfit * 30).toFixed(0)}`,
                  color: isProfit ? "text-emerald-400" : "text-red-400"
                },
              ].map(m => (
                <Card key={m.label} className="bg-zinc-900 border-zinc-800">
                  <CardContent className="pt-4 pb-4">
                    <div className="text-xs text-zinc-500 mb-1">{m.label}</div>
                    <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
                    <div className="text-xs text-zinc-500 mt-1">{m.sub}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Breakeven + Efficiency */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 盈亏平衡 PRL 价格 */}
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-xs text-zinc-500">盈亏平衡 PRL 价格</div>
                      <div className={`text-3xl font-bold mt-1 ${prlPrice >= breakevenPrice ? "text-emerald-400" : "text-red-400"}`}>
                        ${breakevenPrice.toFixed(4)}
                      </div>
                      <div className="text-xs text-zinc-600 mt-1">
                        = 日成本 ${totalCostPerDay.toFixed(2)} ÷ 日产出 {myDailyPRL.toFixed(1)} PRL
                      </div>
                    </div>
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${prlPrice >= breakevenPrice ? "bg-emerald-500/20" : "bg-red-500/20"}`}>
                      {prlPrice >= breakevenPrice
                        ? <TrendingUp className="w-6 h-6 text-emerald-400" />
                        : <TrendingDown className="w-6 h-6 text-red-400" />
                      }
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-500">当前价格</span>
                      <span className="text-zinc-300">${prlPrice}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-500">溢价/折价</span>
                      <span className={prlPrice >= breakevenPrice ? "text-emerald-400" : "text-red-400"}>
                        {breakevenPrice > 0 ? ((prlPrice / breakevenPrice - 1) * 100).toFixed(1) : "N/A"}%
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-500">日净利润</span>
                      <span className={isProfit ? "text-emerald-400" : "text-red-400"}>
                        {isProfit ? "+" : ""}${myDailyProfit.toFixed(2)} / 月{isProfit ? "+" : ""}${(myDailyProfit * 30).toFixed(0)}
                      </span>
                    </div>
                    <div className="w-full bg-zinc-700 rounded-full h-1.5 mt-2">
                      <div
                        className={`h-1.5 rounded-full transition-all ${prlPrice >= breakevenPrice ? "bg-emerald-500" : "bg-red-500"}`}
                        style={{ width: `${Math.min(100, (prlPrice / Math.max(breakevenPrice * 1.5, 0.01)) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-zinc-600 mt-0.5">
                      <span>$0</span>
                      <span className="text-zinc-500">盈亏线 ${breakevenPrice.toFixed(3)}</span>
                      <span>${(Math.max(breakevenPrice * 1.5, 0.01)).toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 单台 GPU 效率对比（帮助选卡） */}
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs text-zinc-500">单台 GPU 效率对比</div>
                    <div className="text-[10px] text-zinc-600">基于全网实时算力 · @${prlPrice}/PRL</div>
                  </div>
                  {gpus.length === 0 ? (
                    <p className="text-xs text-zinc-600 text-center py-4">暂无配置</p>
                  ) : (
                    <div className="space-y-1">
                      <div className="grid grid-cols-4 text-[10px] text-zinc-600 pb-1.5 border-b border-zinc-800">
                        <span>型号</span>
                        <span className="text-right">效率</span>
                        <span className="text-right">日收益</span>
                        <span className="text-right">日利润</span>
                      </div>
                      {gpus.map(gpu => {
                        // 单台 GPU 对网络的贡献（独立计算，不叠加其他卡）
                        const unitShare = gpu.hashrateTH / (networkTH + gpu.hashrateTH)
                        const unitDailyPRL = dailyNetworkPRL * unitShare
                        const unitRevenue = unitDailyPRL * prlPrice
                        const unitCost = gpu.costPerHour * 24
                        const unitProfit = unitRevenue - unitCost
                        // 效率 = TH/s ÷ ($/天)，越高越划算
                        const efficiency = unitCost > 0 ? gpu.hashrateTH / unitCost : 0
                        return (
                          <div key={gpu.id} className="grid grid-cols-4 text-xs items-center py-1 border-b border-zinc-800/50 last:border-0">
                            <span className="text-zinc-300 text-[11px] truncate pr-1">{gpu.name}</span>
                            <span className="text-right text-zinc-400 tabular-nums">{efficiency.toFixed(1)}<span className="text-zinc-600 text-[9px]"> TH/$d</span></span>
                            <span className="text-right text-yellow-400 tabular-nums">${unitRevenue.toFixed(2)}</span>
                            <span className={`text-right font-medium tabular-nums ${unitProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {unitProfit >= 0 ? "+" : ""}${unitProfit.toFixed(2)}
                            </span>
                          </div>
                        )
                      })}
                      <div className="text-[10px] text-zinc-600 pt-1.5">
                        效率 = TH/s ÷ ($/天)，越高性价比越好
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Revenue vs Cost Chart */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-zinc-300">日收益 vs PRL 价格</CardTitle>
                <CardDescription className="text-xs text-zinc-500">
                  绿色区域 = 日收益 · 红虚线 = 日成本 ${totalCostPerDay.toFixed(2)} · 紫线 = 盈亏平衡 ${breakevenPrice.toFixed(4)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="price" type="number" domain={[0, 5]} stroke="#52525b" tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} tickCount={11} />
                    <YAxis stroke="#52525b" tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "12px" }}
                      labelFormatter={v => `PRL 价格: $${Number(v).toFixed(2)}`}
                      formatter={(val, name) => [`$${Number(val).toFixed(2)}`, name === "revenue" ? "日收益" : "日成本"]}
                    />
                    {/* 日成本水平线 */}
                    <ReferenceLine y={totalCostPerDay} stroke="#ef4444" strokeDasharray="5 3" strokeWidth={1.5}
                      label={{ value: `成本 $${totalCostPerDay.toFixed(2)}`, position: "insideTopRight", fontSize: 10, fill: "#ef4444" }} />
                    {/* 盈亏平衡价格竖线 */}
                    {breakevenPrice > 0 && breakevenPrice <= 5 && (
                      <ReferenceLine x={breakevenPrice} stroke="#8b5cf6" strokeDasharray="4 4" strokeWidth={1.5}
                        label={{ value: `盈亏 $${breakevenPrice.toFixed(3)}`, position: "insideTopLeft", fontSize: 10, fill: "#8b5cf6" }} />
                    )}
                    {/* 当前 PRL 价格竖线 */}
                    <ReferenceLine x={prlPrice} stroke="#6b7280" strokeDasharray="2 2"
                      label={{ value: `当前 $${prlPrice}`, position: "insideBottomRight", fontSize: 10, fill: "#a1a1aa" }} />
                    <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="url(#revenueGradient)" strokeWidth={2} dot={false} name="revenue" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col items-center gap-2 pb-4">
          <a
            href="https://x.com/0x_JBCat"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-full border border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-sky-500 hover:text-sky-400 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            关注 @0x_JBCat · 获取最新挖矿数据与 Pearl 动态
          </a>
          <div className="text-center text-xs text-zinc-600">
            数据来源: pearlhash.xyz · OTC价格仅供参考 · 不构成投资建议
          </div>
        </div>
      </div>
    </div>
  )
}
