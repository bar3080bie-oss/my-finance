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
  const [savings, setSavings] = useState(() => {
    try { const s = localStorage.getItem("mf_savings"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [investments, setInvestments] = useState(() => {
    try { const s = localStorage.getItem("mf_investments"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [showAddSaving, setShowAddSaving] = useState(false);
  const [newSaving, setNewSaving] = useState({ name: "", type: "קרן פנסיה", owner: "", amount: "", company: "" });
  const [loans, setLoans] = useState(() => {
    try { const s = localStorage.getItem("mf_loans"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [showAddLoan, setShowAddLoan] = useState(false);
  const [newLoan, setNewLoan] = useState({ name: "", type: "הלוואה אישית", bankId: "", amount: "", remaining: "", monthly: "", rate: "", startDate: "", endDate: "" });
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [aiMessages]);
  useEffect(() => { try { localStorage.setItem("mf_accounts", JSON.stringify(accounts)); } catch {} }, [accounts]);
  useEffect(() => { try { localStorage.setItem("mf_transactions", JSON.stringify(transactions)); } catch {} }, [transactions]);
  useEffect(() => { try { localStorage.setItem("mf_loans", JSON.stringify(loans)); } catch {} }, [loans]);
  useEffect(() => { try { localStorage.setItem("mf_savings", JSON.stringify(savings)); } catch {} }, [savings]);
  useEffect(() => { try { localStorage.setItem("mf_investments", JSON.stringify(investments)); } catch {} }, [investments]);

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
      setAccounts(prev => prev.map(a => a.id === newAccount.id ? { ...a, name: newAccount.name, last4: newAccount.last4, color: newAccount.color, bankId: newAccount.bankId } : a));
    } else {
      setAccounts(prev => [...prev, { ...newAccount, id: "acc" + Date.now(), balance: 0 }]);
    }
    setNewAccount({ type: "bank", name: "", last4: "", color: "#00d4aa", bankId: "" });
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
      setTab("cards");
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
        const wb = XLSX.read(e.target.result, { type: "array", cellDates: true, bookVBA: false });
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
            const catMap = { "מזון ומשקאות": "מזון", "מסעדות": "מסעדות", "אנרגיה": "דלק", "ריהוט ובית": "בית", "פנאי בילוי": "בידור", "ביטוח ופיננסים": "ביטוח", "תקשורת ומחשבים": "תקשורת", "חינוך": "חינוך", "בריאות": "בריאות", "שונות": "אחר", "ביגוד והנעלה": "ביגוד", "תכשיטים ואקססוריז": "ביגוד", "טיפוח ויופי": "יופי", "חיות מחמד": "חיות", "ספורט": "ספורט" };
            const smartCat = (desc, ענף) => {
              const d = (desc || "").toLowerCase();
              if (/דלק|פז|סונול|דור אלון|פנגו|yellow|אמישרגז|bp |oil /.test(d)) return "דלק";
              if (/חניה|פארקינג|parking|כביש 6|כביש6/.test(d)) return "תחבורה";
              if (/מכבי|כללית|לאומית|רופא|בית חולים|מאוחדת|אופטיקה|תרופות/.test(d)) return "בריאות";
              if (/פארם|super pharm|superpharm|סופר פארם|גרין|בית מרקחת|רוקח/.test(d)) return "בריאות";
              if (/שופרסל|רמי לוי|ויקטורי|מגא|יינות ביתן|מינימרקט|מאפייה|לחם/.test(d)) return "מזון";
              if (/wolt|יאנגו|yango|10bis|משלוחא|פיצה|בורגר|מקדונלד|סביח|פלאפל/.test(d)) return "מסעדות";
              if (/קפה|cafe|coffee|רולדין|ארומה|גרג|קונדיטוריה|איטליאנו|סושי|מסעדה|שניצל|סוויט/.test(d)) return "מסעדות";
              if (/netflix|spotify|apple.com|google|disney|hbo|youtube|אפל/.test(d)) return "מנויים";
              if (/פלאפון|הוט|בזק|yes |סלקום|partner|אורנג|גולן|שיחות/.test(d)) return "תקשורת";
              if (/ביטוח|מגדל|הראל|כלל|מנורה|הפניקס|איי.אי.ג/.test(d)) return "ביטוח";
              if (/חינוך|גן |בית ספר|קורס|אוניברסיטה|מלכה|לימוד/.test(d)) return "חינוך";
              if (/זארה|h&m|מנגו|fox|next|קסטרו|רנואר|ביגוד|בגד|עמית שמלה|טרמינל/.test(d)) return "ביגוד";
              if (/איב רושה|oil de|טיפוח|יופי|שיער|ציפורן|מניקור|פדיקור|קוסמטיקה/.test(d)) return "יופי";
              if (/ספורט|כושר|gym|fitness|מכבי ספורט/.test(d)) return "ספורט";
              if (/אמזון|amazon|ali|ebay|shop/.test(d)) return "קניות אונליין";
              if (/bit|paybox|העברה|ביט/.test(d)) return "העברות";
              if (/דמי כרטיס|עמלת|עמלה/.test(d)) return "עמלות";
              if (/תרומה|הידברות|עמותה|צדקה/.test(d)) return "תרומות";
              if (/הייפ|איקאה|home center|ace|רהיטים|ריהוט/.test(d)) return "בית";
              return catMap[ענף] || "אחר";
            };
            const category = smartCat(desc, ענף);
            const dateRaw = row[0];
            let dateFormatted = new Date().toISOString().split("T")[0];
            if (dateRaw instanceof Date) {
              dateFormatted = dateRaw.getFullYear() + "-" + String(dateRaw.getMonth()+1).padStart(2,"0") + "-" + String(dateRaw.getDate()).padStart(2,"0");
            } else if (typeof dateRaw === "number" && dateRaw > 40000) {
              const d = new Date((dateRaw - 25569) * 86400 * 1000);
              dateFormatted = d.getUTCFullYear() + "-" + String(d.getUTCMonth()+1).padStart(2,"0") + "-" + String(d.getUTCDate()).padStart(2,"0");
            } else if (typeof dateRaw === "string" && dateRaw.includes("/")) {
              const parts = dateRaw.split("/");
              if (parts.length === 3) {
                const year = parts[2].length === 2 ? "20" + parts[2] : parts[2];
                dateFormatted = year + "-" + parts[1].padStart(2,"0") + "-" + parts[0].padStart(2,"0");
              }
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
        const wb = XLSX.read(e.target.result, { type: "array", cellDates: true, bookVBA: false });
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
          const smartCat2 = (desc, ענף) => {
            const d = (desc || "").toLowerCase();
            if (/דלק|פז|סונול|דור אלון|פנגו|yellow|אמישרגז|bp |oil /.test(d)) return "דלק";
            if (/חניה|פארקינג|parking|כביש 6|כביש6/.test(d)) return "תחבורה";
            if (/מכבי|כללית|לאומית|רופא|בית חולים|מאוחדת|אופטיקה|תרופות/.test(d)) return "בריאות";
            if (/פארם|super pharm|superpharm|סופר פארם|גרין|בית מרקחת/.test(d)) return "בריאות";
            if (/שופרסל|רמי לוי|ויקטורי|מגא|יינות ביתן|מינימרקט|מאפייה/.test(d)) return "מזון";
            if (/wolt|יאנגו|yango|10bis|פיצה|בורגר|מקדונלד|סביח|פלאפל/.test(d)) return "מסעדות";
            if (/קפה|cafe|coffee|רולדין|ארומה|גרג|איטליאנו|סושי|מסעדה|שניצל|סוויט/.test(d)) return "מסעדות";
            if (/netflix|spotify|apple.com|google|disney|hbo|youtube/.test(d)) return "מנויים";
            if (/פלאפון|הוט|בזק|yes |סלקום|partner|אורנג|גולן/.test(d)) return "תקשורת";
            if (/ביטוח|מגדל|הראל|כלל|מנורה|הפניקס|איי.אי.ג/.test(d)) return "ביטוח";
            if (/חינוך|גן |בית ספר|קורס|אוניברסיטה|מלכה/.test(d)) return "חינוך";
            if (/זארה|h&m|מנגו|fox|next|קסטרו|עמית שמלה|טרמינל/.test(d)) return "ביגוד";
            if (/איב רושה|oil de|טיפוח|יופי|שיער|ציפורן|קוסמטיקה/.test(d)) return "יופי";
            if (/ספורט|כושר|gym|fitness/.test(d)) return "ספורט";
            if (/אמזון|amazon|ali|ebay/.test(d)) return "קניות אונליין";
            if (/bit|paybox|העברה|ביט/.test(d)) return "העברות";
            if (/דמי כרטיס|עמלת|עמלה/.test(d)) return "עמלות";
            if (/תרומה|הידברות|עמותה|צדקה/.test(d)) return "תרומות";
            if (/הייפ|איקאה|home center|ace|ריהוט/.test(d)) return "בית";
            const catMap2 = { "מזון ומשקאות": "מזון", "מסעדות": "מסעדות", "אנרגיה": "דלק", "ריהוט ובית": "בית", "פנאי בילוי": "בידור", "ביטוח ופיננסים": "ביטוח", "תקשורת ומחשבים": "תקשורת", "חינוך": "חינוך", "בריאות": "בריאות", "שונות": "אחר", "ביגוד והנעלה": "ביגוד", "טיפוח ויופי": "יופי", "ספורט": "ספורט" };
            return catMap2[ענף] || "אחר";
          };
          const category = smartCat2(desc, ענף);
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
        // AI categorization for uncategorized items
        const uncategorized = newTxs.filter(t => t.category === "אחר");
        if (uncategorized.length > 0) {
          setTransactions(prev => [...prev.filter(t => !(t.accountId === accountId && t.billingMonth === billingMonth)), ...newTxs]);
          setImportMsg("🤖 מסווג " + uncategorized.length + " עסקאות עם AI...");
          const merchants = [...new Set(uncategorized.map(t => t.desc))];
          fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "claude-sonnet-4-20250514",
              max_tokens: 1000,
              system: `סווג כל עסק לקטגוריה אחת מהרשימה: מזון, מסעדות, תחבורה, דלק, חניה, בריאות, ביגוד, יופי, מנויים, תקשורת, ביטוח, חינוך, בית, ספורט, בידור, קניות אונליין, העברות, עמלות, תרומות, אחר. ענה רק ב-JSON: {"שם עסק": "קטגוריה"}`,
              messages: [{ role: "user", content: "סווג: " + JSON.stringify(merchants) }]
            })
          }).then(r => r.json()).then(data => {
            try {
              const text = data.content?.[0]?.text || "{}";
              const clean = text.replace(/```json|```/g, "").trim();
              const catMap = JSON.parse(clean);
              setTransactions(prev => prev.map(t => {
                if (t.accountId === accountId && t.billingMonth === billingMonth && t.category === "אחר" && catMap[t.desc]) {
                  return { ...t, category: catMap[t.desc] };
                }
                return t;
              }));
              setImportMsg("✅ יובאו " + imported + " עסקאות — סווגו עם AI!");
              setTimeout(() => setImportMsg(""), 4000);
            } catch { setImportMsg("✅ יובאו " + imported + " עסקאות"); setTimeout(() => setImportMsg(""), 4000); }
          }).catch(() => { setImportMsg("✅ יובאו " + imported + " עסקאות"); setTimeout(() => setImportMsg(""), 4000); });
        } else {
          setTransactions(prev => [...prev.filter(t => !(t.accountId === accountId && t.billingMonth === billingMonth)), ...newTxs]);
          setImportMsg("✅ יובאו " + imported + " עסקאות לחודש " + billingMonth);
          setTimeout(() => setImportMsg(""), 4000);
        }
      } catch(err) { setImportMsg("❌ שגיאה: " + err.message); setTimeout(() => setImportMsg(""), 5000); }
    };
    reader.readAsArrayBuffer(file);
  };

  const importLoanSchedule = (file, loanId) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const schedule = [];
        let headerRow = -1;
        // Find header row
        for (let i = 0; i < rows.length; i++) {
          if (rows[i] && rows[i].some(c => String(c || "").includes("מספר תשלום"))) {
            headerRow = i;
            break;
          }
        }
        if (headerRow === -1) { setImportMsg("❌ לא נמצאה שורת כותרות"); setTimeout(() => setImportMsg(""), 4000); return; }
        for (let i = headerRow + 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !row[1]) continue;
          const num = row[1];
          const date = String(row[2] || "");
          const principal = parseFloat(row[3]) || 0;
          const interest = parseFloat(row[4]) || 0;
          const total = parseFloat(row[5]) || 0;
          const balance = parseFloat(row[6]) || 0;
          if (!num || !total) continue;
          schedule.push({ month: num, date, principal: Math.round(principal), interest: Math.round(interest), payment: Math.round(total), balance: Math.round(balance) });
        }
        setLoans(prev => prev.map(l => l.id === loanId ? { ...l, schedule, monthly: schedule[0]?.payment || l.monthly } : l));
        setImportMsg("✅ לוח סילוקין עם " + schedule.length + " תשלומים עלה בהצלחה!");
        setTimeout(() => setImportMsg(""), 4000);
      } catch(err) { setImportMsg("❌ שגיאה: " + err.message); setTimeout(() => setImportMsg(""), 5000); }
    };
    reader.readAsArrayBuffer(file);
  };

  const reclassifyAll = async () => {
    setImportMsg("🤖 מסווג את כל העסקאות עם AI...");
    const cardTxs = transactions.filter(t => cards.some(c => c.id === t.accountId));
    const merchants = [...new Set(cardTxs.map(t => t.desc).filter(Boolean))];
    if (merchants.length === 0) { setImportMsg("אין עסקאות לסיווג"); setTimeout(() => setImportMsg(""), 3000); return; }
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          system: `אתה מסווג הוצאות בישראל. סווג כל עסק לקטגוריה מהרשימה: מזון, מסעדות, תחבורה, דלק, חניה, בריאות, ביגוד, יופי, מנויים, תקשורת, ביטוח, חינוך, בית, ספורט, בידור, קניות אונליין, העברות, עמלות, תרומות, אחר. ענה רק ב-JSON תקני ללא הסברים: {"שם עסק": "קטגוריה"}`,
          messages: [{ role: "user", content: JSON.stringify(merchants) }]
        })
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || "{}";
      const clean = text.replace(/```json|```/g, "").trim();
      const catMap = JSON.parse(clean);
      setTransactions(prev => prev.map(t => {
        if (cards.some(c => c.id === t.accountId) && catMap[t.desc]) {
          return { ...t, category: catMap[t.desc] };
        }
        return t;
      }));
      setImportMsg("✅ כל העסקאות סווגו בהצלחה!");
      setTimeout(() => setImportMsg(""), 4000);
    } catch(err) {
      setImportMsg("❌ שגיאה בסיווג: " + err.message);
      setTimeout(() => setImportMsg(""), 4000);
    }
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
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowSearch(true)} style={{ background: "#f0f5f0", border: "1px solid #d0e4d0", borderRadius: 20, padding: "7px 14px", cursor: "pointer", color: "#6b7280", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>🔍</button>
          <button onClick={() => setAiOpen(true)} style={{ background: "#e6faf6", border: "1px solid #00d4aa44", borderRadius: 20, padding: "7px 14px", cursor: "pointer", color: "#00d4aa", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>🤖 AI</button>
        </div>
      </header>

      {/* Tabs */}
      <nav style={{ display: "flex", background: "#f0f5f0", borderBottom: "1px solid #1a3a1a", overflowX: "auto" }}>
        {[{ id: "dashboard", label: "סקירה", icon: "📊" }, { id: "accounts", label: "חשבונות", icon: "🏦" }, { id: "cards", label: "כרטיסים", icon: "💳" }, { id: "transactions", label: "עסקאות", icon: "📋" }, { id: "loans", label: "הלוואות", icon: "🏧" }, { id: "savings", label: "חסכונות", icon: "💎" }, { id: "monthly", label: "חודשי", icon: "📅" }].map(t => (
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
          const year2026 = bankTxs.filter(t => t.date && t.date.startsWith("2026"));
          const year2026Income = year2026.filter(t => t.type === "income").reduce((s,t) => s+t.amount, 0);
          const year2026Expense = year2026.filter(t => t.type === "expense").reduce((s,t) => s+t.amount, 0);
          const totalBankBalance = banks.reduce((s,a) => s + (a.balance||0), 0);
          const totalLoans = loans.reduce((s,l) => s + l.remaining, 0);
          const totalSavings = savings.reduce((s,sv) => s + Number(sv.amount||0), 0);

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

          // AI tips based on data
          const tips = [];
          if (year2026Income > year2026Expense) {
            const surplus = year2026Income - year2026Expense;
            tips.push({ icon: "💡", text: "יש לך עודף של " + fmt(surplus) + " השנה — שקלי להעביר חלק לחסכון או השקעה" });
          }
          if (totalLoans > totalBankBalance * 3) tips.push({ icon: "⚠️", text: "החוב שלך גבוה יחסית ליתרה — שקלי להגדיל תשלומים חודשיים" });
          if (totalSavings === 0) tips.push({ icon: "💎", text: "עוד לא הגדרת חסכונות — כדאי לעקוב אחרי קרן הפנסיה וגמל להשקעה" });

          return (
          <div style={{ fontSize: 13 }}>
            {/* יתרה + הלוואות + חסכונות */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div style={{ ...S.card, marginBottom: 0, background: "linear-gradient(135deg, #00d4aa15, #00b89408)", border: "1px solid #00d4aa44", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>🏦 יתרה</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: totalBankBalance >= 0 ? "#00b894" : "#ff6b6b" }}>{fmt(totalBankBalance)}</div>
              </div>
              <div style={{ ...S.card, marginBottom: 0, background: "linear-gradient(135deg, #f59e0b15, #f59e0b08)", border: "1px solid #f59e0b44", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>🏧 הלוואות</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: "#f59e0b" }}>{fmt(totalLoans)}</div>
              </div>
              <div style={{ ...S.card, marginBottom: 0, background: "linear-gradient(135deg, #a78bfa15, #a78bfa08)", border: "1px solid #a78bfa44", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>💎 חסכונות</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: "#a78bfa" }}>{fmt(totalSavings)}</div>
              </div>
            </div>

            {/* הכנסות/הוצאות 2026 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div style={{ ...S.card, marginBottom: 0 }}>
                <div style={{ fontSize: 10, color: "#9ca3af" }}>⬆️ הכנסות 2026</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#00b894" }}>{fmt(year2026Income)}</div>
              </div>
              <div style={{ ...S.card, marginBottom: 0 }}>
                <div style={{ fontSize: 10, color: "#9ca3af" }}>⬇️ הוצאות 2026</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#ff6b6b" }}>{fmt(year2026Expense)}</div>
              </div>
            </div>

            {/* חשבונות */}
            {banks.length > 0 && (
              <div style={{ ...S.card, padding: 12, marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: "#00b894" }}>🏦 חשבונות</div>
                {banks.map(acc => (
                  <div key={acc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #e8f0e8" }}>
                    <span style={{ fontSize: 12 }}>{acc.name} <span style={{ color: "#9ca3af", fontSize: 11 }}>****{acc.last4}</span></span>
                    <span style={{ fontWeight: 700, color: acc.balance >= 0 ? "#00b894" : "#ff6b6b", fontSize: 13 }}>{fmt(acc.balance)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* כרטיסים */}
            {cards.length > 0 && (
              <div style={{ ...S.card, padding: 12, marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: "#f59e0b" }}>💳 כרטיסים</div>
                {cards.map(acc => {
                  const cardTotal = transactions.filter(t => t.accountId === acc.id && t.type === "expense").reduce((s,t) => s+t.amount, 0);
                  return (
                    <div key={acc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #e8f0e8" }}>
                      <span style={{ fontSize: 12 }}>{acc.name} <span style={{ color: "#9ca3af", fontSize: 11 }}>****{acc.last4}</span></span>
                      <span style={{ fontWeight: 700, color: "#ff6b6b", fontSize: 13 }}>{fmt(cardTotal)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* פירוט חודשי */}
            {sortedMonths.length > 0 && (
              <div style={{ ...S.card, padding: 12, marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>📅 פירוט חודשי — חשבונות בנק</div>
                {sortedMonths.map(([key, data]) => {
                  const bal = data.income - data.expense;
                  return (
                    <div key={key} style={{ padding: "7px 0", borderBottom: "1px solid #e8f0e8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>{monthNames[data.month]} {data.year}</div>
                        <div style={{ fontSize: 10, color: "#9ca3af" }}>⬆️ {fmt(data.income)} · ⬇️ {fmt(data.expense)}</div>
                      </div>
                      <span style={{ fontWeight: 800, fontSize: 13, color: bal >= 0 ? "#00b894" : "#ff6b6b" }}>{fmt(bal)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* עצות AI */}
            {tips.length > 0 && (
              <div style={{ ...S.card, padding: 12, background: "linear-gradient(135deg, #00d4aa08, #a78bfa08)", border: "1px solid #00d4aa33" }}>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>🤖 עצות פיננסיות</div>
                {tips.map((tip, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: i < tips.length-1 ? "1px solid #e8f0e8" : "none", fontSize: 12 }}>
                    <span>{tip.icon}</span><span>{tip.text}</span>
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
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={reclassifyAll} style={{ ...S.btnSm, background: "#e6faf6", border: "1px solid #00d4aa55", color: "#00b894" }}>🤖 סווג הכל</button>
                    <button onClick={() => { setNewAccount({ type: "card", name: "", last4: "", color: "#f59e0b", bankId: "" }); setShowAddAccount(true); }} style={S.btn}>+ הוסף כרטיס</button>
                  </div>
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
                {showAddAccount && newAccount.type === "card" && (
                  <div style={{ ...S.card, border: "1px solid #f59e0b44", marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>עריכת כרטיס</div>
                    <div style={{ display: "grid", gap: 10 }}>
                      <input value={newAccount.name} onChange={e => setNewAccount(p => ({ ...p, name: e.target.value }))} placeholder="שם הכרטיס" style={S.input} />
                      <input value={newAccount.last4} onChange={e => setNewAccount(p => ({ ...p, last4: e.target.value.slice(0,4) }))} placeholder="4 ספרות אחרונות" maxLength={4} style={S.input} />
                      <select value={newAccount.bankId || ""} onChange={e => setNewAccount(p => ({ ...p, bankId: e.target.value }))} style={S.input}>
                        <option value="">ללא חשבון בנק</option>
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

                {/* חיוב אחרון */}
                {availableMonths.length > 0 && (() => {
                  const lastMonth = availableMonths[0];
                  const lastTxs = cardAllTxs.filter(t => (t.billingMonth || t.date?.substring(0,7)) === lastMonth);
                  const lastTotal = lastTxs.reduce((s,t) => s+t.amount, 0);
                  const [ly, lm] = lastMonth.split("-");
                  const monthNames2 = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
                  return (
                    <div style={{ ...S.card, background: `linear-gradient(135deg, ${currentCard?.color}22, ${currentCard?.color}08)`, border: `2px solid ${currentCard?.color}55`, marginBottom: 16 }}>
                      <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>חיוב אחרון — {monthNames2[parseInt(lm)-1]} {ly}</div>
                      <div style={{ fontSize: 28, fontWeight: 900, color: currentCard?.color || "#f59e0b" }}>{fmt(lastTotal)}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>{lastTxs.length} עסקאות</div>
                    </div>
                  );
                })()}

                {availableMonths.map(m => {
                  const mTxs = cardAllTxs.filter(t => (t.billingMonth || t.date?.substring(0,7)) === m);
                  const total = mTxs.reduce((s,t) => s+t.amount, 0);
                  const [y, mo] = m.split("-");
                  return (
                    <div key={m} style={{ ...S.card, border: `1px solid ${currentCard?.color}33`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div onClick={() => setCardNav(p => ({ ...p, month: m }))} style={{ flex: 1, cursor: "pointer" }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{monthNames[parseInt(mo)-1]} {y}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>{mTxs.length} עסקאות</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 800, color: "#ff6b6b", fontSize: 16 }}>{fmt(total)}</span>
                        <button onClick={e => {
                          e.stopPropagation();
                          if (window.confirm("למחוק את כל עסקאות " + monthNames[parseInt(mo)-1] + " " + y + "?")) {
                            setTransactions(prev => prev.filter(t => !(t.accountId === cardNav.cardId && (t.billingMonth || t.date?.substring(0,7)) === m)));
                          }
                        }} style={{ background: "#fff5f5", border: "1px solid #ffb3b3", borderRadius: 6, padding: "4px 8px", color: "#ff6b6b", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>🗑️</button>
                        <span onClick={() => setCardNav(p => ({ ...p, month: m }))} style={{ color: "#9ca3af", fontSize: 18, cursor: "pointer" }}>›</span>
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

              {/* פילוח קטגוריות + עוגה */}
              {Object.keys(catBreakdown).length > 0 && (() => {
                const pieColors = ["#f59e0b","#ff6b6b","#00b894","#a78bfa","#0099ff","#fb7185","#00d4aa","#f97316","#14b8a6","#8b5cf6","#ec4899","#06b6d4","#84cc16","#f43f5e"];
                const sortedCats = Object.entries(catBreakdown).sort((a,b) => b[1]-a[1]);
                const p2c = (cx, cy, r, deg) => { const rad = (deg - 90) * Math.PI / 180; return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }; };
                let startAngle = 0;
                const slices = sortedCats.map(([cat, amt], i) => {
                  const angle = (amt / monthTotal) * 360;
                  const s = { cat, amt, start: startAngle, angle, color: pieColors[i % pieColors.length] };
                  startAngle += angle;
                  return s;
                });
                return (
                  <div style={S.card}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>פילוח לפי קטגוריה</div>
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                      <svg viewBox="0 0 100 100" width="150" height="150">
                        {slices.map((s, i) => {
                          if (s.angle >= 359.9) return <circle key={i} cx="50" cy="50" r="40" fill={s.color} />;
                          const st = p2c(50,50,40,s.start), en = p2c(50,50,40,s.start+s.angle);
                          return <path key={i} d={`M50,50 L${st.x},${st.y} A40,40,0,${s.angle>180?1:0},1,${en.x},${en.y}Z`} fill={s.color} stroke="#fff" strokeWidth="0.8" />;
                        })}
                        <circle cx="50" cy="50" r="22" fill="white" />
                        <text x="50" y="50" textAnchor="middle" fontSize="6" fill="#333" dominantBaseline="middle" fontWeight="bold">{sortedCats.length} קטגוריות</text>
                      </svg>
                    </div>
                    {sortedCats.map(([cat, amt], i) => (
                      <div key={cat} style={{ marginBottom: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2, alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <div style={{ width: 9, height: 9, borderRadius: 2, background: pieColors[i % pieColors.length], flexShrink: 0 }} />
                            <span style={{ fontWeight: 500 }}>{cat}</span>
                          </div>
                          <span style={{ fontWeight: 600, color: "#ff6b6b" }}>{fmt(amt)} <span style={{ color: "#9ca3af", fontSize: 10 }}>({Math.round(amt/monthTotal*100)}%)</span></span>
                        </div>
                        <div style={{ background: "#f0f0f0", borderRadius: 3, height: 4, marginRight: 14 }}>
                          <div style={{ width: `${Math.round(amt/monthTotal*100)}%`, height: "100%", borderRadius: 3, background: pieColors[i % pieColors.length] }} />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

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

        {/* LOANS */}
        {tab === "loans" && (() => {
          const loanTypes = ["משכנתא", "הלוואת רכב", "הלוואה אישית", "הלוואת מקום עבודה", "הלוואת גמח", "קרן השתלמות", "אחר"];

          const addLoan = () => {
            if (!newLoan.name || !newLoan.amount) return;
            const loan = { ...newLoan, id: "loan" + Date.now(), amount: Number(newLoan.amount), remaining: Number(newLoan.remaining || newLoan.amount), monthly: Number(newLoan.monthly || 0), rate: Number(newLoan.rate || 0), schedule: newLoan.schedule || [] };
            setLoans(prev => [...prev, loan]);
            setNewLoan({ name: "", type: "הלוואה אישית", bankId: "", amount: "", remaining: "", monthly: "", rate: "", startDate: "", endDate: "" });
            setShowAddLoan(false);
          };

          const deleteLoan = (id) => {
            if (window.confirm("למחוק הלוואה זו?")) setLoans(prev => prev.filter(l => l.id !== id));
          };

          const calcAmortization = (loan) => {
            if (!loan.monthly || !loan.rate || !loan.remaining) return [];
            const monthlyRate = loan.rate / 100 / 12;
            let balance = loan.remaining;
            const rows = [];
            let month = 1;
            while (balance > 0.5 && month <= 360) {
              const interest = balance * monthlyRate;
              const principal = Math.min(loan.monthly - interest, balance);
              if (principal <= 0) break;
              balance = Math.max(0, balance - principal);
              rows.push({ month, payment: loan.monthly, interest: Math.round(interest), principal: Math.round(principal), balance: Math.round(balance) });
              month++;
            }
            return rows;
          };

          if (selectedLoan) {
            const loan = loans.find(l => l.id === selectedLoan);
            if (!loan) { setSelectedLoan(null); return null; }
            const schedule = calcAmortization(loan);
            const totalPaid = loan.amount - loan.remaining;
            const paidPct = Math.round((totalPaid / loan.amount) * 100);
            const linkedBank = banks.find(b => b.id === loan.bankId);
            const totalInterest = schedule.reduce((s,r) => s + r.interest, 0);

            return (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <button onClick={() => setSelectedLoan(null)} style={{ ...S.btnSm, fontSize: 14 }}>&#8249;</button>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{loan.name}</h2>
                </div>
                <div style={{ ...S.card, background: "linear-gradient(135deg, #f59e0b15, #f59e0b05)", border: "2px solid #f59e0b44", marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>{loan.type}</div>
                      <div style={{ fontSize: 28, fontWeight: 900, color: "#f59e0b" }}>{fmt(loan.remaining)}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>נותר לתשלום</div>
                    </div>
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>סכום מקורי</div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(loan.amount)}</div>
                      {linkedBank && <div style={{ fontSize: 11, color: "#00b894", marginTop: 4 }}>🏦 {linkedBank.name} ****{linkedBank.last4}</div>}
                    </div>
                  </div>
                  <div style={{ background: "#f0f0f0", borderRadius: 6, height: 10, marginBottom: 8 }}>
                    <div style={{ width: paidPct + "%", height: "100%", borderRadius: 6, background: "linear-gradient(90deg, #00b894, #00d4aa)" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9ca3af", marginBottom: 12 }}>
                    <span>שולם {fmt(totalPaid)} ({paidPct}%)</span>
                    <span>ריבית {loan.rate}%</span>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ flex: 1, background: "#fff", borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ fontSize: 10, color: "#9ca3af" }}>חודשי</div>
                      <div style={{ fontWeight: 700, color: "#f59e0b" }}>{fmt(loan.monthly)}</div>
                    </div>
                    <div style={{ flex: 1, background: "#fff", borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ fontSize: 10, color: "#9ca3af" }}>סה"כ ריבית</div>
                      <div style={{ fontWeight: 700, color: "#ff6b6b" }}>{fmt(totalInterest)}</div>
                    </div>
                    <div style={{ flex: 1, background: "#fff", borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ fontSize: 10, color: "#9ca3af" }}>תשלומים</div>
                      <div style={{ fontWeight: 700 }}>{schedule.length}</div>
                    </div>
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ ...S.btn, cursor: "pointer", display: "inline-block" }}>
                    📂 העלי לוח סילוקין מ-Excel
                    <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) importLoanSchedule(e.target.files[0], loan.id); }} />
                  </label>
                </div>

                {(schedule.length > 0 || (loan.schedule && loan.schedule.length > 0)) && (() => {
                  const displaySchedule = loan.schedule && loan.schedule.length > 0 ? loan.schedule : schedule;
                  return (
                  <div style={S.card}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>📋 לוח סילוקין</div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: "#f5f7f5" }}>
                            {["#", "תשלום", "ריבית", "קרן", "יתרה"].map(h => (
                              <th key={h} style={{ padding: "8px 6px", textAlign: "right", fontWeight: 600, color: "#6b7280", borderBottom: "1px solid #e0ece0" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {displaySchedule.slice(0, 24).map(row => (
                            <tr key={row.month} style={{ borderBottom: "1px solid #f0f5f0" }}>
                              <td style={{ padding: "7px 6px", color: "#9ca3af" }}>{row.month}</td>
                              <td style={{ padding: "7px 6px", fontWeight: 600 }}>{fmt(row.payment)}</td>
                              <td style={{ padding: "7px 6px", color: "#ff6b6b" }}>{fmt(row.interest)}</td>
                              <td style={{ padding: "7px 6px", color: "#00b894" }}>{fmt(row.principal)}</td>
                              <td style={{ padding: "7px 6px", fontWeight: 600 }}>{fmt(row.balance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {displaySchedule.length > 24 && <div style={{ textAlign: "center", padding: 10, fontSize: 12, color: "#9ca3af" }}>מוצגים 24 מתוך {displaySchedule.length} תשלומים</div>}
                    </div>
                  </div>
                  );
                })()}
              </div>
            );
          }

          return (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>🏧 הלוואות</h2>
                <button onClick={() => setShowAddLoan(true)} style={S.btn}>+ הוסף הלוואה</button>
              </div>
              {showAddLoan && (
                <div style={{ ...S.card, border: "1px solid #f59e0b44", marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>הלוואה חדשה</div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 12 }}>העלי קובץ לוח סילוקין מהבנק — הכל יתמלא אוטומטית</div>
                  <div style={{ display: "grid", gap: 10 }}>
                    <label style={{ ...S.btn, textAlign: "center", cursor: "pointer", display: "block" }}>
                      📂 העלי קובץ הלוואה או לוח סילוקין מ-Excel
                      <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => {
                        if (!e.target.files[0]) return;
                        const file = e.target.files[0];
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          try {
                            const wb = XLSX.read(ev.target.result, { type: "array", cellDates: true });
                            const ws = wb.Sheets[wb.SheetNames[0]];
                            const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
                            
                            // זיהוי פורמט — פירוט הלוואות או לוח סילוקין
                            const isLoanDetails = rows.some(r => r && r.some(c => String(c||"").includes("פירוט הלוואות")));
                            
                            if (isLoanDetails) {
                              // פירוט הלוואות מהבנק
                              const dataRow = rows.find(r => r && r[1] && String(r[1]).includes("הל.") || (r && r[2] && typeof r[2] === "number" && r[2] > 1000));
                              if (!dataRow) { setImportMsg("❌ לא נמצאו פרטי הלוואה"); setTimeout(()=>setImportMsg(""),4000); return; }
                              const name = String(dataRow[1] || "הלוואה").trim();
                              const amount = Math.round(parseFloat(dataRow[2]) || 0);
                              const remaining = Math.round(parseFloat(String(dataRow[6]).replace(/,/g,"")) || 0);
                              const monthly = Math.round(parseFloat(dataRow[8]) || 0);
                              const rateStr = String(dataRow[4] || "");
                              const rateMatch = rateStr.match(/(\d+\.?\d*)\s*%/);
                              const rate = rateMatch ? parseFloat(rateMatch[1]) : 0;
                              const endDate = dataRow[7] instanceof Date ? dataRow[7].toISOString().split("T")[0] : "";
                              const startDate = dataRow[3] instanceof Date ? dataRow[3].toISOString().split("T")[0] : "";
                              setNewLoan(p => ({ ...p, name, amount: String(amount), remaining: String(remaining), monthly: String(monthly), rate: String(rate), startDate, endDate }));
                              setImportMsg("✅ פרטי ההלוואה נטענו — בחרי חשבון בנק ושמרי");
                              setTimeout(()=>setImportMsg(""),5000);
                            } else {
                              // לוח סילוקין
                              let loanName = "הלוואה";
                              let loanNum = "";
                              for (let i = 0; i < 8; i++) {
                                if (rows[i]) {
                                  const cell = String(rows[i][0] || "");
                                  if (cell.includes("מספר הלוואה")) loanNum = cell.replace("מספר הלוואה:", "").trim();
                                  if (cell.includes("הל.")) loanName = cell;
                                }
                              }
                              let headerRow = -1;
                              for (let i = 0; i < rows.length; i++) {
                                if (rows[i] && rows[i].some(c => String(c||"").includes("מספר תשלום"))) { headerRow = i; break; }
                              }
                              if (headerRow === -1) { setImportMsg("❌ פורמט לא מוכר"); setTimeout(()=>setImportMsg(""),4000); return; }
                              const schedule = [];
                              for (let i = headerRow + 1; i < rows.length; i++) {
                                const row = rows[i];
                                if (!row || !row[1]) continue;
                                schedule.push({ month: row[1], date: String(row[2]||""), principal: Math.round(parseFloat(row[3])||0), interest: Math.round(parseFloat(row[4])||0), payment: Math.round(parseFloat(row[5])||0), balance: Math.round(parseFloat(row[6])||0) });
                              }
                              if (schedule.length === 0) { setImportMsg("❌ לא נמצאו תשלומים"); setTimeout(()=>setImportMsg(""),4000); return; }
                              const remaining = (schedule[0].balance || 0) + (schedule[0].principal || 0);
                              const monthly = schedule[0].payment || 0;
                              setNewLoan(p => ({ ...p, name: loanName + (loanNum ? " " + loanNum : ""), amount: String(Math.round(remaining + schedule.reduce((s,r)=>s+r.principal,0) - schedule[0].principal)), remaining: String(remaining), monthly: String(monthly), schedule }));
                              setImportMsg("✅ נמצאו " + schedule.length + " תשלומים — בדקי ושמרי");
                              setTimeout(()=>setImportMsg(""),5000);
                            }
                          } catch(err) { setImportMsg("❌ שגיאה: " + err.message); setTimeout(()=>setImportMsg(""),5000); }
                        };
                        reader.readAsArrayBuffer(file);
                      }} />
                    </label>
                    <div style={{ fontSize: 12, color: "#6b7280", textAlign: "center" }}>— או הזיני ידנית —</div>
                    <input value={newLoan.name} onChange={e => setNewLoan(p => ({ ...p, name: e.target.value }))} placeholder="שם ההלוואה" style={S.input} />
                    <select value={newLoan.type} onChange={e => setNewLoan(p => ({ ...p, type: e.target.value }))} style={S.input}>
                      {loanTypes.map(t => <option key={t}>{t}</option>)}
                    </select>
                    <select value={newLoan.bankId || ""} onChange={e => setNewLoan(p => ({ ...p, bankId: e.target.value }))} style={S.input}>
                      <option value="">בחר חשבון בנק משויך</option>
                      {banks.map(b => <option key={b.id} value={b.id}>{b.name} ****{b.last4}</option>)}
                    </select>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <input value={newLoan.amount} onChange={e => setNewLoan(p => ({ ...p, amount: e.target.value }))} placeholder="סכום מקורי (₪)" type="number" style={S.input} />
                      <input value={newLoan.remaining} onChange={e => setNewLoan(p => ({ ...p, remaining: e.target.value }))} placeholder="יתרה נוכחית (₪)" type="number" style={S.input} />
                      <input value={newLoan.monthly} onChange={e => setNewLoan(p => ({ ...p, monthly: e.target.value }))} placeholder="תשלום חודשי (₪)" type="number" style={S.input} />
                      <input value={newLoan.rate} onChange={e => setNewLoan(p => ({ ...p, rate: e.target.value }))} placeholder="ריבית שנתית (%)" type="number" step="0.1" style={S.input} />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={addLoan} style={{ ...S.btn, flex: 1 }}>שמור</button>
                      <button onClick={() => setShowAddLoan(false)} style={{ ...S.btnGhost, flex: 1 }}>ביטול</button>
                    </div>
                  </div>
                </div>
              )}
              {loans.length > 0 && (
                <div style={{ ...S.card, background: "linear-gradient(135deg, #f59e0b15, #f59e0b05)", border: "1px solid #f59e0b33", marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>סה"כ חוב</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: "#f59e0b" }}>{fmt(loans.reduce((s,l) => s + l.remaining, 0))}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>תשלום חודשי כולל: {fmt(loans.reduce((s,l) => s + l.monthly, 0))}</div>
                </div>
              )}
              {loans.length === 0 && !showAddLoan && (
                <div style={{ textAlign: "center", padding: 60, color: "#9ca3af" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🏧</div>
                  <div>אין הלוואות — לחצי + הוסף הלוואה</div>
                </div>
              )}
              {loans.map(loan => {
                const paidPct = Math.round(((loan.amount - loan.remaining) / loan.amount) * 100);
                const linkedBank = banks.find(b => b.id === loan.bankId);
                return (
                  <div key={loan.id} onClick={() => setSelectedLoan(loan.id)} style={{ ...S.card, cursor: "pointer", border: "1px solid #f59e0b33" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{loan.name}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>{loan.type}{linkedBank ? " · " + linkedBank.name + " ****" + linkedBank.last4 : ""}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button onClick={e => { e.stopPropagation(); deleteLoan(loan.id); }} style={S.btnDanger}>🗑️</button>
                        <span style={{ fontWeight: 800, color: "#f59e0b", fontSize: 16 }}>{fmt(loan.remaining)}</span>
                        <span style={{ color: "#9ca3af" }}>›</span>
                      </div>
                    </div>
                    <div style={{ background: "#f0f0f0", borderRadius: 4, height: 6, marginBottom: 6 }}>
                      <div style={{ width: paidPct + "%", height: "100%", borderRadius: 4, background: "linear-gradient(90deg, #00b894, #00d4aa)" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9ca3af" }}>
                      <span>שולם {paidPct}%</span>
                      <span>חודשי: {fmt(loan.monthly)}</span>
                      <span>ריבית: {loan.rate}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* SAVINGS */}
        {tab === "savings" && (() => {
          const savingTypes = ["קרן פנסיה", "גמל להשקעה", "קרן השתלמות", "ביטוח מנהלים", "פוליסת חיסכון", "תיק השקעות", "מניות", "נדל״ן", "קריפטו", "אחר"];
          const addSaving = () => {
            if (!newSaving.name || !newSaving.amount) return;
            setSavings(prev => [...prev, { ...newSaving, id: "sav" + Date.now(), amount: Number(newSaving.amount) }]);
            setNewSaving({ name: "", type: "קרן פנסיה", owner: "", amount: "", company: "" });
            setShowAddSaving(false);
          };
          const totalSavingsAll = savings.reduce((s,sv) => s + Number(sv.amount||0), 0);
          const byOwner = savings.reduce((acc, s) => { const o = s.owner || "כללי"; if (!acc[o]) acc[o] = []; acc[o].push(s); return acc; }, {});
          return (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>💎 חסכונות והשקעות</h2>
                <button onClick={() => setShowAddSaving(true)} style={S.btn}>+ הוסף</button>
              </div>
              {savings.length > 0 && (
                <div style={{ ...S.card, background: "linear-gradient(135deg, #a78bfa15, #a78bfa05)", border: "1px solid #a78bfa44", marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>סה"כ</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: "#a78bfa" }}>{fmt(totalSavingsAll)}</div>
                </div>
              )}
              {showAddSaving && (
                <div style={{ ...S.card, border: "1px solid #a78bfa44", marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, marginBottom: 12 }}>חיסכון/השקעה חדשה</div>
                  <div style={{ display: "grid", gap: 10 }}>
                    <input value={newSaving.name} onChange={e => setNewSaving(p => ({ ...p, name: e.target.value }))} placeholder="שם (למשל: פנסיה מגדל)" style={S.input} />
                    <select value={newSaving.type} onChange={e => setNewSaving(p => ({ ...p, type: e.target.value }))} style={S.input}>
                      {savingTypes.map(t => <option key={t}>{t}</option>)}
                    </select>
                    <input value={newSaving.owner} onChange={e => setNewSaving(p => ({ ...p, owner: e.target.value }))} placeholder="בעלים (בר / דור)" style={S.input} />
                    <input value={newSaving.company} onChange={e => setNewSaving(p => ({ ...p, company: e.target.value }))} placeholder="חברה מנהלת" style={S.input} />
                    <input value={newSaving.amount} onChange={e => setNewSaving(p => ({ ...p, amount: e.target.value }))} placeholder="סכום נוכחי (₪)" type="number" style={S.input} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={addSaving} style={{ ...S.btn, flex: 1 }}>שמור</button>
                      <button onClick={() => setShowAddSaving(false)} style={{ ...S.btnGhost, flex: 1 }}>ביטול</button>
                    </div>
                  </div>
                </div>
              )}
              {savings.length === 0 && !showAddSaving && <div style={{ textAlign: "center", padding: 60, color: "#9ca3af" }}><div style={{ fontSize: 40, marginBottom: 12 }}>💎</div><div>הוסיפי חסכונות והשקעות</div></div>}
              {Object.entries(byOwner).map(([owner, ownerSavings]) => (
                <div key={owner} style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: "#6b7280", marginBottom: 8 }}>👤 {owner}</div>
                  {ownerSavings.map(sv => (
                    <div key={sv.id} style={{ ...S.card, border: "1px solid #a78bfa33", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div><div style={{ fontWeight: 700, fontSize: 13 }}>{sv.name}</div><div style={{ fontSize: 11, color: "#9ca3af" }}>{sv.type}{sv.company ? " · " + sv.company : ""}</div></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 800, color: "#a78bfa", fontSize: 16 }}>{fmt(Number(sv.amount||0))}</span>
                        <button onClick={() => setSavings(prev => prev.filter(s => s.id !== sv.id))} style={S.btnDanger}>🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
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
      {showSearch && (
        <div style={{ position: "fixed", inset: 0, background: "#fff", zIndex: 400, display: "flex", flexDirection: "column" }} dir="rtl">
          <div style={{ padding: "16px", borderBottom: "1px solid #e0ece0", display: "flex", gap: 10, alignItems: "center" }}>
            <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="חפש עסקה..." style={{ flex: 1, background: "#f5f7f5", border: "1px solid #d0e4d0", borderRadius: 8, padding: "10px 14px", fontSize: 15, fontFamily: "inherit", outline: "none" }} />
            <button onClick={() => { setShowSearch(false); setSearchQuery(""); }} style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", color: "#6b7280", fontFamily: "inherit" }}>ביטול</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {searchQuery.length > 1 && (() => {
              const results = transactions.filter(t => t.desc && t.desc.toLowerCase().includes(searchQuery.toLowerCase()));
              return (
                <div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 10 }}>{results.length} תוצאות</div>
                  {results.map(t => {
                    const acc = accounts.find(a => a.id === t.accountId);
                    return (
                      <div key={t.id} style={{ background: "#fff", borderRadius: 12, padding: 14, marginBottom: 8, border: "1px solid #e0ece0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{t.desc}</div>
                            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{t.date} · {t.category} · {acc ? acc.name + " ****" + acc.last4 : ""}</div>
                          </div>
                          <span style={{ fontWeight: 700, color: t.type === "income" ? "#00b894" : "#ff6b6b", fontSize: 15 }}>{t.type === "income" ? "+" : "-"}{fmt(t.amount)}</span>
                        </div>
                      </div>
                    );
                  })}
                  {results.length === 0 && <div style={{ textAlign: "center", padding: 60, color: "#9ca3af" }}>אין תוצאות</div>}
                </div>
              );
            })()}
            {searchQuery.length <= 1 && <div style={{ textAlign: "center", padding: 60, color: "#9ca3af" }}>הקלידי לפחות 2 תווים לחיפוש</div>}
          </div>
        </div>
      )}

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
