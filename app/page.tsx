"use client";
import { useState, useMemo, useEffect } from "react";

const STORAGE_KEY = "xau_journal_trades";

const initialForm = {
  date: new Date().toISOString().slice(0, 10),
  time: new Date().toTimeString().slice(0, 5),
  type: "Day", direction: "Long",
  entry: "", sl: "", tp: "", lots: "",
  exitPrice: "", exitTime: "",
  partialClose: false, partialLots: "", partialExit: "",
  rr: "", notes: "", session: "London", setup: "", emotion: "Neutral",
};

const sessions = ["Asia", "London", "NY", "Overlap"];
const setups = ["BOS", "MSS", "OB", "FVG", "Liquidity Grab", "Trend", "Scalp", "Other"];
const emotions = ["Calm", "Neutral", "Anxious", "FOMO", "Confident", "Hesitant"];

function calcPnL(direction, entry, exit, lots) {
  const e = parseFloat(entry), x = parseFloat(exit), l = parseFloat(lots);
  if (isNaN(e) || isNaN(x) || isNaN(l)) return null;
  return +((direction === "Long" ? x - e : e - x) * l * 100).toFixed(2);
}

function calcRR(direction, entry, sl, tp) {
  const e = parseFloat(entry), s = parseFloat(sl), t = parseFloat(tp);
  if (isNaN(e) || isNaN(s) || isNaN(t)) return null;
  const risk = Math.abs(e - s);
  return risk === 0 ? null : +(Math.abs(t - e) / risk).toFixed(2);
}

function getWeekKey(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

function getMonthKey(dateStr) { return dateStr.slice(0, 7); }

function formatWeek(weekStart) {
  const d = new Date(weekStart);
  const end = new Date(d); end.setDate(d.getDate() + 4);
  const fmt = x => x.toLocaleDateString("fr-CA", { day: "numeric", month: "short" });
  return `${fmt(d)} — ${fmt(end)}`;
}

function formatMonth(monthKey) {
  const [y, m] = monthKey.split("-");
  return new Date(y, m - 1, 1).toLocaleDateString("fr-CA", { month: "long", year: "numeric" });
}

function groupTrades(trades, groupFn) {
  const groups = {};
  trades.forEach(t => { const k = groupFn(t.date); if (!groups[k]) groups[k] = []; groups[k].push(t); });
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
}

function calcGroupStats(trades) {
  const closed = trades.filter(t => t.exitPrice && t.lots);
  const wins = closed.filter(t => (calcPnL(t.direction, t.entry, t.exitPrice, t.lots) ?? 0) > 0);
  const losses = closed.filter(t => (calcPnL(t.direction, t.entry, t.exitPrice, t.lots) ?? 0) < 0);
  const totalPnl = closed.reduce((s, t) => s + (calcPnL(t.direction, t.entry, t.exitPrice, t.lots) || 0), 0);
  const rrTrades = closed.filter(t => t.rr);
  const avgRR = rrTrades.length ? rrTrades.reduce((s, t) => s + parseFloat(t.rr || 0), 0) / rrTrades.length : null;
  const best = closed.reduce((b, t) => { const p = calcPnL(t.direction, t.entry, t.exitPrice, t.lots) || 0; return p > (calcPnL(b?.direction, b?.entry, b?.exitPrice, b?.lots) || -Infinity) ? t : b; }, null);
  const worst = closed.reduce((w, t) => { const p = calcPnL(t.direction, t.entry, t.exitPrice, t.lots) || 0; return p < (calcPnL(w?.direction, w?.entry, w?.exitPrice, w?.lots) || Infinity) ? t : w; }, null);
  return { total: trades.length, closed: closed.length, wins: wins.length, losses: losses.length, winRate: closed.length ? Math.round((wins.length / closed.length) * 100) : 0, totalPnl: +totalPnl.toFixed(2), avgRR: avgRR !== null ? +avgRR.toFixed(2) : null, best, worst };
}

function Badge({ children, color }) {
  const colors = { green: "bg-emerald-900/60 text-emerald-300 border-emerald-700", red: "bg-red-900/60 text-red-300 border-red-700", gold: "bg-amber-900/60 text-amber-300 border-amber-700", blue: "bg-sky-900/60 text-sky-300 border-sky-700", gray: "bg-zinc-800 text-zinc-400 border-zinc-700" };
  return <span className={`text-xs px-2 py-0.5 rounded border font-mono ${colors[color] || colors.gray}`}>{children}</span>;
}

function StatCard({ label, value, sub, color }) {
  const colors = { gold: "text-amber-400", green: "text-emerald-400", red: "text-red-400", white: "text-white" };
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-zinc-500 text-xs uppercase tracking-widest font-mono">{label}</span>
      <span className={`text-2xl font-bold font-mono ${colors[color] || "text-white"}`}>{value}</span>
      {sub && <span className="text-zinc-500 text-xs font-mono">{sub}</span>}
    </div>
  );
}

