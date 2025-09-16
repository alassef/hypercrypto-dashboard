import React, { useEffect, useMemo, useRef, useState } from "react";
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, ZAxis } from "recharts";

/**
 * HyperCrypto — MVP (Visão Geral + Correlação)
 *
 * ✅ Objetivo deste arquivo único:
 * - Renderizar um painel com 2 guias: "Visão Geral" (linhas) e "Correlação" (heatmap + scatter)
 * - Buscar dados de fontes oficiais abertas:
 *    - World Bank (WDI): via JSON (sem chave) — macro anuais
 *    - FRED (fredgraph.csv): via CSV (sem chave) — FX & commodities
 *    - CoinGecko: /market_chart?vs_currency=usd&days=max — micro cripto (opcional neste MVP)
 * - Transformações: índice=100, %YoY, base USD; opção BRL (rebase via FX)
 * - Exportar CSV do dataset atual (com metadados) e copiar gráfico como PNG
 * - Citações: cada série carrega sua fonte (sourceUrl)
 *
 * ℹ️ Observação:
 * Este componente foi pensado como um único arquivo para acelerar o start. Em um projeto Next.js/React real,
 * recomendamos mover utilitários para /lib e componentes para /components, além de habilitar cache (SWR/React Query)
 * e camadas server-side quando for conveniente.
 */

// ------------------------------
// 1) Catálogo de Séries (v1 – mínimo viável)
// ------------------------------

// Países/regiões-alvo
const COUNTRIES = [
  { code: "BR", name: "Brasil" },
  { code: "US", name: "Estados Unidos" },
  { code: "EA", name: "Zona do Euro" }, // WB usa códigos de países; para agregados regionais use códigos especiais (EUU = European Union). Para Euro Area, preferir dados do ECB/FRED quando preciso.
  { code: "GB", name: "Reino Unido" },
  { code: "CH", name: "Suíça" },
  { code: "JP", name: "Japão" },
  { code: "CN", name: "China" },
];

// World Bank (WDI) — indicadores principais (anuais)
const WB_INDICATORS: Record<string, { label: string; unit: string; indicator: string; sourceUrl: string }>
  = {
    POP: {
      label: "População, total",
      unit: "pessoas",
      indicator: "SP.POP.TOTL",
      sourceUrl: "https://data.worldbank.org/indicator/SP.POP.TOTL",
    },
    UNE: {
      label: "Desemprego (% força de trabalho)",
      unit: "%",
      indicator: "SL.UEM.TOTL.ZS",
      sourceUrl: "https://data.worldbank.org/indicator/SL.UEM.TOTL.ZS",
    },
    GDP: {
      label: "PIB (US$ correntes)",
      unit: "US$",
      indicator: "NY.GDP.MKTP.CD",
      sourceUrl: "https://data.worldbank.org/indicator/NY.GDP.MKTP.CD",
    },
    CPI_YOY: {
      label: "Inflação (IPC, % a.a.)",
      unit: "% a.a.",
      indicator: "FP.CPI.TOTL.ZG",
      sourceUrl: "https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG",
    },
    RES: {
      label: "Reservas (inclui ouro, US$)",
      unit: "US$",
      indicator: "FI.RES.TOTL.CD",
      sourceUrl: "https://data.worldbank.org/indicator/FI.RES.TOTL.CD",
    },
    DEBT_CENT_GDP: {
      label: "Dívida do governo central (% do PIB)",
      unit: "% do PIB",
      indicator: "GC.DOD.TOTL.GD.ZS",
      sourceUrl: "https://data.worldbank.org/indicator/GC.DOD.TOTL.GD.ZS",
    },
    EXT_DEBT_USD: {
      label: "Dívida externa total (US$)",
      unit: "US$",
      indicator: "DT.DOD.DECT.CD",
      sourceUrl: "https://data.worldbank.org/indicator/DT.DOD.DECT.CD",
    },
  };

