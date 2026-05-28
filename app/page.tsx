"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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
  totalHashrateTH: number   // 全网算力 TH/s（来自 chain-info.networkhashps）
  poolHashrateTH: number    // 矿池算力 TH/s
  blockRewardPRL: number
  blockTimeSeconds: number
  blockHeight: number
  totalWorkers: number | null
  loading: boolean
  lastUpdated: string
}

const DEFAULT_GPUS: GPU[] = [
  { id: "1", name: "H100 SXM 80GB", hashrateTH: 246, costPerHour: 3.29, count: 1 },
]

// GPU 预设：仅 H100 为实测值，其余为社区参考值，需自测验证
const GPU_PRESETS = [
  { name: "H100 SXM 80GB", hashrateTH: 246, costPerHour: 3.29, verified: true },
  { name: "RTX 4090", hashrateTH: 200, costPerHour: 0.69, verified: false },
  { name: "RTX 5090", hashrateTH: 230, costPerHour: 0.99, verified: false },
  { name: "RTX 3090", hashrateTH: 130, costPerHour: 0.46, verified: false },
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
  const [network, setNetwork] = useState<NetworkStats>({
    totalHashrateTH: 20_788_858, // ~20.79 EH/s 全网算力（chain-info.networkhashps）
    poolHashrateTH: 4_999_568,   // ~5 PH/s 矿池算力
    blockRewardPRL: 2686,
    blockTimeSeconds: 102.62,    // 实测均值（非目标值194s）
    blockHeight: 62775,
    totalWorkers: null,
    loading: false,
    lastUpdated: "",
  })
  const [newGpu, setNewGpu] = useState({ name: "", hashrateTH: "", costPerHour: "", count: "1" })

  // ---- Fetch network stats from pearlhash.xyz ----
  const fetchNetworkStats = useCallback(async () => {
    setNetwork(prev => ({ ...prev, loading: true }))
    try {
      const res = await fetch("/api/network-stats")
      if (res.ok) {
        const data = await res.json()
        setNetwork({
          totalHashrateTH: data.totalHashrateTH,
          poolHashrateTH: data.poolHashrateTH ?? 0,
          blockRewardPRL: data.blockRewardPRL,
          blockTimeSeconds: data.blockTimeSeconds,
          blockHeight: data.blockHeight ?? 0,
          totalWorkers: data.totalWorkers ?? null,
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

  // breakeven hashrate: find TH/s such that revenue = cost at current price
  // myShare = X / (networkTH + X), dailyPRL = dailyNetworkPRL * X/(networkTH+X) * prlPrice = costPerDay
  // Solve: X = networkTH * costPerDay / (dailyNetworkPRL * prlPrice - costPerDay)
  // But costPerDay changes with count - assume single unit cost for reference
  const singleUnitCostPerDay = totalCostPerDay // user's current total config
  const breakevenHashrate = prlPrice > 0
    ? (networkTH * singleUnitCostPerDay) / (dailyNetworkPRL * prlPrice - singleUnitCostPerDay)
    : Infinity

  // Chart: profit vs PRL price ($0 to $3)
  const chartData = Array.from({ length: 61 }, (_, i) => {
    const price = i * 0.05
    const rev = myDailyPRL * price
    const profit = rev - totalCostPerDay
    return { price: price.toFixed(2), profit: parseFloat(profit.toFixed(2)), revenue: parseFloat(rev.toFixed(2)), cost: parseFloat(totalCostPerDay.toFixed(2)) }
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
            <Button variant="outline" size="sm" onClick={fetchNetworkStats} disabled={network.loading} className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
              <RefreshCw className={`w-3.5 h-3.5 ${network.loading ? "animate-spin" : ""}`} />
              刷新网络
            </Button>
          </div>
        </div>

        {/* Network Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "全网算力",
              value: `${(network.totalHashrateTH / 1e6).toFixed(2)} EH/s`,
              icon: <Zap className="w-4 h-4 text-violet-400" />,
              sub: `矿池 ${(network.poolHashrateTH / 1e6).toFixed(2)} EH/s · ${network.totalHashrateTH > 0 ? ((network.poolHashrateTH / network.totalHashrateTH) * 100).toFixed(1) : "—"}% 占比`,
            },
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
            {
              label: "PRL 当前价格",
              value: `$${prlPrice}`,
              icon: <DollarSign className="w-4 h-4 text-blue-400" />,
              sub: "OTC 参考价（手动输入）",
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
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: Config */}
          <div className="lg:col-span-1 space-y-4">

            {/* PRL Price Config */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-zinc-300">参数配置</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs text-zinc-400">PRL 价格 (USD)</Label>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={prlPrice}
                      onChange={e => setPrlPrice(parseFloat(e.target.value) || 0)}
                      className="bg-zinc-800 border-zinc-700 text-zinc-100"
                    />
                    <div className="flex gap-1">
                      {[0.5, 0.95, 1.5, 2].map(p => (
                        <button key={p} onClick={() => setPrlPrice(p)} className={`text-xs px-2 py-1 rounded border transition-colors ${prlPrice === p ? "bg-violet-600 border-violet-500 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>${p}</button>
                      ))}
                    </div>
                  </div>
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
                  <p className="text-xs text-zinc-500 mb-2">快速添加（H100 为实测值，其余为社区参考，请自测验证）</p>
                  <div className="flex flex-wrap gap-1.5">
                    {GPU_PRESETS.map(preset => (
                      <button
                        key={preset.name}
                        onClick={() => setGpus(prev => [...prev, { id: generateId(), name: preset.name, hashrateTH: preset.hashrateTH, costPerHour: preset.costPerHour, count: 1 }])}
                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-violet-500 hover:text-violet-300 transition-colors bg-zinc-800"
                      >
                        <Plus className="w-3 h-3" />
                        {preset.name}
                        {preset.verified
                          ? <span className="text-emerald-400 text-[10px]">✓实测</span>
                          : <span className="text-yellow-600 text-[10px]">参考</span>
                        }
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

            {/* Breakeven Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-xs text-zinc-500">盈亏平衡 PRL 价格</div>
                      <div className="text-2xl font-bold text-zinc-100 mt-1">${breakevenPrice.toFixed(4)}</div>
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

              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-xs text-zinc-500">盈亏平衡算力需求</div>
                      <div className="text-2xl font-bold text-zinc-100 mt-1">
                        {breakevenHashrate > 0 && isFinite(breakevenHashrate)
                          ? `${breakevenHashrate.toFixed(0)} TH/s`
                          : prlPrice === 0 ? "∞" : "已盈利"
                        }
                      </div>
                    </div>
                    <Badge variant={totalMyHashrateTH >= breakevenHashrate ? "success" : "warning"} className="text-xs">
                      {totalMyHashrateTH >= breakevenHashrate ? "已达标" : "未达标"}
                    </Badge>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">当前算力</span>
                      <span className="text-zinc-300">{totalMyHashrateTH.toFixed(0)} TH/s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">差距</span>
                      <span className={totalMyHashrateTH >= breakevenHashrate ? "text-emerald-400" : "text-yellow-400"}>
                        {isFinite(breakevenHashrate) && breakevenHashrate > 0
                          ? `${totalMyHashrateTH >= breakevenHashrate ? "+" : ""}${(totalMyHashrateTH - breakevenHashrate).toFixed(0)} TH/s`
                          : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">ROI (30天)</span>
                      <span className={isProfit ? "text-emerald-400" : "text-red-400"}>
                        {totalCostPerDay > 0 ? `${((myDailyProfit * 30 / (totalCostPerDay * 30)) * 100).toFixed(1)}%` : "—"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Profit Chart */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-zinc-300">利润 vs PRL 价格</CardTitle>
                <CardDescription className="text-xs text-zinc-500">
                  基于当前算力配置 · 盈亏平衡点 ${breakevenPrice.toFixed(4)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="lossGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="price" stroke="#52525b" tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} interval={11} />
                    <YAxis stroke="#52525b" tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "12px" }}
                      labelFormatter={v => `PRL 价格: $${v}`}
                      formatter={(val, name) => [`$${Number(val).toFixed(2)}`, name === "profit" ? "日净利润" : name === "revenue" ? "日收益" : "日成本"]}
                    />
                    <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 4" label={{ value: "盈亏平衡", position: "insideTopRight", fontSize: 10, fill: "#6b7280" }} />
                    <ReferenceLine x={prlPrice.toFixed(2)} stroke="#8b5cf6" strokeDasharray="4 4" label={{ value: `当前 $${prlPrice}`, position: "insideTopLeft", fontSize: 10, fill: "#8b5cf6" }} />
                    <Area type="monotone" dataKey="profit" stroke={isProfit ? "#10b981" : "#ef4444"} fill={isProfit ? "url(#profitGradient)" : "url(#lossGradient)"} strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-zinc-600 pb-4">
          数据来源: pearlhash.xyz · OTC价格仅供参考 · 不构成投资建议
        </div>
      </div>
    </div>
  )
}