function SummaryBlock({ stats, pnlColor }) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-3">
      <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800"><div className="text-zinc-500 text-xs mb-1">P&L</div><div className={`font-bold font-mono text-lg ${pnlColor(stats.totalPnl)}`}>{stats.totalPnl >= 0 ? "+" : ""}${stats.totalPnl}</div></div>
      <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800"><div className="text-zinc-500 text-xs mb-1">Win Rate</div><div className={`font-bold font-mono text-lg ${stats.winRate >= 50 ? "text-emerald-400" : "text-red-400"}`}>{stats.winRate}%</div></div>
      <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800"><div className="text-zinc-500 text-xs mb-1">Trades</div><div className="font-bold font-mono text-white">{stats.closed} <span className="text-zinc-500 text-xs font-normal">({stats.wins}W / {stats.losses}L)</span></div></div>
      <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800"><div className="text-zinc-500 text-xs mb-1">R:R Moyen</div><div className="font-bold font-mono text-amber-400">{stats.avgRR !== null ? `1:${stats.avgRR}` : "—"}</div></div>
      {stats.best && <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800"><div className="text-zinc-500 text-xs mb-1">Meilleur</div><div className="font-bold font-mono text-emerald-400 text-sm">+${calcPnL(stats.best.direction, stats.best.entry, stats.best.exitPrice, stats.best.lots)}</div><div className="text-zinc-600 text-xs">{stats.best.date}</div></div>}
      {stats.worst && <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800"><div className="text-zinc-500 text-xs mb-1">Pire</div><div className="font-bold font-mono text-red-400 text-sm">${calcPnL(stats.worst.direction, stats.worst.entry, stats.worst.exitPrice, stats.worst.lots)}</div><div className="text-zinc-600 text-xs">{stats.worst.date}</div></div>}
    </div>
  );
}

