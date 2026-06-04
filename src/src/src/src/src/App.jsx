import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";

const fmt = (n) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n || 0);

const EXPENSE_CATS = ["דיור", "מזון", "תחבורה", "בידור", "בריאות", "חינוך", "קניות", "עמלות", "אחר"];
const INCOME_CATS = ["משכורת", "פרילנס", "השקעות", "שכירות", "אחר"];

const ACCOUNT_COLORS = ["#00d4aa", "#44cc88", "#0099ff", "#f59e0b", "#a78bfa", "#fb7185"];
const CARD_COLORS = ["#f59e0b", "#fb7185", "#a78bfa", "#00d4aa"];

const TreeLogo = () => (
  <svg width="24" height="26" viewBox="0 0 26 28" fill="none">
    <path d="M13 2 C9 2, 3 7, 4 13 C5 17, 9 19, 9 19 L9 25 L17 25 L17 19 C17 19, 21 17, 22 13 C23 7, 17 2, 13 2Z" fill="#00d4aa"/>
    <path d="M13 2 C13 2, 17 7, 16 13 C15.5 17, 13 19, 13 19 L13 25" stroke="#0a2e12" strokeWidth="1.2" fill="none"/>
    <path d="M7 10 C9.5 8.5, 12 10, 13 12.5" stroke="#88ffcc" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <path d="M19 9 C16.5 7.5, 14 9, 13 11.5" stroke="#88ffcc" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <rect x="11" y="25" width="4" height="2.5" rx="1.2" fill="#00aa77"/>
  </svg>
);

const initialAccounts = [];


const initialTransactions = [];


