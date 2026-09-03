/* Split out of RichR.jsx — see tools/split.cjs. Keep modules small; shared pure helpers live in lib/. */
import { useRef, useState } from "react";
import { supabase } from "../supabase";
import { Pencil, RefreshCw, Upload, X } from "lucide-react";
import { CURRENCIES, TYPES, sym, uid } from "../lib/format.js";
import { aiFetch } from "../lib/storage.js";

/* ================= SCREENSHOT IMPORT ================= */
/*  Works with any bank/broker app (OP, Nordnet, Nordea, Avanza, IBKR…):
    the AI reads the screenshot(s) — any layout, Finnish/Swedish/English —
    and extracts holdings. The user reviews and corrects everything before
    anything is added, because reading numbers off screenshots is never
    100% reliable. Screenshots are sent to the AI for parsing only and are
    not stored anywhere.                                                    */
export const OK_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export const isCsvFile = (f) =>
  ["text/csv", "text/plain", "text/tab-separated-values"].includes(f.type) || /\.(csv|txt|tsv)$/i.test(f.name);

/* ---------- CSV import (no AI needed) ----------
   Reads a broker export or our own template on-device. Delimiter and
   number format are detected; headers are matched in English, Swedish and
   Finnish. Returns { rows, unmapped } — rows ready for the review table,
   or an empty list with the header names when nothing could be mapped. */
export const CSV_TEMPLATE = "ticker,name,shares,buy_price,currency,buy_date\nAAPL,Apple,10,180.5,USD,2025-03-14\nNOVO-B.CO,Novo Nordisk,25,620,DKK,2024-11-02\nVOO,Vanguard S&P 500 ETF,8,480,USD,\n";

export const CSV_HEADERS = {
  ticker:   ["ticker", "symbol", "kod", "tunnus", "code", "isin", "instrument code"],
  name:     ["name", "namn", "nimi", "security", "instrument", "värdepapper", "vardepapper", "arvopaperi", "description", "asset", "holding", "product", "företag", "yhtiö", "osake", "aktie", "sijoitus", "kohde", "fond", "rahasto"],
  shares:   ["shares", "quantity", "qty", "antal", "määrä", "maara", "units", "amount", "position", "kpl", "lukumäärä", "no. of shares", "number of shares", "holdings"],
  buyPrice: ["buy price", "buy_price", "avg price", "average price", "avg cost", "average cost", "cost per share", "purchase price", "gav", "snittkurs", "inköpskurs", "hankintahinta", "keskihinta", "ostohinta", "avg. price", "entry price"],
  totalCost:["total cost", "cost basis", "anskaffningsvärde", "anskaffningsvarde", "hankinta-arvo", "hankintaarvo", "purchase value", "invested", "cost", "book value", "kostnad"],
  currentPrice: ["current price", "price", "last", "last price", "senast", "kurs", "hinta", "market price", "viimeisin", "close"],
  currency: ["currency", "valuta", "valuutta", "ccy", "cur"],
  buyDate:  ["buy date", "buy_date", "date", "purchase date", "köpdatum", "ostopäivä", "trade date", "datum", "päivä"],
  type:     ["type", "typ", "tyyppi", "asset type", "instrument type", "kind"],
};

export const parseCsvNumber = (v) => {
  if (v == null) return NaN;
  let t = String(v).replace(/[\s\u00a0']/g, "").replace(/[€$£kr]/gi, "").trim();
  if (!t) return NaN;
  // "1.234,56" → 1234.56 ; "1,234.56" → 1234.56 ; "12,5" → 12.5
  if (/,\d{1,2}$/.test(t) && !/\.\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/,/g, "");
  const n = Number(t);
  return isFinite(n) ? n : NaN;
};

export function parseCsvText(text) {
  const src = String(text || "").replace(/^\ufeff/, "");
  const firstLine = src.split(/\r?\n/).find((l) => l.trim()) || "";
  const delim = [";", "\t", ","].map((d) => [d, (firstLine.match(new RegExp(d === "\t" ? "\t" : `\\${d}`, "g")) || []).length]).sort((a, b) => b[1] - a[1])[0][0];
  const out = []; let row = [], cell = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) { if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && src[i + 1] === "\n") i++; row.push(cell); out.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((c) => String(c).trim() !== ""));
}