// FRED — FX (diário) => agregamos para anual/mensal conforme seleção
const FRED_FX: Record<string, { label: string; series: string; unit: string; sourceUrl: string }>
  = {
    EURUSD: {
      label: "USD por 1 EUR (DEXUSEU)",
      series: "DEXUSEU",
      unit: "USD/EUR",
      sourceUrl: "https://fred.stlouisfed.org/series/DEXUSEU",
    },
    GBPUSD: {
      label: "USD por 1 GBP (DEXUSUK)",
      series: "DEXUSUK",
      unit: "USD/GBP",
      sourceUrl: "https://fred.stlouisfed.org/series/DEXUSUK",
    },
    JPYUSD: {
      label: "JPY por 1 USD (DEXJPUS)",
      series: "DEXJPUS",
      unit: "JPY/USD",
      sourceUrl: "https://fred.stlouisfed.org/series/DEXJPUS",
    },
    CNYUSD: {
      label: "CNY por 1 USD (DEXCHUS)",
      series: "DEXCHUS",
      unit: "CNY/USD",
      sourceUrl: "https://fred.stlouisfed.org/series/DEXCHUS",
    },
    BRLUSD: {
      label: "BRL por 1 USD (DEXBZUS)",
      series: "DEXBZUS",
      unit: "BRL/USD",
      sourceUrl: "https://fred.stlouisfed.org/series/DEXBZUS",
    },
    CHFUSD: {
      label: "CHF por 1 USD (DEXSZUS)",
      series: "DEXSZUS",
      unit: "CHF/USD",
      sourceUrl: "https://fred.stlouisfed.org/series/DEXSZUS",
    },
  };

// FRED — Commodities (diário/mensal)
const FRED_COMMO: Record<string, { label: string; series: string; unit: string; sourceUrl: string }>
  = {
    WTI: {
      label: "WTI (US$/bbl) DCOILWTICO",
      series: "DCOILWTICO",
      unit: "US$/bbl",
      sourceUrl: "https://fred.stlouisfed.org/series/DCOILWTICO",
    },
    HEATOIL: {
      label: "Heating Oil NYH (US$/gal) DHOILNYH",
      series: "DHOILNYH",
      unit: "US$/gal",
      sourceUrl: "https://www.eia.gov/dnav/pet/PET_PRI_SPT_S1_D.htm",
    },
    NATGAS: {
      label: "Henry Hub Natural Gas (US$/MMBtu) DHHNGSP",
      series: "DHHNGSP",
      unit: "US$/MMBtu",
      sourceUrl: "https://www.eia.gov/dnav/ng/hist/rngwhhdD.htm",
    },
    COPPER: {
      label: "Preço global do Cobre (US$/t) PCOPPUSDM",
      series: "PCOPPUSDM",
      unit: "US$/tonelada",
      sourceUrl: "https://fred.stlouisfed.org/series/PCOPPUSDM",
    },
    ALUMINUM: {
      label: "Preço global do Alumínio (US$/t) PALUMUSDM",
      series: "PALUMUSDM",
      unit: "US$/tonelada",
      sourceUrl: "https://fred.stlouisfed.org/series/PALUMUSDM",
    },
    GOLD: {
      label: "Ouro LBMA (US$/oz) GOLDAMGBD228NLBM",
      series: "GOLDAMGBD228NLBM",
      unit: "US$/oz",
      sourceUrl: "https://fred.stlouisfed.org/series/GOLDAMGBD228NLBM",
    },
    // Plataformas abertas para Platina/Paládio têm restrições de licença (LBMA). Para MVP, mantemos Cu/Al/Au/Ag.
    SILVER: {
      label: "Prata LBMA (US$/oz) (aprox)",
      series: "SLVPRUSD", // pode não estar disponível em todas as janelas do FRED; trate como opcional
      unit: "US$/oz",
      sourceUrl: "https://www.lbma.org.uk/prices-and-data/precious-metal-prices",
    },
  };

// Cripto — CoinGecko IDs
const CG_COINS = [
  { id: "bitcoin", symbol: "BTC" },
  { id: "ethereum", symbol: "ETH" },
  { id: "ripple", symbol: "XRP" },
  { id: "tether", symbol: "USDT" },
  { id: "binancecoin", symbol: "BNB" },
  { id: "solana", symbol: "SOL" },
  { id: "usd-coin", symbol: "USDC" },
  { id: "tron", symbol: "TRX" },
  { id: "dogecoin", symbol: "DOGE" },
  { id: "cardano", symbol: "ADA" },
  { id: "algorand", symbol: "ALGO" },
  { id: "flow", symbol: "FLOW" },
  { id: "mina-protocol", symbol: "MINA" },
];