export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [accounts, setAccounts] = useState(initialAccounts);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAddTx, setShowAddTx] = useState(false);
  const [newAccount, setNewAccount] = useState({ type: "bank", name: "", last4: "", color: "#00d4aa" });
  const [newTx, setNewTx] = useState({ accountId: "", type: "expense", amount: "", category: "מזון", desc: "", date: new Date().toISOString().split("T")[0] });
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState([{ role: "assistant", content: "שלום! אני היועץ הפיננסי שלך 🤖\nשאלי אותי כל שאלה על המצב הפיננסי שלך." }]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [aiMessages]);

  const banks = accounts.filter(a => a.type === "bank");
  const cards = accounts.filter(a => a.type === "card");
  const totalIncome = transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const balance = totalIncome - totalExpenses;
  const expByCat = transactions.filter(t => t.type === "expense").reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + t.amount; return acc; }, {});

  const txForAccount = (id) => transactions.filter(t => t.accountId === id);

  const addAccount = () => {
    if (!newAccount.name || !newAccount.last4) return;
    if (newAccount.id && accounts.find(a => a.id === newAccount.id)) {
      setAccounts(prev => prev.map(a => a.id === newAccount.id ? { ...a, name: newAccount.name, last4: newAccount.last4, color: newAccount.color } : a));
    } else {
      setAccounts(prev => [...prev, { ...newAccount, id: "acc" + Date.now(), balance: 0 }]);
    }
    setNewAccount({ type: "bank", name: "", last4: "", color: "#00d4aa" });
    setShowAddAccount(false);
  };

  const deleteAccount = (id) => {
    if (window.confirm("למחוק את החשבון וכל העסקאות שלו?")) {
      setAccounts(prev => prev.filter(a => a.id !== id));
      setTransactions(prev => prev.filter(t => t.accountId !== id));
    }
  };

  const editAccount = (acc) => {
    setNewAccount({ ...acc });
    setShowAddAccount(true);
  };

  const addTx = () => {
    if (!newTx.amount || !newTx.desc || !newTx.accountId) return;
    setTransactions(prev => [...prev, { ...newTx, id: Date.now(), amount: Number(newTx.amount) }]);
    setNewTx({ accountId: "", type: "expense", amount: "", category: "מזון", desc: "", date: new Date().toISOString().split("T")[0] });
    setShowAddTx(false);
  };

  const importExcel = (file, accountId) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        let imported = 0;
        const newTxs = [];
        const existingIds = new Set(transactions.map(t => t.importId).filter(Boolean));
        rows.forEach((row, i) => {
          if (i < 7) return;
          const dateStr = row[8];
          const desc = String(row[5] || "עסקה").trim().substring(0, 40);
          const credit = parseFloat(String(row[4] || "").replace(/,/g, "")) || 0;
          const debit = parseFloat(String(row[3] || "").replace(/,/g, "")) || 0;
          const ref = String(row[6] || "");
          if (!dateStr || (!credit && !debit)) return;
          const importId = `${dateStr}-${ref}-${credit}-${debit}`;
          if (existingIds.has(importId)) return;
          existingIds.add(importId);
          const amount = credit > 0 ? credit : debit;
          const isCommission = desc.includes("עמלת") || desc.includes("ע.ערוץ") || desc.includes("עמלות") || desc.includes("ע.החזר");
          const type = credit > 0 ? "income" : "expense";
          const category = isCommission ? "עמלות" : "אחר";
          const dateParts = String(dateStr).split("/");
          const dateFormatted = dateParts.length === 3 ? `${dateParts[2]}-${dateParts[1].padStart(2,"0")}-${dateParts[0].padStart(2,"0")}` : new Date().toISOString().split("T")[0];
          if (amount > 0) {
            newTxs.push({ id: Date.now() + i, importId, accountId, type, amount, category, desc, date: dateFormatted });
            imported++;
          }
        });
        // עדכן יתרה מהשורה האחרונה
        let lastBalance = null;
        for (let r = rows.length - 1; r >= 6; r--) {
          const bal = parseFloat(String(rows[r][1] || "").replace(/,/g, ""));
          if (!isNaN(bal) && bal !== 0) { lastBalance = bal; break; }
        }
        if (lastBalance !== null) {
          setAccounts(prev => prev.map(a => a.id === accountId ? { ...a, balance: lastBalance } : a));
        }
        setTransactions(prev => [...prev, ...newTxs]);
        setImportMsg(`✅ יובאו ${imported} עסקאות בהצלחה!`);
        setTimeout(() => setImportMsg(""), 4000);
      } catch(err) { setImportMsg("❌ שגיאה בקריאת הקובץ: " + err.message); setTimeout(() => setImportMsg(""), 5000); }
    };
    reader.readAsArrayBuffer(file);
  };

  const sendAI = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const msg = aiInput.trim(); setAiInput("");
    setAiMessages(prev => [...prev, { role: "user", content: msg }]); setAiLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          system: `אתה יועץ פיננסי ישראלי. ענה בעברית. נתונים: הכנסות=${fmt(totalIncome)}, הוצאות=${fmt(totalExpenses)}, מאזן=${fmt(balance)}, חשבונות=${accounts.map(a=>`${a.name} ****${a.last4}: ${fmt(a.balance)}`).join(", ")}`,
          messages: [...aiMessages.map(m => ({ role: m.role, content: m.content })), { role: "user", content: msg }]
        })
      });
      const json = await res.json();
      setAiMessages(prev => [...prev, { role: "assistant", content: json.content?.[0]?.text || "שגיאה" }]);
    } catch { setAiMessages(prev => [...prev, { role: "assistant", content: "שגיאה בחיבור." }]); }
    setAiLoading(false);
  };

  const S = {
    page: { fontFamily: "'Heebo',sans-serif", background: "#071209", minHeight: "100vh", color: "#e2e8f0", dir: "rtl" },
    card: { background: "#0d1f0d", borderRadius: 14, padding: 16, border: "1px solid #1a3a1a", marginBottom: 12 },
    input: { background: "#071209", border: "1px solid #1a3a1a", borderRadius: 10, padding: "10px 14px", color: "#e2e8f0", fontSize: 14, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" },
    btn: { background: "linear-gradient(135deg, #00d4aa, #44cc44)", border: "none", borderRadius: 10, padding: "11px 18px", color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 },
    btnGhost: { background: "#1a3a1a", border: "none", borderRadius: 10, padding: "11px 18px", color: "#94a3b8", cursor: "pointer", fontFamily: "inherit", fontSize: 13 },
  };

  return (
    <div dir="rtl" style={S.page}>
      <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;600;700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <header style={{ background: "#0d1f0d", borderBottom: "1px solid #1a3a1a", padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg,#0d2e18,#071a0a)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #00d4aa33" }}>
            <TreeLogo />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>My Finance</div>
            <div style={{ fontSize: 10, color: "#00aa66" }}>מנהל פיננסי משפחתי 🌿</div>
          </div>
        </div>
        <button onClick={() => setAiOpen(true)} style={{ background: "#00d4aa18", border: "1px solid #00d4aa44", borderRadius: 20, padding: "7px 14px", cursor: "pointer", color: "#00d4aa", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>🤖 יועץ AI</button>
      </header>

      {/* Tabs */}
      <nav style={{ display: "flex", background: "#0a1a0a", borderBottom: "1px solid #1a3a1a", overflowX: "auto" }}>
        {[{ id: "dashboard", label: "סקירה", icon: "📊" }, { id: "accounts", label: "חשבונות", icon: "🏦" }, { id: "cards", label: "כרטיסים", icon: "💳" }, { id: "transactions", label: "עסקאות", icon: "📋" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "12px 16px", border: "none", cursor: "pointer", background: "transparent", color: tab === t.id ? "#00d4aa" : "#64748b", borderBottom: tab === t.id ? "2px solid #00d4aa" : "2px solid transparent", fontWeight: tab === t.id ? 700 : 400, fontSize: 12, whiteSpace: "nowrap", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
            {t.icon} {t.label}
          </button>
        ))}
      </nav>

      {importMsg && (
        <div style={{ background: "#00d4aa22", border: "1px solid #00d4aa44", padding: "10px 18px", textAlign: "center", fontSize: 14, color: "#00d4aa" }}>{importMsg}</div>
      )}

      <main style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>

        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
              {[
                { label: "הכנסות", value: fmt(totalIncome), color: "#00d4aa", icon: "⬆️" },
                { label: "הוצאות", value: fmt(totalExpenses), color: "#ff6b6b", icon: "⬇️" },
                { label: "מאזן", value: fmt(balance), color: balance >= 0 ? "#00d4aa" : "#ff6b6b", icon: "💰" },
              ].map((c, i) => (
                <div key={i} style={{ ...S.card, marginBottom: 0 }}>
                  <div style={{ fontSize: 10, color: "#64748b", marginBottom: 5 }}>{c.icon} {c.label}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: c.color }}>{c.value}</div>
                </div>
              ))}
            </div>

            {/* Bank accounts summary */}
            <div style={S.card}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: "#00d4aa" }}>🏦 חשבונות בנק</div>
              {banks.map(acc => (
                <div key={acc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #142814" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: acc.color }} />
                    <span style={{ fontSize: 13 }}>{acc.name} <span style={{ color: "#64748b" }}>****{acc.last4}</span></span>
                  </div>
                  <span style={{ fontWeight: 700, color: acc.balance >= 0 ? "#00d4aa" : "#ff6b6b", fontSize: 14 }}>{fmt(acc.balance)}</span>
                </div>
              ))}
            </div>

            {/* Cards summary */}
            <div style={S.card}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: "#f59e0b" }}>💳 כרטיסי אשראי</div>
              {cards.map(acc => (
                <div key={acc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #142814" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: acc.color }} />
                    <span style={{ fontSize: 13 }}>{acc.name} <span style={{ color: "#64748b" }}>****{acc.last4}</span></span>
                  </div>
                  <span style={{ fontWeight: 700, color: "#ff6b6b", fontSize: 14 }}>{fmt(Math.abs(acc.balance))}</span>
                </div>
              ))}
            </div>

            {/* Expenses by category */}
            {Object.keys(expByCat).length > 0 && (
              <div style={S.card}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>🌿 הוצאות לפי קטגוריה</div>
                {Object.entries(expByCat).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                  <div key={cat} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                      <span>{cat}</span><span style={{ color: "#94a3b8" }}>{fmt(amt)}</span>
                    </div>
                    <div style={{ background: "#142814", borderRadius: 4, height: 6 }}>
                      <div style={{ width: `${Math.min((amt / totalExpenses) * 100, 100)}%`, height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#00d4aa,#44cc44)" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ACCOUNTS */}
        {tab === "accounts" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>🏦 חשבונות בנק</h2>
              <button onClick={() => { setNewAccount({ type: "bank", name: "", last4: "", color: "#00d4aa" }); setShowAddAccount(true); }} style={S.btn}>+ הוסף חשבון</button>
            </div>

            {showAddAccount && (
              <div style={{ ...S.card, border: "1px solid #00d4aa44" }}>
                <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>חשבון חדש</div>
                <div style={{ display: "grid", gap: 10 }}>
                  <input value={newAccount.name} onChange={e => setNewAccount(p => ({ ...p, name: e.target.value }))} placeholder='שם הבנק (למשל "בנק בינלאומי")' style={S.input} />
                  <input value={newAccount.last4} onChange={e => setNewAccount(p => ({ ...p, last4: e.target.value.slice(0, 4) }))} placeholder="4 ספרות אחרונות של החשבון" maxLength={4} style={S.input} />
                  <div>
                    <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>צבע</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {ACCOUNT_COLORS.map(c => (
                        <div key={c} onClick={() => setNewAccount(p => ({ ...p, color: c }))} style={{ width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer", border: newAccount.color === c ? "3px solid #fff" : "3px solid transparent" }} />
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={addAccount} style={{ ...S.btn, flex: 1 }}>שמור</button>
                    <button onClick={() => setShowAddAccount(false)} style={{ ...S.btnGhost, flex: 1 }}>ביטול</button>
                  </div>
                </div>
              </div>
            )}

            {banks.map(acc => {
              const accTxs = txForAccount(acc.id);
              const income = accTxs.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
              const expenses = accTxs.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
              return (
                <div key={acc.id} style={{ ...S.card, border: `1px solid ${acc.color}33` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: `${acc.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, border: `1px solid ${acc.color}44` }}>🏦</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{acc.name}</div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>****{acc.last4}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontSize: 11, color: "#64748b" }}>יתרה</div>
                      <div style={{ fontWeight: 800, fontSize: 18, color: acc.color }}>{fmt(income - expenses)}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    <div style={{ flex: 1, background: "#00d4aa11", borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ fontSize: 10, color: "#64748b" }}>הכנסות</div>
                      <div style={{ fontWeight: 700, color: "#00d4aa", fontSize: 14 }}>{fmt(income)}</div>
                    </div>
                    <div style={{ flex: 1, background: "#ff6b6b11", borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ fontSize: 10, color: "#64748b" }}>הוצאות</div>
                      <div style={{ fontWeight: 700, color: "#ff6b6b", fontSize: 14 }}>{fmt(expenses)}</div>
                    </div>
                  </div>

                  {/* Import Excel */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <button onClick={() => editAccount(acc)} style={{ ...S.btnGhost, flex: 1, fontSize: 12 }}>✏️ ערוך</button>
                    <button onClick={() => deleteAccount(acc.id)} style={{ flex: 1, background: "#ff6b6b22", border: "none", borderRadius: 10, padding: 11, color: "#ff6b6b", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>🗑️ מחק</button>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setNewTx(p => ({ ...p, accountId: acc.id })); setShowAddTx(true); }} style={{ ...S.btn, flex: 1, fontSize: 12 }}>+ עסקה ידנית</button>
                    <label style={{ ...S.btn, flex: 1, fontSize: 12, textAlign: "center", cursor: "pointer" }}>
                      📂 העלי אקסל
                      <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) importExcel(e.target.files[0], acc.id); }} />
                    </label>
                  </div>

                  {/* Recent transactions */}
                  {accTxs.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>עסקאות אחרונות</div>
                      {accTxs.slice(0, 3).map(t => (
                        <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderTop: "1px solid #142814", fontSize: 12 }}>
                          <span style={{ color: "#e2e8f0" }}>{t.desc}</span>
                          <span style={{ fontWeight: 700, color: t.type === "income" ? "#00d4aa" : "#ff6b6b" }}>{t.type === "income" ? "+" : "-"}{fmt(t.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* CARDS */}
        {tab === "cards" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>💳 כרטיסי אשראי</h2>
              <button onClick={() => { setNewAccount({ type: "card", name: "", last4: "", color: "#f59e0b" }); setShowAddAccount(true); }} style={S.btn}>+ הוסף כרטיס</button>
            </div>

            {showAddAccount && newAccount.type === "card" && (
              <div style={{ ...S.card, border: "1px solid #f59e0b44" }}>
                <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>כרטיס חדש</div>
                <div style={{ display: "grid", gap: 10 }}>
                  <input value={newAccount.name} onChange={e => setNewAccount(p => ({ ...p, name: e.target.value }))} placeholder='שם הכרטיס (למשל "ויזה כ.א.ל")' style={S.input} />
                  <input value={newAccount.last4} onChange={e => setNewAccount(p => ({ ...p, last4: e.target.value.slice(0, 4) }))} placeholder="4 ספרות אחרונות של הכרטיס" maxLength={4} style={S.input} />
                  <div>
                    <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>צבע</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {CARD_COLORS.map(c => (
                        <div key={c} onClick={() => setNewAccount(p => ({ ...p, color: c }))} style={{ width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer", border: newAccount.color === c ? "3px solid #fff" : "3px solid transparent" }} />
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={addAccount} style={{ ...S.btn, flex: 1 }}>שמור</button>
                    <button onClick={() => setShowAddAccount(false)} style={{ ...S.btnGhost, flex: 1 }}>ביטול</button>
                  </div>
                </div>
              </div>
            )}

            {cards.map(acc => {
              const accTxs = txForAccount(acc.id);
              const total = accTxs.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
              return (
                <div key={acc.id} style={{ ...S.card, border: `1px solid ${acc.color}33` }}>
                  {/* Card visual */}
                  <div style={{ background: `linear-gradient(135deg, ${acc.color}33, ${acc.color}11)`, borderRadius: 12, padding: "16px 20px", marginBottom: 14, border: `1px solid ${acc.color}33` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>{acc.name}</div>
                        <div style={{ fontSize: 18, letterSpacing: 4, fontWeight: 700 }}>**** **** **** {acc.last4}</div>
                      </div>
                      <div style={{ fontSize: 22 }}>💳</div>
                    </div>
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>חיוב החודש</div>
                      <div style={{ fontWeight: 800, fontSize: 22, color: acc.color }}>{fmt(total)}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <button onClick={() => editAccount(acc)} style={{ ...S.btnGhost, flex: 1, fontSize: 12 }}>✏️ ערוך</button>
                    <button onClick={() => deleteAccount(acc.id)} style={{ flex: 1, background: "#ff6b6b22", border: "none", borderRadius: 10, padding: 11, color: "#ff6b6b", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>🗑️ מחק</button>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setNewTx(p => ({ ...p, accountId: acc.id, type: "expense" })); setShowAddTx(true); }} style={{ ...S.btn, flex: 1, fontSize: 12 }}>+ עסקה ידנית</button>
                    <label style={{ ...S.btn, flex: 1, fontSize: 12, textAlign: "center", cursor: "pointer" }}>
                      📂 העלי אקסל
                      <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) importExcel(e.target.files[0], acc.id); }} />
                    </label>
                  </div>

                  {accTxs.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>עסקאות אחרונות</div>
                      {accTxs.slice(0, 3).map(t => (
                        <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderTop: "1px solid #142814", fontSize: 12 }}>
                          <span>{t.desc}</span>
                          <span style={{ fontWeight: 700, color: "#ff6b6b" }}>-{fmt(t.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* TRANSACTIONS */}
        {tab === "transactions" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>📋 כל העסקאות</h2>
              <button onClick={() => setShowAddTx(true)} style={S.btn}>+ הוסף</button>
            </div>

            {showAddTx && (
              <div style={{ ...S.card, border: "1px solid #00d4aa44" }}>
                <div style={{ display: "grid", gap: 10 }}>
                  <select value={newTx.accountId} onChange={e => setNewTx(p => ({ ...p, accountId: e.target.value }))} style={S.input}>
                    <option value="">בחרי חשבון / כרטיס</option>
                    <optgroup label="חשבונות בנק">{banks.map(a => <option key={a.id} value={a.id}>{a.name} ****{a.last4}</option>)}</optgroup>
                    <optgroup label="כרטיסי אשראי">{cards.map(a => <option key={a.id} value={a.id}>{a.name} ****{a.last4}</option>)}</optgroup>
                  </select>
                  <div style={{ display: "flex", gap: 8 }}>
                    {["income", "expense"].map(type => (
                      <button key={type} onClick={() => setNewTx(p => ({ ...p, type }))} style={{ flex: 1, padding: 10, border: "2px solid", borderColor: newTx.type === type ? (type === "income" ? "#00d4aa" : "#ff6b6b") : "#1a3a1a", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 13, background: newTx.type === type ? (type === "income" ? "#00d4aa22" : "#ff6b6b22") : "transparent", color: newTx.type === type ? (type === "income" ? "#00d4aa" : "#ff6b6b") : "#94a3b8" }}>
                        {type === "income" ? "💚 הכנסה" : "🔴 הוצאה"}
                      </button>
                    ))}
                  </div>
                  <input value={newTx.amount} onChange={e => setNewTx(p => ({ ...p, amount: e.target.value }))} placeholder="סכום (₪)" type="number" style={S.input} />
                  <input value={newTx.desc} onChange={e => setNewTx(p => ({ ...p, desc: e.target.value }))} placeholder="תיאור" style={S.input} />
                  <select value={newTx.category} onChange={e => setNewTx(p => ({ ...p, category: e.target.value }))} style={S.input}>
                    {(newTx.type === "income" ? INCOME_CATS : EXPENSE_CATS).map(c => <option key={c}>{c}</option>)}
                  </select>
                  <input type="date" value={newTx.date} onChange={e => setNewTx(p => ({ ...p, date: e.target.value }))} style={S.input} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={addTx} style={{ ...S.btn, flex: 1 }}>שמור</button>
                    <button onClick={() => setShowAddTx(false)} style={{ ...S.btnGhost, flex: 1 }}>ביטול</button>
                  </div>
                </div>
              </div>
            )}

            {transactions.slice().reverse().map(t => {
              const acc = accounts.find(a => a.id === t.accountId);
              return (
                <div key={t.id} style={{ ...S.card, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: t.type === "income" ? "#00d4aa18" : "#ff6b6b18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                      {t.type === "income" ? "💚" : "🔴"}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{t.desc}</div>
                      <div style={{ fontSize: 10, color: "#64748b" }}>
                        {t.category} · {t.date}
                        {acc && <span style={{ color: acc.color }}> · ****{acc.last4}</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: t.type === "income" ? "#00d4aa" : "#ff6b6b" }}>
                    {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* AI Chat */}
      {aiOpen && (
        <div style={{ position: "fixed", inset: 0, background: "#000b", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={e => e.target === e.currentTarget && setAiOpen(false)}>
          <div style={{ background: "#0d1f0d", width: "100%", maxWidth: 600, borderRadius: "20px 20px 0 0", border: "1px solid #1a3a1a", height: "75vh", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "13px 18px", borderBottom: "1px solid #1a3a1a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20 }}>🤖</span>
                <div><div style={{ fontWeight: 700, fontSize: 14 }}>יועץ AI פיננסי</div><div style={{ fontSize: 10, color: "#00d4aa" }}>● מחובר לנתונים שלך</div></div>
              </div>
              <button onClick={() => setAiOpen(false)} style={{ background: "#1a3a1a", border: "none", borderRadius: 8, padding: "5px 10px", color: "#94a3b8", cursor: "pointer", fontFamily: "inherit" }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              {aiMessages.map((msg, i) => (
                <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-start" : "flex-end" }}>
                  <div style={{ maxWidth: "80%", padding: "10px 14px", borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: msg.role === "user" ? "#1a3a1a" : "#00d4aa18", border: msg.role === "user" ? "1px solid #1f4020" : "1px solid #00d4aa33", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{msg.content}</div>
                </div>
              ))}
              {aiLoading && <div style={{ display: "flex", justifyContent: "flex-end" }}><div style={{ padding: "10px 14px", background: "#00d4aa18", border: "1px solid #00d4aa33", borderRadius: "16px 16px 16px 4px", fontSize: 13 }}>⏳ חושב...</div></div>}
              <div ref={chatEndRef} />
            </div>
            <div style={{ padding: 14, borderTop: "1px solid #1a3a1a", display: "flex", gap: 8 }}>
              <input value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendAI()} placeholder="שאלי אותי על הכספים שלך..." style={{ ...S.input, flex: 1 }} />
              <button onClick={sendAI} disabled={aiLoading} style={{ background: aiLoading ? "#1a3a1a" : "linear-gradient(135deg,#00d4aa,#44cc44)", border: "none", borderRadius: 10, padding: "10px 14px", cursor: "pointer", color: "#fff", fontWeight: 700, fontFamily: "inherit" }}>➤</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