export function parseHoldingsCsv(text, cur) {
  const table = parseCsvText(text);
  if (table.length < 2) return { rows: [], unmapped: [] };
  // header row = the first row with ≥2 recognisable headers (some exports have a title line first)
  const norm = (h) => String(h || "").toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
  const matchHeader = (h) => {
    const n = norm(h);
    for (const [k, alts] of Object.entries(CSV_HEADERS)) if (alts.some((a) => n === a)) return k;
    for (const [k, alts] of Object.entries(CSV_HEADERS)) if (alts.some((a) => n.includes(a))) return k;
    return null;
  };
  let hi = -1, map = null;
  for (let i = 0; i < Math.min(5, table.length); i++) {
    const m = table[i].map(matchHeader);
    const seen = {};
    m.forEach((k, idx) => { if (k && seen[k] === undefined) seen[k] = idx; });
    if (Object.keys(seen).length >= 2 && (seen.shares !== undefined)) { hi = i; map = seen; break; }
  }
  if (hi < 0) return { rows: [], unmapped: table[0].map(String) };
  const get = (r, k) => (map[k] !== undefined ? r[map[k]] : undefined);
  const rows = [];
  for (const r of table.slice(hi + 1)) {
    const shares = parseCsvNumber(get(r, "shares"));
    const ticker = String(get(r, "ticker") || "").trim().toUpperCase();
    const name = String(get(r, "name") || "").trim();
    if (!(shares > 0) || (!ticker && !name)) continue;
    let buyPrice = parseCsvNumber(get(r, "buyPrice"));
    const totalCost = parseCsvNumber(get(r, "totalCost"));
    if (!(buyPrice > 0) && totalCost > 0) buyPrice = totalCost / shares;
    const currentPrice = parseCsvNumber(get(r, "currentPrice"));
    const currency = String(get(r, "currency") || "").trim().toUpperCase();
    const rawDate = String(get(r, "buyDate") || "").trim();
    let buyDate = "";
    if (rawDate) {
      const iso = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
      const eu = rawDate.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
      if (iso) buyDate = `${iso[1]}-${iso[2]}-${iso[3]}`;
      else if (eu) buyDate = `${eu[3]}-${eu[2].padStart(2, "0")}-${eu[1].padStart(2, "0")}`;
    }
    const t = String(get(r, "type") || "").toLowerCase();
    const type = /etf|fund|fond|rahasto/.test(t) ? "ETF" : /crypto|krypto/.test(t) ? "Crypto" : "Stock";
    rows.push({ ticker: ticker.slice(0, 12), name: name.slice(0, 60), shares, buyPrice: buyPrice > 0 ? buyPrice : "", currentPrice: currentPrice > 0 ? currentPrice : 0,
      currency: CURRENCIES.some((c) => c.code === currency) ? currency : cur, buyDate, type: TYPES.includes(type) ? type : "Stock" });
  }
  return { rows, unmapped: rows.length ? [] : table[hi].map(String) };
}