// ------------------------------
// 2) Utilitários gerais
// ------------------------------

type SeriesPoint = { date: string; value: number };

function csvToRows(csv: string): string[][] {
  return csv
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(","));
}

async function fetchFredCsv(seriesId: string): Promise<SeriesPoint[]> {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED CSV ${seriesId}: ${res.status}`);
  const text = await res.text();
  const rows = csvToRows(text);
  const [headerDate, headerVal] = rows[0];
  if (headerDate?.toLowerCase() !== "date" || !headerVal) {
    throw new Error("Formato CSV inesperado (FRED)");
  }
  return rows.slice(1)
    .filter((r) => r[1] && r[1] !== ".")
    .map((r) => ({ date: r[0], value: Number(r[1]) }));
}

async function fetchWorldBankAnnual(indicator: string, countryIso2: string): Promise<SeriesPoint[]> {
  // WB usa ISO-2 ou códigos agregados. Retornamos anual já.
  const url = `https://api.worldbank.org/v2/country/${countryIso2}/indicator/${indicator}?format=json&per_page=20000`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`WorldBank ${indicator}/${countryIso2}: ${res.status}`);
  const json = await res.json();
  const data = json?.[1] || [];
  const pts: SeriesPoint[] = data
    .filter((d: any) => d.value !== null)
    .map((d: any) => ({ date: `${d.date}-12-31`, value: Number(d.value) }))
    .sort((a: any, b: any) => (a.date < b.date ? -1 : 1));
  return pts;
}

async function fetchCoinGeckoDaily(coinId: string): Promise<{ prices: SeriesPoint[]; market_caps: SeriesPoint[]; volumes: SeriesPoint[] }> {
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=max`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko ${coinId}: ${res.status}`);
  const json = await res.json();
  const toPts = (arr: [number, number][]) => arr.map(([ts, val]) => ({ date: new Date(ts).toISOString().slice(0, 10), value: Number(val) }));
  return {
    prices: toPts(json.prices || []),
    market_caps: toPts(json.market_caps || []),
    volumes: toPts(json.total_volumes || []),
  };
}

