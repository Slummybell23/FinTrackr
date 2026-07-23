/**
 * Reading whatever CSV a bank exports: a quote-aware parser, column sniffing
 * so the mapping mostly guesses itself, and the mapping types a saved bank
 * profile remembers. All deterministic, all local.
 */

export interface CsvMapping {
  hasHeader: boolean;
  dateCol: number;
  descCol: number;
  /**
   * signed-neg-spend  — one amount column, negative means money out
   * signed-neg-income — one amount column, negative means money in
   * all-spend         — one amount column, every row is spending
   * debit-credit      — two columns, debits out and credits in
   */
  amountMode: "signed-neg-spend" | "signed-neg-income" | "all-spend" | "debit-credit";
  amountCol: number;
  debitCol: number;
  creditCol: number;
  dateFormat: "auto" | "mdy" | "dmy";
}

export interface NormalizedRow {
  date: string; // yyyy-MM-dd
  amount: number; // positive
  kind: "Expense" | "Income";
  description: string;
}

/** Comma, semicolon, or tab — whichever the text actually uses. */
function sniffDelimiter(text: string): string {
  const head = text.slice(0, 4000);
  const counts = [",", ";", "\t"].map((d) => ({
    d,
    n: head.split("\n").slice(0, 5).reduce((sum, line) => sum + line.split(d).length - 1, 0),
  }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ",";
}

/** Quote-aware delimited parsing; returns rows of cells, blank lines dropped. */
export function parseDelimited(text: string): string[][] {
  const delimiter = sniffDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((v) => v.trim().length > 0)) rows.push(row.map((v) => v.trim()));
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim().length > 0)) rows.push(row.map((v) => v.trim()));
  return rows;
}

/** "$1,234.56", "(45.00)", "1.234,56" → a number, or null when it isn't one. */
export function parseMoney(value: string): number | null {
  let text = value.trim().replace(/[$€£\s]/g, "");
  if (text.length === 0) return null;
  let negative = false;
  if (text.startsWith("(") && text.endsWith(")")) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1);
  }
  if (text.includes(",") && text.includes(".")) {
    // Whichever separator comes last is the decimal point.
    text = text.lastIndexOf(",") > text.lastIndexOf(".")
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "");
  } else if (/,\d{1,2}$/.test(text)) text = text.replace(",", ".");
  else text = text.replace(/,/g, "");
  const parsed = Number.parseFloat(text);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