export function ImportModal({ cur, onClose, onImport, initialMode = "shot" }) {
  const [mode, setMode] = useState(initialMode); // shot | csv
  const csvRef = useRef(null);
  const [csvNote, setCsvNote] = useState("");

  /* CSV path: parse on-device; if the headers can't be mapped, offer the
     AI reader (the same one screenshots use) as a fallback. */
  const handleCsv = async (fileList) => {
    const f = Array.from(fileList || [])[0];
    if (!f) return;
    setStage("parsing"); setProgress({ done: 0, total: 1 });
    try {
      const text = await toText(f);
      const { rows: parsed, unmapped } = parseHoldingsCsv(text, cur);
      if (!parsed.length) {
        setCsvNote(unmapped.length ? `Couldn't recognise the columns (${unmapped.slice(0, 6).join(", ")}${unmapped.length > 6 ? "…" : ""}).` : "The file looks empty.");
        setErrMsg("I couldn't map this CSV's columns myself. You can let the AI read it instead (works with most broker exports), or use the template below.");
        setStage("csv-fallback"); pendingCsv.current = f;
        return;
      }
      const found = parsed.slice(0, 200).map((h) => ({
        key: uid(), include: true, ticker: h.ticker, name: h.name, domain: "", type: h.type, currency: h.currency,
        shares: h.shares, buyPrice: h.buyPrice, currentPrice: h.currentPrice, buyDate: h.buyDate,
        note: !h.buyPrice ? "No buy price in file — enter it." : "",
      }));
      setCsvNote(`Read ${found.length} row${found.length === 1 ? "" : "s"} from ${f.name} on your device — nothing was uploaded.`);
      setRows(found); setStage("review"); verifyRows(found);
    } catch (e) {
      setErrMsg(`Couldn't read the file: ${String((e && e.message) || e)}`); setStage("error");
    }
  };
  const pendingCsv = useRef(null);
  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "richr-portfolio-template.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const [stage, setStage] = useState("pick");   // pick | parsing | review | error
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState({});   // row key -> ticker/name inputs open
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [verifying, setVerifying] = useState(0); // rows still being checked against market data
  const listRef = useRef(null);

  /* Let the market-data source decide what a security is: OCR finds the
     name/ticker, search-symbols confirms the listing and its trading
     currency (BDT on the TSX is CAD whatever the screenshot said). */
  const verifyRows = async (found) => {
    const root = (sym) => String(sym || "").toUpperCase().split(".")[0].split(":")[0];
    const lookup = async (q) => {
      try {
        const { data, error } = await supabase.functions.invoke("search-symbols", { body: { q } });
        return !error && data && Array.isArray(data.results) ? data.results : [];
      } catch (e) { return []; }
    };
    const one = async (r) => {
      const t = root(r.ticker);
      let hit = null;
      if (r.name && r.name.length >= 3) {
        const res = await lookup(r.name);
        hit = res.find((x) => t && root(x.symbol) === t)
          || res.find((x) => !t && String(x.name || "").toLowerCase().startsWith(r.name.toLowerCase().slice(0, 8)))
          || null;
      }
      if (!hit && t) {
        const res = await lookup(t);
        const exact = res.filter((x) => root(x.symbol) === t);
        hit = exact.find((x) => x.currency === r.currency) || exact[0] || null;
      }
      return hit;
    };
    setVerifying(found.length);
    const queue = [...found];
    const worker = async () => {
      while (queue.length) {
        const r = queue.shift();
        const hit = await one(r);
        setVerifying((n) => n - 1);
        if (!hit) continue;
        setRows((rs) => rs.map((x) => x.key !== r.key || x.touched ? x : ({
          ...x,
          ticker: hit.symbol ? String(hit.symbol).toUpperCase().slice(0, 12) : x.ticker,
          name: x.name || hit.name || "",
          currency: hit.currency && CURRENCIES.some((c) => c.code === hit.currency) ? hit.currency : x.currency,
          type: hit.type && TYPES.includes(hit.type) ? hit.type : x.type,
          verified: { exchange: hit.exchange || hit.exchDisp || "", currency: hit.currency || "" },
        })));
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  };
  const [errMsg, setErrMsg] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");
  const fileRef = useRef(null);

  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const toText = (file) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).slice(0, 60000));
      r.onerror = () => rej(new Error("read failed"));
      r.readAsText(file);
    });

  /* Downscale/re-encode each screenshot to the vision model's sweet spot
     (max 1568px long edge, JPEG) — keeps text crisp while making 10-image
     imports fast and reliably under request-size limits. */
  const preprocessImage = (file) =>
    new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          // Step down size/quality until the payload is small enough for
          // mobile bridges (~700KB base64). Text tables survive this fine.
          const attempts = [[1400, 0.8], [1200, 0.7], [1000, 0.6], [850, 0.5]];
          let data = null;
          for (const [MAX, q] of attempts) {
            const scale = Math.min(1, MAX / Math.max(img.width, img.height));
            const w = Math.round(img.width * scale), hpx = Math.round(img.height * scale);
            const c = document.createElement("canvas");
            c.width = w; c.height = hpx;
            c.getContext("2d").drawImage(img, 0, 0, w, hpx);
            data = c.toDataURL("image/jpeg", q).split(",")[1];
            if (data.length < 700000) break;
          }
          URL.revokeObjectURL(url);
          res({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } });
        } catch (e) { rej(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("decode failed")); };
      img.src = url;
    });

  // Fallback: raw base64 without canvas (used if preprocessing fails, e.g. WebView quirks)
  const rawImageBlock = (file) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res({
        type: "image",
        source: { type: "base64", media_type: OK_TYPES.includes(file.type) ? file.type : "image/png", data: String(r.result).split(",")[1] },
      });
      r.onerror = () => rej(new Error("file read failed"));
      r.readAsDataURL(file);
    });

  const imageBlock = async (file) => {
    try { return await preprocessImage(file); }
    catch (e) { return await rawImageBlock(file); }
  };

  const buildPrompt = (isCsv) =>
    `You are extracting investment holdings from ${isCsv ? "a bank/broker export file" : "a screenshot of a bank or brokerage app"} ` +
    `(any bank — OP, Nordnet, Nordea, Avanza, Danske, Interactive Brokers, Degiro, etc. — in Finnish, Swedish or English). ` +
    `Vocabulary: "kpl"/"st"/"määrä"/"antal"/"quantity" = number of shares/units; ` +
    `"hankintahinta"/"keskihinta"/"keskikurssi"/"GAV"/"snittkurs"/"avg price"/"cost basis" = average purchase price; ` +
    `"markkina-arvo"/"marknadsvärde"/"arvo"/"värde"/"market value" = current total value; ` +
    `"kurssi"/"kurs"/"hinta"/"price" = current price per share; ` +
    `"tuotto"/"avkastning"/"return"/"+/-%" = profit/return.\n` +
    `For EVERY holding, extract: ticker (uppercase; null for funds without one), full name, company website domain if you know it, ` +
    `type (Stock/Fund/ETF), shares (decimals allowed), average buy price per share, current price per share, market value if visible or derivable, confidence from 0 to 1, ` +
    `and the TRADING currency of the holding (USD/EUR/GBP/SEK). Infer the currency logically: an explicit currency code shown ` +
    `next to the position (e.g. OP-mobiili displays portfolio totals in EUR but marks foreign stocks with their trading ` +
    `currency like "USD" — report USD for those, with prices in USD), currency symbols in the prices, or exchange conventions ` +
    `(US listings → USD, Helsinki → EUR, Stockholm → SEK, London → GBP, Toronto → CAD). If unsure, still give your best guess — it is re-checked against market data.\n` +
    `DERIVE missing numbers when the data allows — show your derivation in "note":\n` +
    `- buy price = total purchase cost ÷ shares\n` +
    `- buy price = current price ÷ (1 + return% ÷ 100)\n` +
    `- current price = market value ÷ shares\n` +
    `Numbers may use comma as decimal separator ("1 234,56" = 1234.56) — normalize to plain numbers. ` +
    `NEVER invent numbers that can't be read or derived — use null and say what's missing in "note". ` +
    `If a row is cut off at the top or bottom edge and unreadable, skip it. ` +
    `Respond with ONLY compact single-line JSON, no other text, no markdown. Keep "note" under 8 words or omit it:\n` +
    `{"holdings":[{"ticker":"NVDA","name":"Nvidia","domain":"nvidia.com","type":"Stock","currency":"USD","shares":12.5,"buyPrice":95.2,"currentPrice":128.4,"note":"buy price derived from return %"}]}`;

  const callParse = async (content) => {
    const res = await aiFetch("/api/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content }],
      }),
    });
    let json = null;
    try { json = await res.json(); } catch (e) { throw new Error(`API returned non-JSON (HTTP ${res.status})`); }
    if (!res.ok || json.type === "error" || json.error) {
      const msg = (json.error && (json.error.message || json.error.type)) || `HTTP ${res.status}`;
      throw new Error(`API error: ${String(msg).slice(0, 160)}`);
    }
    let text = "";
    if (typeof json.content === "string") text = json.content;
    else if (Array.isArray(json.content))
      text = json.content.map((b) => (typeof b === "string" ? b : (b && typeof b.text === "string" ? b.text : ""))).join("\n");
    else if (typeof json.completion === "string") text = json.completion;
    if (!text.trim()) throw new Error("API returned an empty response");
    const match = text.replace(/```json|```/g, "").match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Model reply had no JSON (started: "${text.trim().slice(0, 80)}…")`);
    return JSON.parse(match[0]);
  };

  // One task per screenshot (full model attention each) + one per CSV, with a retry.
  const runTask = async (content) => {
    try { return await callParse(content); }
    catch (e) { return await callParse(content); }
  };

  /* Merge results across images/files: scrolled screenshots overlap, so the
     same holding can appear twice — dedupe by ticker (or name) and keep the
     most complete version of each row. */
  const richness = (h) =>
    (Number(h.buyPrice) > 0 ? 2 : 0) + (Number(h.currentPrice) > 0 ? 1 : 0) +
    (h.currency ? 1 : 0) + (h.domain ? 1 : 0) + (h.name ? 1 : 0);
  const mergeHoldings = (lists) => {
    const map = new Map();
    for (const list of lists)
      for (const h of list || []) {
        if (!h || (!h.ticker && !h.name) || !(Number(h.shares) > 0)) continue;
        const key = (h.ticker ? String(h.ticker).toUpperCase() : String(h.name).toLowerCase().replace(/[^a-z0-9]/g, ""));
        const prev = map.get(key);
        if (!prev || richness(h) > richness(prev)) map.set(key, h);
      }
    return [...map.values()];
  };

  const handleFiles = async (fileList) => {
    const all = Array.from(fileList || []);
    const imgs = all.filter((f) => OK_TYPES.includes(f.type) || (!f.type && /\.(png|jpe?g|webp|gif)$/i.test(f.name))).slice(0, 10);
    const csvs = all.filter(isCsvFile).slice(0, 3);
    if (!imgs.length && !csvs.length) {
      setErrMsg("Please choose PNG/JPG screenshots (up to 10) or a CSV export from your broker. (iPhone HEIC photos aren't supported — actual screenshots are PNG and work fine.)");
      setStage("error");
      return;
    }
    setStage("parsing");
    setProgress({ done: 0, total: imgs.length + (csvs.length ? 1 : 0) });
    try {
      const jobs = [];
      for (const f of imgs) {
        jobs.push(async () => {
          const block = await imageBlock(f);
          const r = await runTask([block, { type: "text", text: buildPrompt(false) }]);
          setProgress((p) => ({ ...p, done: p.done + 1 }));
          return (r && r.holdings) || [];
        });
      }
      if (csvs.length) {
        jobs.push(async () => {
          const content = [];
          for (const f of csvs) content.push({ type: "text", text: `File "${f.name}" contents:\n${await toText(f)}` });
          content.push({ type: "text", text: buildPrompt(true) });
          const r = await runTask(content);
          setProgress((p) => ({ ...p, done: p.done + 1 }));
          return (r && r.holdings) || [];
        });
      }
      // run at most 3 jobs concurrently to stay clear of rate limits
      const settled = [];
      for (let i = 0; i < jobs.length; i += 3) {
        const batch = await Promise.allSettled(jobs.slice(i, i + 3).map((j) => j()));
        settled.push(...batch);
      }
      const lists = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
      const errors = settled.filter((s) => s.status === "rejected").map((s) => String((s.reason && s.reason.message) || s.reason));
      const merged = mergeHoldings(lists);
      if (!merged.length && errors.length) throw new Error(errors[0]);

      const found = merged.slice(0, 60).map((h) => ({
        key: uid(),
        include: true,
        ticker: h.ticker ? String(h.ticker).toUpperCase().slice(0, 10) : "",
        name: h.name ? String(h.name).slice(0, 60) : "",
        domain: h.domain ? String(h.domain).slice(0, 60) : "",
        type: TYPES.includes(h.type) ? h.type : "Stock",
        currency: CURRENCIES.some((c) => c.code === String(h.currency).toUpperCase()) ? String(h.currency).toUpperCase() : cur,
        shares: Number(h.shares),
        buyPrice: Number(h.buyPrice) > 0 ? Number(h.buyPrice) : "",
        currentPrice: Number(h.currentPrice) > 0 ? Number(h.currentPrice) : 0,
        note: `${h.confidence !== undefined && Number(h.confidence) < 0.9 ? `Low confidence (${Number(h.confidence).toFixed(2)}). ` : ""}${h.note ? String(h.note).slice(0, 100) : ""}`.trim(),
      }));
      if (!found.length) throw new Error("none found");
      setRows(found);
      setStage("review");
      verifyRows(found);
    } catch (e) {
      const detail = String((e && e.message) || e || "unknown error");
      setErrMsg(
        detail === "none found"
          ? "The AI read the file but found no holdings in it. Make sure the screenshot shows your holdings list itself (names + amounts), uncropped."
          : `Technical cause: ${detail}. If this mentions an API error or empty response, it's likely a connection/limits issue — try again in a moment or with fewer images. Otherwise: screenshot the full holdings list uncropped, or use a CSV export (most accurate).`
      );
      setStage("error");
    }
  };

  const setRow = (key, k, v) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [k]: v, touched: r.touched || ["ticker", "name", "currency"].includes(k) } : r)));
  const selected = rows.filter((r) => r.include);
  const importable = selected.filter(
    (r) => (r.ticker.trim() || r.name.trim()) && Number(r.shares) > 0 && Number(r.buyPrice) > 0
  );
  const needsPrice = selected.length - importable.length;

  const confirm = () => {
    const today = new Date().toISOString().slice(0, 10);
    onImport(importable.map((r) => ({
      id: uid(),
      ticker: (r.ticker.trim() || r.name.trim().slice(0, 8)).toUpperCase(),
      name: r.name.trim() || r.ticker.trim(),
      domain: r.domain || "",
      type: r.type,
      currency: r.currency || cur,
      shares: Number(r.shares),
      buyPrice: Number(r.buyPrice),
      buyDate: r.buyDate || today,
      currentPrice: Number(r.currentPrice) || 0,
      thesis: "",
      verdict: "open",
    })));
  };

  const input = "border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white w-full";

  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-y-auto overscroll-contain flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-lg text-slate-700">Import holdings</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
            <X size={15} />
          </button>
        </div>

        {stage === "pick" && (
          <div className="px-6 pt-4">
            <div className="bg-slate-100 rounded-2xl p-1 flex">
              {[["shot", "Screenshot"], ["csv", "CSV file"]].map(([id, lbl]) => (
                <button key={id} onClick={() => setMode(id)}
                  className={`flex-1 text-sm font-semibold py-2 rounded-xl transition ${mode === id ? "bg-white text-slate-700 shadow-sm" : "text-slate-400"}`}>{lbl}</button>
              ))}
            </div>
          </div>
        )}

        {stage === "pick" && mode === "csv" && (
          <div className="p-6">
            <button onClick={() => csvRef.current && csvRef.current.click()}
              className="w-full border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center hover:border-emerald-300 transition">
              <Upload size={26} className="mx-auto text-emerald-500 mb-3" />
              <p className="font-semibold text-slate-600 text-sm">Choose a CSV export</p>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Nordnet, Avanza, Interactive Brokers, Degiro, OP, Nordea… or our template. Read on your device — the file is never uploaded.
                Columns recognised: ticker/symbol, name, shares/antal/määrä, buy price/GAV/hankintahinta (or total cost), current price, currency, buy date.
              </p>
            </button>
            <input ref={csvRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" className="hidden" onChange={(e) => handleCsv(e.target.files)} />
            <div className="mt-4 flex items-center justify-between gap-3 bg-slate-50 rounded-2xl px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-700">Starting from scratch?</div>
                <p className="text-[11px] text-slate-400">Download the template, fill it in a spreadsheet, upload it here.</p>
              </div>
              <button onClick={downloadTemplate} className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-2 rounded-xl shrink-0">Template.csv</button>
            </div>
            <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
              Tip: in Nordnet/Avanza open your holdings, choose Export → CSV. Semicolons and “1 234,56” numbers are fine.
            </p>
          </div>
        )}

        {stage === "csv-fallback" && (
          <div className="p-6 text-center">
            <p className="font-semibold text-slate-600 text-sm mb-1.5">Columns not recognised</p>
            <p className="text-xs text-slate-500 mb-1">{csvNote}</p>
            <p className="text-sm text-slate-400 mb-4 leading-relaxed">{errMsg}</p>
            <div className="flex gap-2 justify-center flex-wrap">
              <button onClick={() => { const f = pendingCsv.current; pendingCsv.current = null; setStage("pick"); if (f) handleFiles([f]); }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2.5 rounded-full shadow">Let AI read it</button>
              <button onClick={downloadTemplate} className="bg-slate-100 text-slate-600 text-sm font-semibold px-4 py-2.5 rounded-full">Get the template</button>
              <button onClick={() => setStage("pick")} className="bg-slate-100 text-slate-600 text-sm font-semibold px-4 py-2.5 rounded-full">Back</button>
            </div>
          </div>
        )}

        {stage === "pick" && mode === "shot" && (
          <div className="p-6">
            <button onClick={() => fileRef.current && fileRef.current.click()}
              className="w-full border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center hover:border-emerald-300 transition">
              <Upload size={26} className="mx-auto text-emerald-500 mb-3" />
              <p className="font-semibold text-slate-600 text-sm">Choose screenshots</p>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Screenshots of your holdings from any bank app (OP, Nordnet, Nordea, Avanza…) — up to 10 images.
                Scrolled, overlapping screenshots are fine: duplicates are merged automatically.
              </p>
            </button>
            <input ref={fileRef} type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,.csv,.tsv,.txt,text/csv" multiple
              className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
              Your screenshot is read by AI to extract the holdings, then discarded — it isn't stored. You'll review
              everything before it's added.
            </p>
          </div>
        )}

        {stage === "parsing" && (
          <div className="p-10 text-center">
            <RefreshCw size={24} className="mx-auto text-emerald-500 mb-3" style={{ animation: "spin 1s linear infinite" }} />
            <p className="font-semibold text-slate-600 text-sm">Reading your holdings…</p>
            <p className="text-xs text-slate-400 mt-1">
              {progress.total > 1 ? `${progress.done} of ${progress.total} files done — each screenshot is read individually for accuracy.` : "This takes a few seconds."}
            </p>
          </div>
        )}

        {stage === "error" && (
          <div className="p-6 text-center">
            <p className="font-semibold text-slate-600 text-sm mb-1.5">Import didn't work</p>
            <p className="text-sm text-slate-400 mb-4 leading-relaxed">{errMsg}</p>
            {testResult && (
              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl p-3 mb-4 leading-relaxed break-words">
                {testResult}
              </p>
            )}
            <div className="flex gap-2 justify-center flex-wrap">
              <button onClick={() => setStage("pick")}
                className="bg-slate-100 text-slate-600 text-sm font-semibold px-4 py-2.5 rounded-full">Try again</button>
              <button disabled={testing} onClick={async () => {
                setTesting(true); setTestResult("Testing connection…");
                try {
                  const r = await aiFetch("/api/openai", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000,
                      messages: [{ role: "user", content: "Reply with exactly: OK" }] }),
                  });
                  let j = null; let raw = "";
                  try { j = await r.json(); } catch (e) { raw = "(response was not JSON)"; }
                  const txt = j ? (typeof j.content === "string" ? j.content
                    : Array.isArray(j.content) ? j.content.map((b) => (b && b.text) || "").join("")
                    : typeof j.completion === "string" ? j.completion
                    : j.error ? `error: ${j.error.message || j.error.type}` : JSON.stringify(j).slice(0, 200)) : raw;
                  setTestResult(`Connection test → HTTP ${r.status}. Model said: "${String(txt).slice(0, 120)}". ` +
                    (String(txt).includes("OK") ? "Text calls WORK — the problem is image payloads." : "Text calls FAIL too — the AI pathway itself isn't available here."));
                } catch (e) {
                  setTestResult(`Connection test threw: ${String((e && e.message) || e).slice(0, 160)} — the AI pathway itself isn't available in this environment.`);
                }
                setTesting(false);
              }}
                className="bg-emerald-50 text-emerald-700 text-sm font-semibold px-4 py-2.5 rounded-full disabled:opacity-60">
                {testing ? "Testing…" : "Run connection test"}
              </button>
            </div>
          </div>
        )}

        {stage === "review" && (
          <>
            <div ref={listRef} className="px-4 pt-3 pb-2 space-y-2 overflow-y-auto">
              {csvNote && <p className="text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">{csvNote}</p>}
              <p className="text-xs text-slate-400 leading-relaxed">
                Found {rows.length} holding{rows.length === 1 ? "" : "s"}. Check shares and buy price — that's how returns are calculated.
                Current prices are fetched automatically.
                {verifying > 0 && <span className="text-slate-500"> Confirming listings & currencies with market data…</span>}
              </p>
              {onlyMissing && (
                <button onClick={() => setOnlyMissing(false)} className="text-xs font-semibold text-emerald-600">← Show all {rows.length}</button>
              )}
              {rows.filter((r) => !onlyMissing || !(Number(r.buyPrice) > 0)).map((r) => {
                const ok = (r.ticker.trim() || r.name.trim()) && Number(r.shares) > 0 && Number(r.buyPrice) > 0;
                const edit = !!editing[r.key] || (!r.ticker.trim() && !r.name.trim());
                return (
                  <div key={r.key}
                    className={`border rounded-xl px-3 py-2.5 ${r.include ? (ok ? "border-slate-200" : "border-amber-300 bg-amber-50/40") : "border-slate-100 opacity-50"}`}>
                    <div className="flex items-center gap-2.5">
                      <input type="checkbox" checked={r.include}
                        onChange={(e) => setRow(r.key, "include", e.target.checked)}
                        className="w-4 h-4 accent-emerald-500 shrink-0" />
                      {edit ? (
                        <div className="flex-1 flex items-center gap-2 min-w-0">
                          <input value={r.ticker} onChange={(e) => setRow(r.key, "ticker", e.target.value)}
                            placeholder="TICKER" className={input + " uppercase font-semibold py-1"} style={{ maxWidth: 96 }} autoFocus />
                          <input value={r.name} onChange={(e) => setRow(r.key, "name", e.target.value)}
                            placeholder="Name" className={input + " py-1"} />
                          <button onClick={() => setEditing((m) => ({ ...m, [r.key]: false }))} className="text-xs font-semibold text-emerald-600 shrink-0">Done</button>
                        </div>
                      ) : (
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-slate-900 text-[15px] leading-tight flex items-center gap-1.5">
                              {r.ticker || "—"}
                              {r.verified && (
                                <span className="text-[9px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded-full" title="Listing confirmed with market data">
                                  {[r.verified.exchange, r.verified.currency].filter(Boolean).join(" · ")}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 truncate">{r.name}</div>
                          </div>
                          <button onClick={() => setEditing((m) => ({ ...m, [r.key]: true }))}
                            className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0" aria-label="Edit ticker or name">
                            <Pencil size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">SHARES</label>
                        <input type="number" value={r.shares} onChange={(e) => setRow(r.key, "shares", e.target.value)} className={input + " py-1"} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">BUY PRICE *</label>
                        <input type="number" value={r.buyPrice} onChange={(e) => setRow(r.key, "buyPrice", e.target.value)}
                          placeholder="required" className={input + " py-1" + (Number(r.buyPrice) > 0 ? "" : " border-amber-400")} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">CURRENCY</label>
                        <select value={r.currency} onChange={(e) => setRow(r.key, "currency", e.target.value)} className={input + " py-1"}>
                          {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                        </select>
                      </div>
                    </div>
                    {r.note && !r.verified && (
                      <p className="text-[10px] text-slate-400 mt-1.5 leading-snug">ⓘ {r.note}</p>
                    )}
                    {r.note && r.verified && /buy price|missing/i.test(r.note) && !(Number(r.buyPrice) > 0) && (
                      <p className="text-[10px] text-amber-600 mt-1.5 leading-snug">ⓘ Buy price wasn't in the screenshot — enter it.</p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="px-4 py-3 border-t border-slate-100 shrink-0 bg-white">
              <div className="flex items-center justify-between text-xs font-semibold mb-2">
                <span className="text-slate-600 tabular-nums">
                  <span className="text-emerald-600">{importable.length} ready</span>
                  {needsPrice > 0 && <span className="text-amber-600"> · {needsPrice} need attention</span>}
                  {selected.length < rows.length && <span className="text-slate-400"> · {rows.length - selected.length} skipped</span>}
                </span>
                {needsPrice > 0 && !onlyMissing && (
                  <button onClick={() => { setOnlyMissing(true); if (listRef.current) listRef.current.scrollTop = 0; }}
                    className="text-amber-700">Review {needsPrice} missing →</button>
                )}
              </div>
              <button onClick={confirm} disabled={!importable.length}
                className="btn-primary w-full disabled:opacity-50">
                Add {importable.length} ready position{importable.length === 1 ? "" : "s"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
