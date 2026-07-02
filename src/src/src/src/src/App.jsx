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
    <path d="M13 2 C13 2, 17 7, 16 13 C15.5 17, 13 19, 13 19 L13 25" stroke="#2d6a2d" strokeWidth="1.2" fill="none"/>
    <path d="M7 10 C9.5 8.5, 12 10, 13 12.5" stroke="#88ffcc" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <path d="M19 9 C16.5 7.5, 14 9, 13 11.5" stroke="#88ffcc" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <rect x="11" y="25" width="4" height="2.5" rx="1.2" fill="#00aa77"/>
  </svg>
);

const initialAccounts = [];


const initialTransactions = [];


export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [accounts, setAccounts] = useState(() => {
    try { const s = localStorage.getItem("mf_accounts"); return s ? JSON.parse(s) : initialAccounts; } catch { return initialAccounts; }
  });
  const [transactions, setTransactions] = useState(() => {
    try { const s = localStorage.getItem("mf_transactions"); return s ? JSON.parse(s) : initialTransactions; } catch { return initialTransactions; }
  });
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAddTx, setShowAddTx] = useState(false);
  const [newAccount, setNewAccount] = useState({ type: "bank", name: "", last4: "", color: "#00d4aa", bankId: "" });
  const [newTx, setNewTx] = useState({ accountId: "", type: "expense", amount: "", category: "מזון", desc: "", date: new Date().toISOString().split("T")[0] });
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState([{ role: "assistant", content: "שלום! אני היועץ הפיננסי שלך 🤖\nשאלי אותי כל שאלה על המצב הפיננסי שלך." }]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [selectedBankMonth, setSelectedBankMonth] = useState("all");
  const [selectedCardMonths, setSelectedCardMonths] = useState({});
  const setCardMonth = (cardId, month) => setSelectedCardMonths(prev => ({ ...prev, [cardId]: month }));
  const [cardNav, setCardNav] = useState({ bankId: null, cardId: null, month: null });
  const [pendingFile, setPendingFile] = useState(null);
  const [billingMonthInput, setBillingMonthInput] = useState(new Date().toISOString().substring(0,7));
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [aiMessages]);
  useEffect(() => { try { localStorage.setItem("mf_accounts", JSON.stringify(accounts)); } catch {} }, [accounts]);
  useEffect(() => { try { localStorage.setItem("mf_transactions", JSON.stringify(transactions)); } catch {} }, [transactions]);

  const banks = accounts.filter(a => a.type === "bank");
  const cards = accounts.filter(a => a.type === "card");
  const bankIds = new Set(accounts.filter(a => a.type === "bank").map(a => a.id));
  const totalIncome = transactions.filter(t => t.type === "income" && bankIds.has(t.accountId)).reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions.filter(t => t.type === "expense" && bankIds.has(t.accountId)).reduce((s, t) => s + t.amount, 0);
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
    if (acc.type === "card") {
      setCardNav({ bankId: acc.bankId || "unlinked", cardId: null, month: null });
    }
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
        const wb = XLSX.read(e.target.result, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        let imported = 0;
        const newTxs = [];
        const existingIds = new Set(transactions.map(t => t.importId).filter(Boolean));
        // זיהוי פורמט
        const isKal = rows.some(r => Array.isArray(r) && r[1] && String(r[1]).trim() === "שם בית עסק");

        rows.forEach((row, i) => {
          if (!isKal) {
            // פורמט בנק בינלאומי
            if (i < 7) return;
            const dateStr = row[8];
            const desc = String(row[5] || "עסקה").trim().substring(0, 40);
            const credit = parseFloat(String(row[3] || "").replace(/,/g, "")) || 0;
            const debit = parseFloat(String(row[4] || "").replace(/,/g, "")) || 0;
            const ref = String(row[6] || "");
            if (!dateStr || (!credit && !debit)) return;
            const importId = dateStr + "-" + ref + "-" + credit + "-" + debit;
            if (existingIds.has(importId)) return;
            existingIds.add(importId);
            const amount = credit > 0 ? credit : debit;
            const isCommission = desc.includes("עמלת") || desc.includes("ע.ערוץ") || desc.includes("עמלות");
            const type = credit > 0 ? "income" : "expense";
            const category = isCommission ? "עמלות" : "אחר";
            const dateParts = String(dateStr).split("/");
            const dateFormatted = dateParts.length === 3 ? dateParts[2] + "-" + dateParts[1].padStart(2,"0") + "-" + dateParts[0].padStart(2,"0") : new Date().toISOString().split("T")[0];
            if (amount > 0) {
              newTxs.push({ id: Date.now() + i, importId, accountId, type, amount, category, desc, date: dateFormatted });
              imported++;
            }
          } else {
            // פורמט כ.א.ל
            if (i < 4) return;
            const desc = String(row[1] || "").trim().substring(0, 40);
            if (!desc || String(desc).trim() === "שם בית עסק" || !row[1]) return;
            const amount = parseFloat(String(row[3] || row[2] || "0").toString().replace(/[^0-9.]/g, "")) || 0;
            if (!amount || amount <= 0) return;
            const ענף = String(row[5] || "אחר").trim();
            const catMap = { "מזון ומשקאות": "מזון", "מסעדות": "מזון", "אנרגיה": "תחבורה", "ריהוט ובית": "קניות", "פנאי בילוי": "בידור", "ביטוח ופיננסים": "אחר", "תקשורת ומחשבים": "אחר", "חינוך": "חינוך", "בריאות": "בריאות", "שונות": "אחר" };
            const category = catMap[ענף] || "קניות";
            const dateRaw = row[0];
            let dateFormatted = new Date().toISOString().split("T")[0];
            if (dateRaw instanceof Date) {
              dateFormatted = dateRaw.getFullYear() + "-" + String(dateRaw.getMonth()+1).padStart(2,"0") + "-" + String(dateRaw.getDate()).padStart(2,"0");
            } else if (typeof dateRaw === "number" && dateRaw > 40000) {
              const d = new Date((dateRaw - 25569) * 86400 * 1000);
              dateFormatted = d.getUTCFullYear() + "-" + String(d.getUTCMonth()+1).padStart(2,"0") + "-" + String(d.getUTCDate()).padStart(2,"0");
            }
            const importId = "kal-" + dateFormatted + "-" + desc + "-" + amount;
            if (existingIds.has(importId)) return;
            existingIds.add(importId);
            newTxs.push({ id: Date.now() + i, importId, accountId, type: "expense", amount, category, desc, date: dateFormatted });
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

  const importExcelWithMonth = (file, accountId, billingMonth) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        let imported = 0;
        const newTxs = [];
        const existingIds = new Set(transactions.map(t => t.importId).filter(Boolean));
        const isKal = rows.some(r => Array.isArray(r) && r[1] && String(r[1]).trim() === "שם בית עסק");
        rows.forEach((row, i) => {
          if (i < 4) return;
          const desc = String(row[1] || "").trim().substring(0, 40);
          if (!desc || String(desc).trim() === "שם בית עסק" || !row[1]) return;
          const amount = parseFloat(String(row[3] || row[2] || "0").toString().replace(/[^0-9.]/g, "")) || 0;
          if (!amount || amount <= 0) return;
          const ענף = String(row[5] || "אחר").trim();
          const catMap = { "מזון ומשקאות": "מזון", "מסעדות": "מזון", "אנרגיה": "תחבורה", "ריהוט ובית": "קניות", "פנאי בילוי": "בידור", "ביטוח ופיננסים": "אחר", "תקשורת ומחשבים": "אחר", "חינוך": "חינוך", "בריאות": "בריאות", "שונות": "אחר" };
          const category = catMap[ענף] || "קניות";
          const dateRaw = row[0];
          let dateFormatted = new Date().toISOString().split("T")[0];
          if (dateRaw instanceof Date) {
            dateFormatted = dateRaw.getFullYear() + "-" + String(dateRaw.getMonth()+1).padStart(2,"0") + "-" + String(dateRaw.getDate()).padStart(2,"0");
          } else if (typeof dateRaw === "number" && dateRaw > 40000) {
            const d = new Date((dateRaw - 25569) * 86400 * 1000);
            dateFormatted = d.getUTCFullYear() + "-" + String(d.getUTCMonth()+1).padStart(2,"0") + "-" + String(d.getUTCDate()).padStart(2,"0");
          }
          const importId = "kal-" + billingMonth + "-" + desc + "-" + amount;
          if (existingIds.has(importId)) return;
          existingIds.add(importId);
          newTxs.push({ id: Date.now() + i, importId, accountId, type: "expense", amount, category, desc, date: dateFormatted, billingMonth });
          imported++;
        });
        setTransactions(prev => [...prev.filter(t => !(t.accountId === accountId && t.billingMonth === billingMonth)), ...newTxs]);
        setImportMsg("✅ יובאו " + imported + " עסקאות לחודש " + billingMonth);
        setTimeout(() => setImportMsg(""), 4000);
      } catch(err) { setImportMsg("❌ שגיאה: " + err.message); setTimeout(() => setImportMsg(""), 5000); }
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
    page: { fontFamily: "'Heebo',sans-serif", background: "#f5f7f5", minHeight: "100vh", color: "#1a2e1a" },
    card: { background: "#ffffff", borderRadius: 16, padding: 18, border: "1px solid #e0ece0", marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
    input: { background: "#f5f7f5", border: "1px solid #d0e4d0", borderRadius: 8, padding: "9px 12px", color: "#1a2e1a", fontSize: 14, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" },
    btn: { background: "linear-gradient(135deg, #00d4aa, #00b894)", border: "none", borderRadius: 8, padding: "8px 14px", color: "#fff", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", fontSize: 12 },
    btnSm: { background: "#f0f9f6", border: "1px solid #00d4aa55", borderRadius: 6, padding: "5px 10px", color: "#00b894", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", fontSize: 11 },
    btnDanger: { background: "#fff5f5", border: "1px solid #ffb3b3", borderRadius: 6, padding: "5px 10px", color: "#ff6b6b", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", fontSize: 11 },
    btnGhost: { background: "#f0f4f0", border: "1px solid #d0e4d0", borderRadius: 8, padding: "8px 14px", color: "#6b7280", cursor: "pointer", fontFamily: "inherit", fontSize: 12 },
    select: { background: "#f5f7f5", border: "1px solid #d0e4d0", borderRadius: 8, padding: "7px 12px", color: "#1a2e1a", fontSize: 12, fontFamily: "inherit", cursor: "pointer" },
  };

  return (
    <div dir="rtl" style={S.page}>
      <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;600;700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <header style={{ background: "#ffffff", borderBottom: "1px solid #1a3a1a", padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg,#0d2e18,#071a0a)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #00d4aa33" }}>
            <TreeLogo />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>My Finance</div>
            <div style={{ fontSize: 10, color: "#00aa66" }}>מנהל פיננסי משפחתי 🌿</div>
          </div>
        </div>
        <button onClick={() => setAiOpen(true)} style={{ background: "#e6faf6", border: "1px solid #00d4aa44", borderRadius: 20, padding: "7px 14px", cursor: "pointer", color: "#00d4aa", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>🤖 יועץ AI</button>
      </header>

      {/* Tabs */}
      <nav style={{ display: "flex", background: "#f0f5f0", borderBottom: "1px solid #1a3a1a", overflowX: "auto" }}>
        {[{ id: "dashboard", label: "סקירה", icon: "📊" }, { id: "accounts", label: "חשבונות", icon: "🏦" }, { id: "cards", label: "כרטיסים", icon: "💳" }, { id: "transactions", label: "עסקאות", icon: "📋" }, { id: "monthly", label: "חודשי", icon: "📅" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "12px 16px", border: "none", cursor: "pointer", background: "transparent", color: tab === t.id ? "#00d4aa" : "#6b7280", borderBottom: tab === t.id ? "2px solid #00d4aa" : "2px solid transparent", fontWeight: tab === t.id ? 700 : 400, fontSize: 12, whiteSpace: "nowrap", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
            {t.icon} {t.label}
          </button>
        ))}
      </nav>

      {importMsg && (
        <div style={{ background: "#d4f5ee", border: "1px solid #00d4aa44", padding: "10px 18px", textAlign: "center", fontSize: 14, color: "#00d4aa" }}>{importMsg}</div>
      )}

      <main style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>

        {/* DASHBOARD */}
        {tab === "dashboard" && (() => {
          const monthNames = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
          const bankTxs = transactions.filter(t => banks.some(b => b.id === t.accountId));
          const monthlyBank = {};
          bankTxs.forEach(t => {
            if (!t.date) return;
            const d = new Date(t.date);
            const key = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0");
            if (!monthlyBank[key]) monthlyBank[key] = { income: 0, expense: 0, month: d.getMonth(), year: d.getFullYear() };
            if (t.type === "income") monthlyBank[key].income += t.amount;
            else monthlyBank[key].expense += t.amount;
          });
          const sortedMonths = Object.entries(monthlyBank).sort((a,b) => b[0].localeCompare(a[0]));
          const totalBankBalance = banks.reduce((s,a) => s + (a.balance||0), 0);
          return (
          <div>
            {/* יתרה גדולה */}
            <div style={{ ...S.card, background: "linear-gradient(135deg, #00d4aa15, #00b89410)", marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>🏦 יתרה כוללת בחשבונות</div>
              <div style={{ fontSize: 36, fontWeight: 900, color: totalBankBalance >= 0 ? "#00b894" : "#ff6b6b", letterSpacing: "-1px" }}>{fmt(totalBankBalance)}</div>
              <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
                <div><div style={{ fontSize: 10, color: "#6b7280" }}>⬆️ סה"כ הכנסות</div><div style={{ fontWeight: 700, color: "#00b894", fontSize: 13 }}>{fmt(totalIncome)}</div></div>
                <div><div style={{ fontSize: 10, color: "#6b7280" }}>⬇️ סה"כ הוצאות</div><div style={{ fontWeight: 700, color: "#ff6b6b", fontSize: 13 }}>{fmt(totalExpenses)}</div></div>
              </div>
            </div>

            {/* חשבונות */}
            <div style={S.card}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: "#00b894" }}>🏦 חשבונות בנק</div>
              {banks.map(acc => (
                <div key={acc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #e8f0e8" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: acc.color }} />
                    <span style={{ fontSize: 13 }}>{acc.name} <span style={{ color: "#6b7280", fontSize: 11 }}>****{acc.last4}</span></span>
                  </div>
                  <span style={{ fontWeight: 700, color: acc.balance >= 0 ? "#00b894" : "#ff6b6b", fontSize: 15 }}>{fmt(acc.balance)}</span>
                </div>
              ))}
            </div>

            {/* כרטיסים */}
            <div style={S.card}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: "#f59e0b" }}>💳 כרטיסי אשראי</div>
              {cards.map(acc => {
                const cardTotal = transactions.filter(t => t.accountId === acc.id && t.type === "expense").reduce((s,t) => s+t.amount, 0);
                return (
                  <div key={acc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #e8f0e8" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: acc.color }} />
                      <span style={{ fontSize: 13 }}>{acc.name} <span style={{ color: "#6b7280", fontSize: 11 }}>****{acc.last4}</span></span>
                    </div>
                    <span style={{ fontWeight: 700, color: "#ff6b6b", fontSize: 15 }}>{fmt(cardTotal)}</span>
                  </div>
                );
              })}
            </div>

            {/* פירוט חודשי */}
            {sortedMonths.length > 0 && (
              <div style={S.card}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>📅 פירוט חודשי — חשבונות בנק</div>
                {sortedMonths.map(([key, data]) => {
                  const bal = data.income - data.expense;
                  return (
                    <div key={key} style={{ padding: "10px 0", borderBottom: "1px solid #e8f0e8" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{monthNames[data.month]} {data.year}</span>
                        <span style={{ fontWeight: 800, fontSize: 14, color: bal >= 0 ? "#00b894" : "#ff6b6b" }}>{fmt(bal)}</span>
                      </div>
                      <div style={{ display: "flex", gap: 12 }}>
                        <span style={{ fontSize: 11, color: "#00b894" }}>⬆️ {fmt(data.income)}</span>
                        <span style={{ fontSize: 11, color: "#ff6b6b" }}>⬇️ {fmt(data.expense)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Expenses by category */}
            {Object.keys(expByCat).length > 0 && (
              <div style={S.card}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>🌿 הוצאות לפי קטגוריה</div>
                {Object.entries(expByCat).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                  <div key={cat} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                      <span>{cat}</span><span style={{ color: "#9ca3af" }}>{fmt(amt)}</span>
                    </div>
                    <div style={{ background: "#e8f0e8", borderRadius: 4, height: 6 }}>
                      <div style={{ width: `${Math.min((amt / totalExpenses) * 100, 100)}%`, height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#00d4aa,#44cc44)" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          );
        })()}

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
                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>צבע</div>
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
                        <div style={{ fontSize: 12, color: "#6b7280" }}>****{acc.last4}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>יתרה</div>
                      <div style={{ fontWeight: 800, fontSize: 18, color: acc.color }}>{fmt(acc.balance)}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    <div style={{ flex: 1, background: "#00d4aa11", borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ fontSize: 10, color: "#6b7280" }}>הכנסות</div>
                      <div style={{ fontWeight: 700, color: "#00d4aa", fontSize: 14 }}>{fmt(income)}</div>
                    </div>
                    <div style={{ flex: 1, background: "#ff6b6b11", borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ fontSize: 10, color: "#6b7280" }}>הוצאות</div>
                      <div style={{ fontWeight: 700, color: "#ff6b6b", fontSize: 14 }}>{fmt(expenses)}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    <button onClick={() => editAccount(acc)} style={S.btnSm}>✏️ ערוך</button>
                    <button onClick={() => deleteAccount(acc.id)} style={S.btnDanger}>🗑️ מחק</button>
                    <button onClick={() => { setNewTx(p => ({ ...p, accountId: acc.id })); setShowAddTx(true); }} style={S.btnSm}>+ עסקה</button>
                    <label style={{ ...S.btnSm, cursor: "pointer" }}>📂 Excel<input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) importExcel(e.target.files[0], acc.id); }} /></label>
                  </div>

                  {/* Recent transactions */}
                  {accTxs.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>עסקאות אחרונות</div>
                      {accTxs.slice(0, 3).map(t => (
                        <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderTop: "1px solid #142814", fontSize: 12 }}>
                          <span style={{ color: "#1a2e1a" }}>{t.desc}</span>
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
        {tab === "cards" && (() => {
          const monthNames = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

          // Level 1: בחר חשבון בנק
          if (!cardNav.bankId) {
            return (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>💳 כרטיסי אשראי</h2>
                  <button onClick={() => { setNewAccount({ type: "card", name: "", last4: "", color: "#f59e0b", bankId: "" }); setShowAddAccount(true); }} style={S.btn}>+ הוסף כרטיס</button>
                </div>

                {showAddAccount && newAccount.type === "card" && (
                  <div style={{ ...S.card, border: "1px solid #f59e0b44", marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>כרטיס חדש</div>
                    <div style={{ display: "grid", gap: 10 }}>
                      <input value={newAccount.name} onChange={e => setNewAccount(p => ({ ...p, name: e.target.value }))} placeholder="שם הכרטיס" style={S.input} />
                      <input value={newAccount.last4} onChange={e => setNewAccount(p => ({ ...p, last4: e.target.value.slice(0,4) }))} placeholder="4 ספרות אחרונות" maxLength={4} style={S.input} />
                      <select value={newAccount.bankId || ""} onChange={e => setNewAccount(p => ({ ...p, bankId: e.target.value }))} style={S.input}>
                        <option value="">בחר חשבון בנק משויך</option>
                        {banks.map(b => <option key={b.id} value={b.id}>{b.name} ****{b.last4}</option>)}
                      </select>
                      <div style={{ display: "flex", gap: 8 }}>
                        {CARD_COLORS.map(c => <div key={c} onClick={() => setNewAccount(p => ({ ...p, color: c }))} style={{ width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer", border: newAccount.color === c ? "3px solid #333" : "3px solid transparent" }} />)}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={addAccount} style={{ ...S.btn, flex: 1 }}>שמור</button>
                        <button onClick={() => setShowAddAccount(false)} style={{ ...S.btnGhost, flex: 1 }}>ביטול</button>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>בחר חשבון בנק:</div>
                {banks.map(bank => {
                  const bankCards = cards.filter(c => c.bankId === bank.id);
                  return (
                    <div key={bank.id} onClick={() => setCardNav({ bankId: bank.id, cardId: null, month: null })} style={{ ...S.card, cursor: "pointer", border: `1px solid ${bank.color}44`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: bank.color }} />
                        <div>
                          <div style={{ fontWeight: 700 }}>{bank.name} ****{bank.last4}</div>
                          <div style={{ fontSize: 11, color: "#9ca3af" }}>{bankCards.length} כרטיסים</div>
                        </div>
                      </div>
                      <span style={{ color: "#9ca3af", fontSize: 18 }}>›</span>
                    </div>
                  );
                })}
                {banks.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>הוסף חשבון בנק תחילה</div>}
                {cards.filter(c => !c.bankId).length > 0 && (
                  <div onClick={() => setCardNav({ bankId: "unlinked", cardId: null, month: null })} style={{ ...S.card, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 700 }}>כרטיסים ללא חשבון</div>
                    <span style={{ color: "#9ca3af", fontSize: 18 }}>›</span>
                  </div>
                )}
              </div>
            );
          }

          // Level 2: בחר כרטיס
          const currentBank = cardNav.bankId === "unlinked" ? null : banks.find(b => b.id === cardNav.bankId);
          const currentBankCards = cardNav.bankId === "unlinked" ? cards.filter(c => !c.bankId) : cards.filter(c => c.bankId === cardNav.bankId);

          if (!cardNav.cardId) {
            return (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <button onClick={() => setCardNav({ bankId: null, cardId: null, month: null })} style={{ ...S.btnSm, fontSize: 14 }}>‹</button>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{currentBank ? `${currentBank.name} ****${currentBank.last4}` : "כרטיסים ללא חשבון"}</h2>
                </div>
                {currentBankCards.map(card => {
                  const cardTxs = transactions.filter(t => t.accountId === card.id);
                  const months = [...new Set(cardTxs.map(t => t.billingMonth || t.date?.substring(0,7)).filter(Boolean))].sort().reverse();
                  return (
                    <div key={card.id} onClick={() => setCardNav(p => ({ ...p, cardId: card.id }))} style={{ ...S.card, cursor: "pointer", border: `1px solid ${card.color}44`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: card.color }} />
                        <div>
                          <div style={{ fontWeight: 700 }}>{card.name} ****{card.last4}</div>
                          <div style={{ fontSize: 11, color: "#9ca3af" }}>{months.length} חודשים · {cardTxs.length} עסקאות</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button onClick={e => { e.stopPropagation(); editAccount(card); }} style={S.btnSm}>✏️</button>
                        <button onClick={e => { e.stopPropagation(); deleteAccount(card.id); }} style={S.btnDanger}>🗑️</button>
                        <span style={{ color: "#9ca3af", fontSize: 18 }}>›</span>
                      </div>
                    </div>
                  );
                })}
                {currentBankCards.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>אין כרטיסים — הוסף כרטיס</div>}
              </div>
            );
          }

          // Level 3: בחר חודש
          const currentCard = cards.find(c => c.id === cardNav.cardId);
          const cardAllTxs = transactions.filter(t => t.accountId === cardNav.cardId);
          const availableMonths = [...new Set(cardAllTxs.map(t => t.billingMonth || t.date?.substring(0,7)).filter(Boolean))].sort().reverse();

          if (!cardNav.month) {
            return (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <button onClick={() => setCardNav(p => ({ ...p, cardId: null, month: null }))} style={{ ...S.btnSm, fontSize: 14 }}>‹</button>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{currentCard?.name} ****{currentCard?.last4}</h2>
                </div>
                <label style={{ ...S.btn, display: "inline-block", cursor: "pointer", marginBottom: 14 }}>
                  📂 העלי קובץ Excel
                  <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={e => {
                    if (!e.target.files[0]) return;
                    setPendingFile(e.target.files[0]);
                    setBillingMonthInput(new Date().toISOString().substring(0,7));
                    setShowMonthPicker(true);
                  }} />
                </label>
                {availableMonths.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>אין נתונים עדיין — העלי קובץ Excel</div>}
                {availableMonths.map(m => {
                  const mTxs = cardAllTxs.filter(t => (t.billingMonth || t.date?.substring(0,7)) === m);
                  const total = mTxs.reduce((s,t) => s+t.amount, 0);
                  const [y, mo] = m.split("-");
                  return (
                    <div key={m} onClick={() => setCardNav(p => ({ ...p, month: m }))} style={{ ...S.card, cursor: "pointer", border: `1px solid ${currentCard?.color}33`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{monthNames[parseInt(mo)-1]} {y}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>{mTxs.length} עסקאות</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 800, color: "#ff6b6b", fontSize: 16 }}>{fmt(total)}</span>
                        <span style={{ color: "#9ca3af", fontSize: 18 }}>›</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          }

          // Level 4: דשבורד חודשי
          const [y, mo] = cardNav.month.split("-");
          const monthTxs = cardAllTxs.filter(t => (t.billingMonth || t.date?.substring(0,7)) === cardNav.month);
          const monthTotal = monthTxs.reduce((s,t) => s+t.amount, 0);
          const catBreakdown = monthTxs.reduce((acc2, t) => { acc2[t.category] = (acc2[t.category]||0) + t.amount; return acc2; }, {});

          return (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <button onClick={() => setCardNav(p => ({ ...p, month: null }))} style={{ ...S.btnSm, fontSize: 14 }}>‹</button>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{monthNames[parseInt(mo)-1]} {y} — {currentCard?.name}</h2>
              </div>

              {/* סיכום */}
              <div style={{ ...S.card, background: `linear-gradient(135deg, ${currentCard?.color}15, ${currentCard?.color}05)`, border: `1px solid ${currentCard?.color}33`, marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>סה״כ חיוב {monthNames[parseInt(mo)-1]}</div>
                <div style={{ fontSize: 34, fontWeight: 900, color: "#ff6b6b" }}>{fmt(monthTotal)}</div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>{monthTxs.length} עסקאות</div>
              </div>

              {/* פילוח קטגוריות */}
              {Object.keys(catBreakdown).length > 0 && (
                <div style={S.card}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>פילוח לפי קטגוריה</div>
                  {Object.entries(catBreakdown).sort((a,b) => b[1]-a[1]).map(([cat, amt]) => (
                    <div key={cat} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                        <span style={{ fontWeight: 500 }}>{cat}</span>
                        <span style={{ fontWeight: 600, color: "#ff6b6b" }}>{fmt(amt)} <span style={{ color: "#9ca3af", fontSize: 11 }}>({Math.round(amt/monthTotal*100)}%)</span></span>
                      </div>
                      <div style={{ background: "#f0f0f0", borderRadius: 4, height: 6 }}>
                        <div style={{ width: `${Math.round(amt/monthTotal*100)}%`, height: "100%", borderRadius: 4, background: currentCard?.color || "#f59e0b" }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* רשימת עסקאות */}
              <div style={S.card}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>פירוט עסקאות</div>
                {monthTxs.map(t => (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #f0f5f0" }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{t.desc}</div>
                      <div style={{ fontSize: 10, color: "#9ca3af" }}>{t.date} · {t.category}</div>
                    </div>
                    <span style={{ fontWeight: 700, color: "#ff6b6b", fontSize: 14 }}>-{fmt(t.amount)}</span>
                  </div>
                ))}
              </div>

              {/* העלאת קובץ */}
              <div style={{ textAlign: "center", marginTop: 14 }}>
                <label style={{ ...S.btn, cursor: "pointer", display: "inline-block" }}>
                  📂 עדכן קובץ Excel לחודש זה
                  <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={e => {
                    if (e.target.files[0]) importExcelWithMonth(e.target.files[0], cardNav.cardId, cardNav.month);
                  }} />
                </label>
              </div>
            </div>
          );
        })()}

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
                      <button key={type} onClick={() => setNewTx(p => ({ ...p, type }))} style={{ flex: 1, padding: 10, border: "2px solid", borderColor: newTx.type === type ? (type === "income" ? "#00d4aa" : "#ff6b6b") : "#d0e8d0", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 13, background: newTx.type === type ? (type === "income" ? "#d4f5ee" : "#fee2e2") : "transparent", color: newTx.type === type ? (type === "income" ? "#00d4aa" : "#ff6b6b") : "#9ca3af" }}>
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
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: t.type === "income" ? "#e6faf6" : "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                      {t.type === "income" ? "💚" : "🔴"}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{t.desc}</div>
                      <div style={{ fontSize: 10, color: "#6b7280" }}>
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
      {showMonthPicker && (
        <div style={{ position: "fixed", inset: 0, background: "#0008", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div dir="rtl" style={{ background: "#fff", borderRadius: 16, padding: 24, width: 300, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>איזה חודש חיוב?</div>
            <input type="month" value={billingMonthInput} onChange={e => setBillingMonthInput(e.target.value)} style={{ background: "#f5f7f5", border: "1px solid #d0e4d0", borderRadius: 8, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box", marginBottom: 16 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => {
                if (pendingFile) importExcelWithMonth(pendingFile, cardNav.cardId, billingMonthInput);
                setShowMonthPicker(false);
                setPendingFile(null);
              }} style={{ flex: 1, background: "linear-gradient(135deg, #00d4aa, #00b894)", border: "none", borderRadius: 8, padding: "10px", color: "#fff", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>העלה</button>
              <button onClick={() => { setShowMonthPicker(false); setPendingFile(null); }} style={{ flex: 1, background: "#f0f4f0", border: "1px solid #d0e4d0", borderRadius: 8, padding: "10px", color: "#6b7280", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>ביטול</button>
            </div>
          </div>
        </div>
      )}

      {aiOpen && (
        <div style={{ position: "fixed", inset: 0, background: "#000b", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={e => e.target === e.currentTarget && setAiOpen(false)}>
          <div style={{ background: "#ffffff", width: "100%", maxWidth: 600, borderRadius: "20px 20px 0 0", border: "1px solid #1a3a1a", height: "75vh", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "13px 18px", borderBottom: "1px solid #1a3a1a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20 }}>🤖</span>
                <div><div style={{ fontWeight: 700, fontSize: 14 }}>יועץ AI פיננסי</div><div style={{ fontSize: 10, color: "#00d4aa" }}>● מחובר לנתונים שלך</div></div>
              </div>
              <button onClick={() => setAiOpen(false)} style={{ background: "#d0e8d0", border: "none", borderRadius: 8, padding: "5px 10px", color: "#9ca3af", cursor: "pointer", fontFamily: "inherit" }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              {aiMessages.map((msg, i) => (
                <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-start" : "flex-end" }}>
                  <div style={{ maxWidth: "80%", padding: "10px 14px", borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: msg.role === "user" ? "#d0e8d0" : "#e6faf6", border: msg.role === "user" ? "1px solid #1f4020" : "1px solid #00d4aa33", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{msg.content}</div>
                </div>
              ))}
              {aiLoading && <div style={{ display: "flex", justifyContent: "flex-end" }}><div style={{ padding: "10px 14px", background: "#e6faf6", border: "1px solid #00d4aa33", borderRadius: "16px 16px 16px 4px", fontSize: 13 }}>⏳ חושב...</div></div>}
              <div ref={chatEndRef} />
            </div>
            <div style={{ padding: 14, borderTop: "1px solid #1a3a1a", display: "flex", gap: 8 }}>
              <input value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendAI()} placeholder="שאלי אותי על הכספים שלך..." style={{ ...S.input, flex: 1 }} />
              <button onClick={sendAI} disabled={aiLoading} style={{ background: aiLoading ? "#d0e8d0" : "linear-gradient(135deg,#00d4aa,#44cc44)", border: "none", borderRadius: 10, padding: "10px 14px", cursor: "pointer", color: "#fff", fontWeight: 700, fontFamily: "inherit" }}>➤</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