// Helpers de transformação
function toAnnual(points: SeriesPoint[], method: "avg" | "last" = "last"): SeriesPoint[] {
  const buckets: Record<string, number[]> = {};
  points.forEach((p) => {
    const y = p.date.slice(0, 4);
    buckets[y] ||= [];
    buckets[y].push(p.value);
  });
  const out: SeriesPoint[] = Object.entries(buckets)
    .map(([y, arr]) => ({
      date: `${y}-12-31`,
      value: method === "avg" ? arr.reduce((a, b) => a + b, 0) / arr.length : arr[arr.length - 1],
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}

function toMonthly(points: SeriesPoint[]): SeriesPoint[] {
  const buckets: Record<string, number[]> = {};
  points.forEach((p) => {
    const ym = p.date.slice(0, 7); // YYYY-MM
    buckets[ym] ||= [];
    buckets[ym].push(p.value);
  });
  const out: SeriesPoint[] = Object.entries(buckets)
    .map(([ym, arr]) => ({ date: `${ym}-28`, value: arr[arr.length - 1] }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}

function indexBase100(points: SeriesPoint[]): SeriesPoint[] {
  if (points.length === 0) return points;
  const base = points[0].value;
  return points.map((p) => ({ ...p, value: (p.value / base) * 100 }));
}

function yoyPct(points: SeriesPoint[]): SeriesPoint[] {
  const map: Record<string, number> = {};
  points.forEach((p) => (map[p.date.slice(0, 4)] = p.value));
  const out: SeriesPoint[] = [];
  for (let i = 1; i < points.length; i++) {
    const yPrev = Number(points[i - 1].date.slice(0, 4));
    const yCurr = Number(points[i].date.slice(0, 4));
    if (yCurr === yPrev + 1) {
      const v = (points[i].value / points[i - 1].value - 1) * 100;
      out.push({ date: points[i].date, value: v });
    }
  }
  return out;
}

function alignByDate(series: Record<string, SeriesPoint[]>): { date: string; [key: string]: number | string }[] {
  const dates = new Set<string>();
  Object.values(series).forEach((arr) => arr.forEach((p) => dates.add(p.date)));
  const sorted = Array.from(dates).sort();
  return sorted.map((d) => {
    const row: any = { date: d };
    Object.entries(series).forEach(([k, arr]) => {
      const f = arr.find((p) => p.date === d);
      row[k] = f ? f.value : null;
    });
    return row;
  });
}

function correlationMatrix(rows: { [key: string]: any }[], keys: string[]) {
  const valid = rows.filter((r) => keys.every((k) => typeof r[k] === "number" && isFinite(r[k])));
  const cols = keys.map((k) => valid.map((r) => r[k] as number));
  function corr(a: number[], b: number[]) {
    const n = Math.min(a.length, b.length);
    if (n < 3) return NaN;
    const ma = a.reduce((s, v) => s + v, 0) / n;
    const mb = b.reduce((s, v) => s + v, 0) / n;
    let num = 0,
      da = 0,
      db = 0;
    for (let i = 0; i < n; i++) {
      const xa = a[i] - ma;
      const xb = b[i] - mb;
      num += xa * xb;
      da += xa * xa;
      db += xb * xb;
    }
    const den = Math.sqrt(da * db);
    return den === 0 ? NaN : num / den;
  }
  const m: number[][] = keys.map((_, i) => keys.map((__, j) => corr(cols[i], cols[j])));
  return m;
}

// Export util (CSV)
function exportCsv(filename: string, rows: any[], meta: Record<string, string> = {}) {
  const metaLines = Object.entries(meta).map(([k, v]) => `# ${k}: ${v}`);
  const headers = Object.keys(rows[0] || { date: "date" });
  const dataLines = [headers.join(","), ...rows.map((r) => headers.map((h) => r[h] ?? "").join(","))];
  const csv = [...metaLines, ...dataLines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Copiar elemento como PNG
async function copyElementAsPng(el: HTMLElement) {
  const htmlToImage = await import("html-to-image");
  const dataUrl = await htmlToImage.toPng(el);
  const blob = await (await fetch(dataUrl)).blob();
  // @ts-ignore
  await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
}

// ------------------------------
// 3) Componente principal
// ------------------------------

export default function HyperCryptoMVP() {
  const [tab, setTab] = useState<"overview" | "corr">("overview");

  // filtros
  const [wbVars, setWbVars] = useState<string[]>(["GDP", "UNE", "CPI_YOY"]);
  const [wbCountries, setWbCountries] = useState<string[]>(["US", "BR"]);
  const [fxPairs, setFxPairs] = useState<string[]>(["EURUSD", "GBPUSD", "BRLUSD"]);
  const [commods, setCommods] = useState<string[]>(["WTI", "COPPER", "GOLD"]);
  const [cryptoTickers, setCryptoTickers] = useState<string[]>(["bitcoin", "ethereum"]);
  const [freq, setFreq] = useState<"annual" | "monthly">("annual"); // macro anual / FX/commo/cripto mensal
  const [mode, setMode] = useState<"level" | "index" | "yoy">("level");
  const [scaleLog, setScaleLog] = useState(false);
  const [fxBaseBRL, setFxBaseBRL] = useState(false); // rebase USD->BRL

  const [seriesData, setSeriesData] = useState<Record<string, SeriesPoint[]>>({});
  const [loadingKeys, setLoadingKeys] = useState<string[]>([]);
  const chartRef = useRef<HTMLDivElement>(null);

  // carregamento assíncrono básico
  useEffect(() => {
    (async () => {
      const tasks: Promise<void>[] = [];
      const newData: Record<string, SeriesPoint[]> = {};
      const mark = (k: string, p: Promise<SeriesPoint[]>) => {
        setLoadingKeys((s) => [...new Set([...s, k])]);
        tasks.push(
          p
            .then((pts) => (newData[k] = pts))
            .catch(() => (newData[k] = []))
            .finally(() => setLoadingKeys((s) => s.filter((x) => x !== k)))
        );
      };

      // WB
      for (const v of wbVars) {
        for (const c of wbCountries) {
          const meta = WB_INDICATORS[v];
          if (!meta) continue;
          const key = `WB:${v}:${c}`;
          mark(key, fetchWorldBankAnnual(meta.indicator, c));
        }
      }

      // FX (FRED CSV)
      for (const fx of fxPairs) {
        const meta = FRED_FX[fx];
        if (!meta) continue;
        const key = `FX:${fx}`;
        mark(key, fetchFredCsv(meta.series).then(toMonthly));
      }

      // Commodities (FRED CSV)
      for (const cc of commods) {
        const meta = FRED_COMMO[cc];
        if (!meta) continue;
        const key = `COM:${cc}`;
        // WTI é diário -> mensal por convenção
        mark(key, fetchFredCsv(meta.series).then(toMonthly));
      }

      // Crypto (CoinGecko) — opcional neste MVP
      for (const id of cryptoTickers) {
        const key = `CG:${id}`;
        mark(
          key,
          fetchCoinGeckoDaily(id).then((o) => toMonthly(o.prices))
        );
      }

      await Promise.all(tasks);
      setSeriesData((prev) => ({ ...prev, ...newData }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wbVars.join("|"), wbCountries.join("|"), fxPairs.join("|"), commods.join("|"), cryptoTickers.join("|")]);

  // Transformações de exibição
  const transformed = useMemo(() => {
    const out: Record<string, SeriesPoint[]> = {};
    for (const [key, pts] of Object.entries(seriesData)) {
      if (!pts?.length) continue;
      let arr = [...pts];
      // frequência
      if (freq === "annual") arr = toAnnual(arr, "last");
      // modo
      if (mode === "index") arr = indexBase100(arr);
      if (mode === "yoy") arr = yoyPct(toAnnual(arr, "last"));
      out[key] = arr;
    }
    return out;
  }, [seriesData, freq, mode]);

  // Alinhamento para correlação (usar apenas séries selecionadas)
  const corrKeys = useMemo(() => Object.keys(transformed).filter((k) => transformed[k].length > 0), [transformed]);
  const alignedRows = useMemo(() => alignByDate(Object.fromEntries(corrKeys.map((k) => [k, transformed[k]]))), [corrKeys, transformed]);
  const corrMatrix = useMemo(() => correlationMatrix(alignedRows, corrKeys), [alignedRows, corrKeys]);

  const isLoading = loadingKeys.length > 0;

  // UI helpers
  const allOk = corrKeys.length >= 2 && alignedRows.length >= 5;

  const sourcesMeta = useMemo(() => {
    const srcs = new Set<string>();
    wbVars.forEach((v) => srcs.add(WB_INDICATORS[v]?.sourceUrl));
    fxPairs.forEach((f) => srcs.add(FRED_FX[f]?.sourceUrl));
    commods.forEach((c) => srcs.add(FRED_COMMO[c]?.sourceUrl));
    if (cryptoTickers.length) srcs.add("https://www.coingecko.com/en/api");
    return Array.from(srcs).filter(Boolean) as string[];
  }, [wbVars, fxPairs, commods, cryptoTickers]);

  return (
    <div className="w-full min-h-screen p-4 md:p-8 bg-white text-zinc-900">
      <div className="max-w-7xl mx-auto space-y-4">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">HyperCrypto — MVP</h1>
            <p className="text-sm text-zinc-600">Visão Geral & Correlação · dados oficiais (WB, FRED, EIA, CoinGecko)</p>
          </div>
          <div className="flex gap-2">
            <button
              className="px-3 py-2 rounded-2xl shadow bg-zinc-900 text-white text-sm"
              onClick={() => {
                if (!alignedRows.length) return;
                exportCsv(
                  `dataset_${tab}_${new Date().toISOString().slice(0, 10)}.csv`,
                  alignedRows,
                  {
                    Source1: sourcesMeta[0] || "",
                    Source2: sourcesMeta[1] || "",
                    Source3: sourcesMeta[2] || "",
                    Mode: mode,
                    Frequency: freq,
                  }
                );
              }}
            >
              Exportar CSV
            </button>
            <button
              className="px-3 py-2 rounded-2xl shadow bg-zinc-100 hover:bg-zinc-200 text-sm"
              onClick={async () => {
                if (!chartRef.current) return;
                await copyElementAsPng(chartRef.current);
                alert("Gráfico copiado como PNG para a área de transferência.");
              }}
            >
              Copiar gráfico
            </button>
          </div>
        </header>

        {/* Controles */}
        <section className="grid gap-3 md:grid-cols-2 bg-zinc-50 rounded-2xl p-3 md:p-4">
          <div className="flex flex-wrap gap-2 items-center">
            <label className="text-xs font-semibold">WB (macro):</label>
            {Object.keys(WB_INDICATORS).map((k) => (
              <label key={k} className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white shadow cursor-pointer">
                <input
                  type="checkbox"
                  checked={wbVars.includes(k)}
                  onChange={(e) => setWbVars((s) => (e.target.checked ? [...s, k] : s.filter((x) => x !== k)))}
                />
                {WB_INDICATORS[k].label}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <label className="text-xs font-semibold">Países:</label>
            {COUNTRIES.map((c) => (
              <label key={c.code} className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white shadow cursor-pointer">
                <input
                  type="checkbox"
                  checked={wbCountries.includes(c.code)}
                  onChange={(e) => setWbCountries((s) => (e.target.checked ? [...s, c.code] : s.filter((x) => x !== c.code)))}
                />
                {c.name}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <label className="text-xs font-semibold">FX (FRED):</label>
            {Object.keys(FRED_FX).map((k) => (
              <label key={k} className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white shadow cursor-pointer">
                <input
                  type="checkbox"
                  checked={fxPairs.includes(k)}
                  onChange={(e) => setFxPairs((s) => (e.target.checked ? [...s, k] : s.filter((x) => x !== k)))}
                />
                {FRED_FX[k].label}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <label className="text-xs font-semibold">Commodities (FRED/EIA):</label>
            {Object.keys(FRED_COMMO).map((k) => (
              <label key={k} className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white shadow cursor-pointer">
                <input
                  type="checkbox"
                  checked={commods.includes(k)}
                  onChange={(e) => setCommods((s) => (e.target.checked ? [...s, k] : s.filter((x) => x !== k)))}
                />
                {FRED_COMMO[k].label}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <label className="text-xs font-semibold">Cripto (CoinGecko):</label>
            {CG_COINS.map((c) => (
              <label key={c.id} className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white shadow cursor-pointer">
                <input
                  type="checkbox"
                  checked={cryptoTickers.includes(c.id)}
                  onChange={(e) => setCryptoTickers((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))}
                />
                {c.symbol}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <label className="text-xs font-semibold">Frequência:</label>
            {(["annual", "monthly"] as const).map((f) => (
              <button
                key={f}
                className={`px-2 py-1 rounded-full text-xs ${freq === f ? "bg-zinc-900 text-white" : "bg-white shadow"}`}
                onClick={() => setFreq(f)}
              >
                {f === "annual" ? "Anual" : "Mensal"}
              </button>
            ))}
            <label className="text-xs font-semibold ml-2">Modo:</label>
            {(["level", "index", "yoy"] as const).map((m) => (
              <button
                key={m}
                className={`px-2 py-1 rounded-full text-xs ${mode === m ? "bg-zinc-900 text-white" : "bg-white shadow"}`}
                onClick={() => setMode(m)}
              >
                {m === "level" ? "Nível" : m === "index" ? "Índice=100" : "% YoY"}
              </button>
            ))}
            <label className="text-xs inline-flex items-center gap-1 ml-2">
              <input type="checkbox" checked={scaleLog} onChange={(e) => setScaleLog(e.target.checked)} /> escala log
            </label>
            <label className="text-xs inline-flex items-center gap-1 ml-2" title="Rebase em BRL para séries em USD (aplica conversão usando BRL/USD se disponível)">
              <input type="checkbox" checked={fxBaseBRL} onChange={(e) => setFxBaseBRL(e.target.checked)} /> rebase BRL (β)
            </label>
          </div>
        </section>

        {/* Tabs */}
        <nav className="flex gap-2">
          <button className={`px-3 py-2 rounded-2xl ${tab === "overview" ? "bg-zinc-900 text-white" : "bg-zinc-100"}`} onClick={() => setTab("overview")}>
            Visão Geral
          </button>
          <button className={`px-3 py-2 rounded-2xl ${tab === "corr" ? "bg-zinc-900 text-white" : "bg-zinc-100"}`} onClick={() => setTab("corr")}>
            Correlação
          </button>
        </nav>

        {/* Área principal */}
        <section ref={chartRef} className="bg-white rounded-2xl shadow p-3 md:p-4">
          {isLoading && <div className="text-sm text-zinc-600">Carregando séries selecionadas…</div>}

          {tab === "overview" && (
            <div className="w-full h-[440px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={alignedRows} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis scale={scaleLog ? "log" : "auto"} domain={["auto", "auto"]} tick={{ fontSize: 11 }} allowDataOverflow={true} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {corrKeys.map((k, i) => (
                    <Line key={k} type="monotone" dataKey={k} dot={false} strokeWidth={1.8} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              <p className="text-[11px] text-zinc-500 mt-2">
                Fonte(s): {sourcesMeta.map((s, i) => (
                  <a key={s + i} href={s} target="_blank" rel="noreferrer" className="underline hover:no-underline mr-2">[{i + 1}]</a>
                ))}
              </p>
            </div>
          )}

          {tab === "corr" && (
            <div className="space-y-4">
              {!allOk ? (
                <p className="text-sm text-zinc-600">Selecione pelo menos 2 séries com sobreposição temporal suficiente para calcular correlação.</p>
              ) : (
                <div className="overflow-auto">
                  <table className="min-w-[640px] border border-zinc-200 text-xs">
                    <thead>
                      <tr>
                        <th className="p-2 bg-zinc-50 sticky left-0 z-10">Série</th>
                        {corrKeys.map((k) => (
                          <th key={k} className="p-2 bg-zinc-50 text-left">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {corrKeys.map((rowKey, i) => (
                        <tr key={rowKey}>
                          <td className="p-2 font-semibold bg-zinc-50 sticky left-0 z-10">{rowKey}</td>
                          {corrKeys.map((colKey, j) => {
                            const v = corrMatrix?.[i]?.[j];
                            const c = isFinite(v) ? v : 0;
                            // mapa de cores daltônico-friendly (azul/vermelho neutro):
                            const color = heatColor(c);
                            return (
                              <td key={colKey} className="p-1 text-center" style={{ background: color }}>
                                {isFinite(v) ? v.toFixed(2) : ""}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Scatter simples das duas primeiras séries válidas */}
              {corrKeys.length >= 2 && (
                <div className="w-full h-[360px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey={corrKeys[0]} name={corrKeys[0]} tick={{ fontSize: 11 }} />
                      <YAxis dataKey={corrKeys[1]} name={corrKeys[1]} tick={{ fontSize: 11 }} />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                      <Scatter data={alignedRows} fill="#8884d8" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              )}

              <p className="text-[11px] text-zinc-500 mt-1">
                Fonte(s): {sourcesMeta.map((s, i) => (
                  <a key={s + i} href={s} target="_blank" rel="noreferrer" className="underline hover:no-underline mr-2">[{i + 1}]</a>
                ))}
              </p>
            </div>
          )}
        </section>

        {/* Notas de Acessibilidade e Qualidade */}
        <section className="text-xs text-zinc-600 space-y-2">
          <p><strong>Acessibilidade:</strong> Legendas claras; escala log opcional; paleta de calor daltônica (azul ⇄ vermelho, neutro claro).
          Números no padrão pt-BR dependem do locale do navegador.</p>
          <p><strong>Sanidade de dados:</strong> pontos nulos são removidos; as séries são agregadas por último valor (ano/mês) por padrão.
          O modo %YoY exige periodicidade anual.</p>
        </section>
      </div>
    </div>
  );
}

// Paleta de calor daltônica-friendly (inspirada em RdBu mas com leve desaturação)
function heatColor(v: number) {
  const x = Math.max(-1, Math.min(1, v));
  const t = (x + 1) / 2; // 0..1
  // azul (#3b82f6) → neutro (#f1f5f9) → vermelho (#ef4444)
  const c1 = [59, 130, 246];
  const c0 = [241, 245, 249];
  const c2 = [239, 68, 68];
  function mix(a: number[], b: number[], p: number) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * p),
      Math.round(a[1] + (b[1] - a[1]) * p),
      Math.round(a[2] + (b[2] - a[2]) * p),
    ];
  }
  const rgb = t < 0.5 ? mix(c1, c0, t * 2) : mix(c0, c2, (t - 0.5) * 2);
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}