/** A date cell into yyyy-MM-dd under the chosen (or guessed) day/month order. */
export function parseDate(value: string, format: CsvMapping["dateFormat"]): string | null {
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const triple = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(text);
  if (triple) {
    let [, a, b, y] = triple;
    const first = Number(a);
    const second = Number(b);
    const dayFirst = format === "dmy" || (format === "auto" && first > 12 && second <= 12);
    const month = dayFirst ? second : first;
    const day = dayFirst ? first : second;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // "Jul 3, 2026" and friends.
  const fallback = new Date(text);
  if (!Number.isNaN(fallback.getTime()) && /[a-zA-Z]/.test(text)) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${fallback.getFullYear()}-${pad(fallback.getMonth() + 1)}-${pad(fallback.getDate())}`;
  }
  return null;
}

/** Guess the mapping from the data itself; the user confirms or corrects. */
export function sniffMapping(rows: string[][]): CsvMapping {
  const width = Math.max(...rows.map((r) => r.length), 1);
  const head = rows.slice(0, 40);
  const dateScore = Array.from({ length: width }, (_, col) =>
    head.reduce((n, row) => n + (row[col] !== undefined && parseDate(row[col], "auto") !== null ? 1 : 0), 0),
  );
  let dateCol = 0;
  for (let col = 0; col < width; col++) if (dateScore[col] > dateScore[dateCol]) dateCol = col;

  const header = rows[0]?.map((h) => h.toLowerCase()) ?? [];
  const hasHeader = dateScore[dateCol] > 0 && rows[0] !== undefined
    && parseDate(rows[0][dateCol] ?? "", "auto") === null;
  const data = hasHeader ? rows.slice(1, 41) : head;

  const isMoney = (c: string) => c.trim() !== "" && parseMoney(c) !== null && parseDate(c, "auto") === null;
  const moneyScore = Array.from({ length: width }, (_, col) =>
    data.reduce((n, row) => n + (row[col] !== undefined && isMoney(row[col]) ? 1 : 0), 0),
  );
  // A column is money-shaped if every filled cell is money — sparse is fine
  // (a credit column with two deposits all month is still a credit column).
  const moneyOrBlank = (col: number) =>
    moneyScore[col] > 0 && data.every((row) => {
      const cell = (row[col] ?? "").trim();
      return cell === "" || isMoney(cell);
    });

  // Debit/credit split reveals itself through the header names.
  const headerCol = (re: RegExp) => {
    for (let col = 0; col < width; col++) {
      if (col !== dateCol && re.test(header[col] ?? "") && moneyOrBlank(col)) return col;
    }
    return -1;
  };
  const debitCol = hasHeader ? headerCol(/debit|withdraw|money out|paid out/) : -1;
  const creditCol = hasHeader ? headerCol(/credit|deposit|money in|paid in/) : -1;
  const splitMode = debitCol !== -1 && creditCol !== -1 && debitCol !== creditCol;

  const money: number[] = [];
  for (let col = 0; col < width; col++) {
    if (col !== dateCol && moneyScore[col] > data.length / 3) money.push(col);
  }
  const textScore = Array.from({ length: width }, (_, col) =>
    data.reduce((n, row) => n + Math.min((row[col] ?? "").replace(/[\d\s./-]/g, "").length, 24), 0),
  );
  let descCol = -1;
  for (let col = 0; col < width; col++) {
    if (col === dateCol || money.includes(col) || col === debitCol || col === creditCol) continue;
    if (descCol === -1 || textScore[col] > textScore[descCol]) descCol = col;
  }

  // Any negative amounts in a single column usually mean "negative is spending".
  const amountCol = splitMode ? 0 : (money[0] ?? -1);
  const sawNegative = !splitMode && amountCol >= 0
    && data.some((row) => (parseMoney(row[amountCol] ?? "") ?? 0) < 0);

  return {
    hasHeader,
    dateCol: Math.max(dateCol, 0),
    descCol: Math.max(descCol, 0),
    amountMode: splitMode ? "debit-credit" : sawNegative ? "signed-neg-spend" : "all-spend",
    amountCol: Math.max(amountCol, 0),
    debitCol: Math.max(debitCol, 0),
    creditCol: Math.max(creditCol, 0),
    dateFormat: "auto",
  };
}

/** Apply the mapping: raw cells → normalized rows the server can propose on. */
export function buildRows(
  rows: string[][],
  mapping: CsvMapping,
): { rows: NormalizedRow[]; skipped: number } {
  const body = mapping.hasHeader ? rows.slice(1) : rows;
  const out: NormalizedRow[] = [];
  let skipped = 0;

  for (const row of body) {
    const date = parseDate(row[mapping.dateCol] ?? "", mapping.dateFormat);
    const description = (row[mapping.descCol] ?? "").trim();

    let amount: number | null = null;
    let kind: "Expense" | "Income" = "Expense";
    if (mapping.amountMode === "debit-credit") {
      const debit = parseMoney(row[mapping.debitCol] ?? "");
      const credit = parseMoney(row[mapping.creditCol] ?? "");
      if (debit !== null && debit !== 0) {
        amount = Math.abs(debit);
        kind = "Expense";
      } else if (credit !== null && credit !== 0) {
        amount = Math.abs(credit);
        kind = "Income";
      }
    } else {
      const value = parseMoney(row[mapping.amountCol] ?? "");
      if (value !== null && value !== 0) {
        amount = Math.abs(value);
        if (mapping.amountMode === "all-spend") kind = "Expense";
        else if (mapping.amountMode === "signed-neg-spend") kind = value < 0 ? "Expense" : "Income";
        else kind = value < 0 ? "Income" : "Expense";
      }
    }

    if (date && amount && description) out.push({ date, amount, kind, description });
    else skipped++;
  }
  return { rows: out, skipped };
}