export default function TradingJournal() {
  const [trades, setTrades] = useState(() => { try { const s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : []; } catch { return []; } });
  const [view, setView] = useState("log");
  const [form, setForm] = useState(initialForm);
  const [selected, setSelected] = useState(null);
  const [filterDir, setFilterDir] = useState("All");
  const [filterType, setFilterType] = useState("All");
  const [expandedGroup, setExpandedGroup] = useState(null);

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trades)); } catch {} }, [trades]);

  const rr = useMemo(() => calcRR(form.direction, form.entry, form.sl, form.tp), [form.direction, form.entry, form.sl, form.tp]);
  const livePnL = useMemo(() => calcPnL(form.direction, form.entry, form.exitPrice, form.lots), [form.direction, form.entry, form.exitPrice, form.lots]);
  const stats = useMemo(() => trades.length ? calcGroupStats(trades) : null, [trades]);
  const filteredTrades = useMemo(() => trades.filter(t => (filterDir === "All" || t.direction === filterDir) && (filterType === "All" || t.type === filterType)).sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? "").localeCompare(a.time ?? "")), [trades, filterDir, filterType]);
  const weeklyGroups = useMemo(() => groupTrades(trades, getWeekKey), [trades]);
  const monthlyGroups = useMemo(() => groupTrades(trades, getMonthKey), [trades]);

  function handleChange(e) { const { name, value, type, checked } = e.target; setForm(f => ({ ...f, [name]: type === "checkbox" ? checked : value })); }
  function handleSubmit() { if (!form.entry || !form.lots) return; setTrades(t => [{ ...form, id: Date.now(), rr: form.rr || rr }, ...t]); setForm(initialForm); setView("log"); }
  function deleteTrade(id) { setTrades(t => t.filter(x => x.id !== id)); setSelected(null); setView("log"); }

  function exportCSV() {
    const h = ["date","time","type","direction","entry","sl","tp","lots","exitPrice","exitTime","rr","pnl","session","setup","emotion","notes"];
    const rows = trades.map(t => h.map(k => k === "pnl" ? (calcPnL(t.direction, t.entry, t.exitPrice, t.lots) ?? "") : (t[k] ?? "")).join(","));
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([[h.join(","), ...rows].join("\n")], { type: "text/csv" })); a.download = `xauusd_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  }
  function exportJSON() { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(trades, null, 2)], { type: "application/json" })); a.download = `xauusd_${new Date().toISOString().slice(0,10)}.json`; a.click(); }
  function importJSON(e) { const file = e.target.files?.[0]; if (!file) return; const r = new FileReader(); r.onload = ev => { try { const d = JSON.parse(ev.target.result); if (Array.isArray(d)) setTrades(d); } catch {} }; r.readAsText(file); e.target.value = ""; }

  const pnlColor = pnl => (pnl ?? 0) > 0 ? "text-emerald-400" : (pnl ?? 0) < 0 ? "text-red-400" : "text-zinc-400";
  const mono = { fontFamily: "'JetBrains Mono', 'Fira Code', monospace" };

  const NavTabs = () => (
    <div className="flex border-b border-zinc-900">
      {[["log","Trades"], ["weekly","Weekly"], ["monthly","Monthly"]].map(([v, l]) => (
        <button key={v} onClick={() => setView(v)} className={`flex-1 py-3 text-xs uppercase tracking-widest font-mono transition-colors ${view === v ? "text-amber-400 border-b-2 border-amber-400" : "text-zinc-500 hover:text-zinc-300"}`}>{l}</button>
      ))}
    </div>
  );

  const TradeRow = ({ t }) => {
    const pnl = calcPnL(t.direction, t.entry, t.exitPrice, t.lots);
    return (
      <button onClick={() => { setSelected(t); setView("detail"); }} className="w-full text-left bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 rounded-xl p-3 transition-all">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap"><span className="text-zinc-400 text-xs">{t.date}</span><Badge color={t.direction === "Long" ? "green" : "red"}>{t.direction}</Badge>{t.setup && <span className="text-zinc-600 text-xs">{t.setup}</span>}</div>
          {pnl !== null ? <span className={`text-sm font-bold font-mono ${pnlColor(pnl)}`}>{pnl >= 0 ? "+" : ""}${pnl}</span> : <span className="text-zinc-600 text-xs">ouvert</span>}
        </div>
      </button>
    );
  };

  const GroupView = ({ groups, labelFn }) => (
    <div className="p-4 flex flex-col gap-3">
      {groups.length === 0 && <div className="text-center py-20 text-zinc-600"><div className="text-4xl mb-3">◈</div><div className="text-sm">Aucun trade enregistré</div></div>}
      {groups.map(([key, gTrades]) => {
        const s = calcGroupStats(gTrades);
        const isOpen = expandedGroup === key;
        return (
          <div key={key} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <button onClick={() => setExpandedGroup(isOpen ? null : key)} className="w-full p-4 text-left">
              <div className="flex items-center justify-between mb-2">
                <div className="font-bold text-sm capitalize">{labelFn(key)}</div>
                <div className="flex items-center gap-3"><span className={`font-bold font-mono text-lg ${pnlColor(s.totalPnl)}`}>{s.totalPnl >= 0 ? "+" : ""}${s.totalPnl}</span><span className="text-zinc-500 text-xs">{isOpen ? "▲" : "▼"}</span></div>
              </div>
              <div className="flex gap-3 text-xs font-mono text-zinc-500">
                <span>{s.closed} trades</span>
                <span className={s.winRate >= 50 ? "text-emerald-400" : "text-red-400"}>{s.winRate}% WR</span>
                {s.avgRR && <span className="text-amber-300">R:R 1:{s.avgRR}</span>}
              </div>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 border-t border-zinc-800 pt-4">
                <SummaryBlock stats={s} pnlColor={pnlColor} />
                <div className="flex flex-col gap-2">{gTrades.sort((a,b) => b.date.localeCompare(a.date)).map(t => <TradeRow key={t.id} t={t} />)}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  if (view === "detail" && selected) {
    const t = selected; const pnl = calcPnL(t.direction, t.entry, t.exitPrice, t.lots);
    return (
      <div style={{ background: "#0a0a0a", minHeight: "100vh", ...mono }} className="text-white p-4 max-w-xl mx-auto">
        <button onClick={() => setView("log")} className="text-zinc-500 hover:text-amber-400 mb-6 text-sm transition-colors">← Retour</button>
        <div className="flex items-center justify-between mb-6">
          <div><div className="text-amber-400 text-xs tracking-widest uppercase mb-1">{t.date} · {t.time}</div><div className="text-xl font-bold">XAUUSD — {t.direction}</div></div>
          <div className="flex gap-2"><Badge color={t.type === "Day" ? "gold" : "blue"}>{t.type}</Badge><Badge color={t.direction === "Long" ? "green" : "red"}>{t.direction}</Badge></div>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[["Entry", t.entry, "text-amber-300"], ["SL", t.sl || "—", "text-red-400"], ["TP", t.tp || "—", "text-emerald-400"]].map(([l, v, c]) => (
            <div key={l} className="bg-zinc-900 rounded-xl p-3 border border-zinc-800"><div className="text-zinc-500 text-xs mb-1">{l}</div><div className={`font-bold ${c}`}>{v}</div></div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-800"><div className="text-zinc-500 text-xs mb-1">Exit</div><div className="font-bold">{t.exitPrice || "—"}{t.exitTime && <span className="text-zinc-500 text-xs"> · {t.exitTime}</span>}</div></div>
          <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-800"><div className="text-zinc-500 text-xs mb-1">Lots</div><div className="font-bold">{t.lots}</div></div>
          <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-800"><div className="text-zinc-500 text-xs mb-1">R:R</div><div className="font-bold text-amber-300">{t.rr ? `1:${t.rr}` : "—"}</div></div>
          <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-800"><div className="text-zinc-500 text-xs mb-1">P&L</div><div className={`font-bold text-lg ${pnlColor(pnl)}`}>{pnl !== null ? `${pnl >= 0 ? "+" : ""}$${pnl}` : "—"}</div></div>
        </div>
        {t.partialClose && <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 mb-4"><div className="text-zinc-400 text-xs uppercase tracking-widest mb-2">Clôture partielle</div><div className="flex gap-4 text-sm"><span>Lots: <span className="text-amber-300">{t.partialLots}</span></span><span>Prix: <span className="text-amber-300">{t.partialExit}</span></span></div></div>}
        <div className="grid grid-cols-3 gap-2 mb-4">{[["Session", t.session], ["Setup", t.setup || "—"], ["Émotion", t.emotion]].map(([l, v]) => (<div key={l} className="bg-zinc-900 rounded-xl p-3 border border-zinc-800 text-center"><div className="text-zinc-500 text-xs mb-1">{l}</div><div className="text-sm">{v}</div></div>))}</div>
        {t.notes && <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 mb-6"><div className="text-zinc-500 text-xs uppercase tracking-widest mb-2">Notes</div><div className="text-zinc-300 text-sm leading-relaxed">{t.notes}</div></div>}
        <button onClick={() => deleteTrade(t.id)} className="w-full py-3 border border-red-900 text-red-500 hover:bg-red-900/20 rounded-xl text-sm transition-colors">Supprimer ce trade</button>
      </div>
    );
  }

  if (view === "add") {
    return (
      <div style={{ background: "#0a0a0a", minHeight: "100vh", ...mono }} className="text-white p-4 max-w-xl mx-auto pb-12">
        <button onClick={() => setView("log")} className="text-zinc-500 hover:text-amber-400 mb-6 text-sm transition-colors">← Annuler</button>
        <div className="text-amber-400 text-xs tracking-widest uppercase mb-1">Nouveau trade</div>
        <div className="text-xl font-bold mb-6">XAUUSD</div>
        <div className="grid grid-cols-2 gap-3 mb-4">{[["date","Date","date"],["time","Heure","time"]].map(([n,l,tp]) => (<div key={n}><label className="text-zinc-500 text-xs uppercase tracking-widest block mb-1">{l}</label><input type={tp} name={n} value={form[n]} onChange={handleChange} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-amber-500 outline-none" /></div>))}</div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div><label className="text-zinc-500 text-xs uppercase tracking-widest block mb-1">Type</label><div className="flex gap-2">{["Day","Swing"].map(v => <button key={v} onClick={() => setForm(f => ({...f, type: v}))} className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${form.type === v ? "border-amber-500 text-amber-400 bg-amber-900/20" : "border-zinc-700 text-zinc-400 bg-zinc-900"}`}>{v}</button>)}</div></div>
          <div><label className="text-zinc-500 text-xs uppercase tracking-widest block mb-1">Direction</label><div className="flex gap-2">{["Long","Short"].map(v => <button key={v} onClick={() => setForm(f => ({...f, direction: v}))} className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${form.direction === v ? v === "Long" ? "border-emerald-500 text-emerald-400 bg-emerald-900/20" : "border-red-500 text-red-400 bg-red-900/20" : "border-zinc-700 text-zinc-400 bg-zinc-900"}`}>{v}</button>)}</div></div>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">{[["entry","Entry *","text-amber-300"],["sl","Stop Loss","text-red-400"],["tp","Take Profit","text-emerald-400"]].map(([n,l,c]) => (<div key={n}><label className={`text-xs uppercase tracking-widest block mb-1 ${c}`}>{l}</label><input type="number" name={n} value={form[n]} onChange={handleChange} placeholder="0.00" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-amber-500 outline-none" /></div>))}</div>
        {rr !== null && <div className="bg-amber-900/20 border border-amber-800/50 rounded-lg px-3 py-2 text-sm text-amber-300 mb-4">R:R calculé → <strong>1:{rr}</strong></div>}
        <div className="mb-4"><label className="text-zinc-500 text-xs uppercase tracking-widest block mb-1">Lots *</label><input type="number" name="lots" value={form.lots} onChange={handleChange} placeholder="0.01" step="0.01" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-amber-500 outline-none" /></div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div><label className="text-zinc-500 text-xs uppercase tracking-widest block mb-1">Prix de sortie</label><input type="number" name="exitPrice" value={form.exitPrice} onChange={handleChange} placeholder="0.00" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-amber-500 outline-none" /></div>
          <div><label className="text-zinc-500 text-xs uppercase tracking-widest block mb-1">Heure sortie</label><input type="time" name="exitTime" value={form.exitTime} onChange={handleChange} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-amber-500 outline-none" /></div>
        </div>
        {livePnL !== null && <div className={`border rounded-lg px-3 py-2 text-sm mb-4 ${livePnL >= 0 ? "bg-emerald-900/20 border-emerald-800/50 text-emerald-300" : "bg-red-900/20 border-red-800/50 text-red-300"}`}>P&L estimé → <strong>{livePnL >= 0 ? "+" : ""}${livePnL}</strong></div>}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4">
          <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" name="partialClose" checked={form.partialClose} onChange={handleChange} className="w-4 h-4 accent-amber-500" /><span className="text-sm text-zinc-300">Clôture partielle</span></label>
          {form.partialClose && <div className="grid grid-cols-2 gap-3 mt-3"><div><label className="text-zinc-500 text-xs block mb-1">Lots clôturés</label><input type="number" name="partialLots" value={form.partialLots} onChange={handleChange} placeholder="0.01" step="0.01" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-amber-500 outline-none" /></div><div><label className="text-zinc-500 text-xs block mb-1">Prix clôture partielle</label><input type="number" name="partialExit" value={form.partialExit} onChange={handleChange} placeholder="0.00" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-amber-500 outline-none" /></div></div>}
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div><label className="text-zinc-500 text-xs uppercase tracking-widest block mb-1">Session</label><select name="session" value={form.session} onChange={handleChange} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-amber-500 outline-none">{sessions.map(s => <option key={s}>{s}</option>)}</select></div>
          <div><label className="text-zinc-500 text-xs uppercase tracking-widest block mb-1">Setup</label><select name="setup" value={form.setup} onChange={handleChange} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-amber-500 outline-none"><option value="">—</option>{setups.map(s => <option key={s}>{s}</option>)}</select></div>
        </div>
        <div className="mb-4"><label className="text-zinc-500 text-xs uppercase tracking-widest block mb-2">État émotionnel</label><div className="flex flex-wrap gap-2">{emotions.map(e => <button key={e} onClick={() => setForm(f => ({...f, emotion: e}))} className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${form.emotion === e ? "border-amber-500 text-amber-400 bg-amber-900/20" : "border-zinc-700 text-zinc-500 bg-zinc-900"}`}>{e}</button>)}</div></div>
        <div className="mb-6"><label className="text-zinc-500 text-xs uppercase tracking-widest block mb-1">Notes</label><textarea name="notes" value={form.notes} onChange={handleChange} placeholder="Contexte, raison d'entrée, leçons..." rows={3} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-amber-500 outline-none resize-none" /></div>
        <button onClick={handleSubmit} disabled={!form.entry || !form.lots} className="w-full py-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-30 disabled:cursor-not-allowed text-black font-bold rounded-xl text-sm transition-colors tracking-widest uppercase">Enregistrer le trade</button>
      </div>
    );
  }

  if (view === "weekly") {
    return (
      <div style={{ background: "#0a0a0a", minHeight: "100vh", ...mono }} className="text-white max-w-xl mx-auto">
        <div className="px-4 pt-6 pb-4 border-b border-zinc-900 flex items-center justify-between"><div><div className="text-amber-400 text-xs tracking-widest uppercase">Trading Journal</div><div className="text-2xl font-bold tracking-tight">XAUUSD</div></div><button onClick={() => setView("add")} className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-xl text-sm transition-colors tracking-widest">+ TRADE</button></div>
        <NavTabs />
        <GroupView groups={weeklyGroups} labelFn={k => `Semaine du ${formatWeek(k)}`} />
      </div>
    );
  }

  if (view === "monthly") {
    return (
      <div style={{ background: "#0a0a0a", minHeight: "100vh", ...mono }} className="text-white max-w-xl mx-auto">
        <div className="px-4 pt-6 pb-4 border-b border-zinc-900 flex items-center justify-between"><div><div className="text-amber-400 text-xs tracking-widest uppercase">Trading Journal</div><div className="text-2xl font-bold tracking-tight">XAUUSD</div></div><button onClick={() => setView("add")} className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-xl text-sm transition-colors tracking-widest">+ TRADE</button></div>
        <NavTabs />
        <GroupView groups={monthlyGroups} labelFn={formatMonth} />
      </div>
    );
  }

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", ...mono }} className="text-white max-w-xl mx-auto">
      <div className="px-4 pt-6 pb-4 border-b border-zinc-900">
        <div className="flex items-center justify-between">
          <div><div className="text-amber-400 text-xs tracking-widest uppercase">Trading Journal</div><div className="text-2xl font-bold tracking-tight">XAUUSD</div></div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {trades.length > 0 && <><button onClick={exportCSV} className="border border-zinc-700 hover:border-amber-500 text-zinc-400 hover:text-amber-400 px-3 py-2 rounded-xl text-xs transition-colors">CSV ↓</button><button onClick={exportJSON} className="border border-zinc-700 hover:border-amber-500 text-zinc-400 hover:text-amber-400 px-3 py-2 rounded-xl text-xs transition-colors">JSON ↓</button></>}
            <label className="border border-zinc-700 hover:border-amber-500 text-zinc-400 hover:text-amber-400 px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer">JSON ↑<input type="file" accept=".json" onChange={importJSON} className="hidden" /></label>
            <button onClick={() => setView("add")} className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-xl text-sm transition-colors tracking-widest">+ TRADE</button>
          </div>
        </div>
      </div>
      {stats && <div className="p-4 grid grid-cols-2 gap-3 border-b border-zinc-900"><StatCard label="Win Rate" value={`${stats.winRate}%`} sub={`${stats.closed} trades clôturés`} color={stats.winRate >= 50 ? "green" : "red"} /><StatCard label="P&L Total" value={`${stats.totalPnl >= 0 ? "+" : ""}$${stats.totalPnl}`} sub="tous trades" color={stats.totalPnl >= 0 ? "green" : "red"} /><StatCard label="R:R Moyen" value={stats.avgRR !== null ? `1:${stats.avgRR}` : "—"} color="gold" /><StatCard label="Trades" value={stats.total} sub={`${stats.closed} fermés`} color="white" /></div>}
      <NavTabs />
      {trades.length > 0 && <div className="px-4 py-3 flex gap-2 border-b border-zinc-900 overflow-x-auto">{["All","Long","Short"].map(f => <button key={f} onClick={() => setFilterDir(f)} className={`px-3 py-1 rounded-lg text-xs border whitespace-nowrap transition-colors ${filterDir === f ? "border-amber-500 text-amber-400" : "border-zinc-800 text-zinc-500"}`}>{f}</button>)}<div className="w-px bg-zinc-800 mx-1" />{["All","Day","Swing"].map(f => <button key={f} onClick={() => setFilterType(f)} className={`px-3 py-1 rounded-lg text-xs border whitespace-nowrap transition-colors ${filterType === f ? "border-amber-500 text-amber-400" : "border-zinc-800 text-zinc-500"}`}>{f}</button>)}</div>}
      <div className="p-4 flex flex-col gap-2">
        {filteredTrades.length === 0 && <div className="text-center py-20 text-zinc-600"><div className="text-4xl mb-3">◈</div><div className="text-sm">Aucun trade enregistré</div><div className="text-xs mt-1 text-zinc-700">Appuie sur + TRADE pour commencer</div></div>}
        {filteredTrades.map(t => {
          const pnl = calcPnL(t.direction, t.entry, t.exitPrice, t.lots);
          return (
            <button key={t.id} onClick={() => { setSelected(t); setView("detail"); }} className="w-full text-left bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition-all">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 flex-wrap"><span className="text-amber-400 text-xs">{t.date}</span>{t.time && <span className="text-zinc-600 text-xs">{t.time}</span>}<Badge color={t.direction === "Long" ? "green" : "red"}>{t.direction}</Badge><Badge color={t.type === "Day" ? "gold" : "blue"}>{t.type}</Badge>{t.partialClose && <Badge color="gray">Partiel</Badge>}</div>
                {pnl !== null ? <span className={`text-sm font-bold font-mono ${pnlColor(pnl)}`}>{pnl >= 0 ? "+" : ""}${pnl}</span> : <span className="text-zinc-600 text-xs">ouvert</span>}
              </div>
              <div className="flex gap-4 text-xs text-zinc-500"><span>E: <span className="text-zinc-300">{t.entry}</span></span>{t.sl && <span>SL: <span className="text-red-400">{t.sl}</span></span>}{t.tp && <span>TP: <span className="text-emerald-400">{t.tp}</span></span>}{t.exitPrice && <span>X: <span className="text-zinc-300">{t.exitPrice}</span></span>}{t.rr && <span>R: <span className="text-amber-300">1:{t.rr}</span></span>}</div>
              {(t.setup || t.session) && <div className="mt-2 flex gap-2">{t.session && <span className="text-xs text-zinc-600">{t.session}</span>}{t.setup && <span className="text-xs text-zinc-500">· {t.setup}</span>}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
