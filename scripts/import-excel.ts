/**
 * MEPL Stock Monitoring — Excel import CLI
 *
 * Usage:
 *   pnpm tsx scripts/import-excel.ts <path-to-xlsx> [--dry-run] [--commit]
 *
 * What it does:
 *   1. Parses "MEPL 2" (location-wise) and "ShaftStub" (catalog + Total Nos).
 *   2. Normalizes rows, catches bad data, and writes rejects to import_errors.
 *   3. Upserts products (unique on code + part + dimensions) and locations.
 *   4. Posts one OPENING stock_movement per (SKU, location) row.
 *   5. Reconciles: per-SKU sum(location balances) vs Sheet 2 Total Nos.
 *      Prints a report; deltas do NOT block the import — they surface for review.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment.
 */
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------- config ----------
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const args = process.argv.slice(2);
const filePath = args.find((a) => !a.startsWith('--'));
const DRY_RUN  = !args.includes('--commit');   // default is dry-run; must pass --commit
if (!filePath) {
  console.error('Provide a path to the xlsx file.');
  process.exit(1);
}

// ---------- types ----------
type Sheet1Row = {
  rowNumber: number;
  meplCode: string;
  partName: string;
  location: string;
  stock: number;
};

type Sheet2Row = {
  rowNumber: number;
  meplCode: string;      // may fall back from part name (e.g. "White Plate")
  partName: string;
  dimensions: string | null;
  totalNos: number;
};

type Rejected = { rowNumber: number; reason: string; raw: unknown };

// ---------- parsing ----------
function loadWorkbook(path: string) {
  const buf = readFileSync(resolve(path));
  return XLSX.read(buf, { type: 'buffer' });
}

function cleanStr(v: unknown): string {
  return (v ?? '').toString().trim();
}

function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  // Handle Indian-format numbers like "1,70,000"
  const s = v.toString().replace(/,/g, '').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function looksLikeDateSerial(v: string): boolean {
  // Excel date serials for post-2000 dates land in 36000-60000 range
  const n = Number(v);
  return Number.isFinite(n) && n > 30000 && n < 80000 && !v.includes('.');
}

function parseSheet1(ws: XLSX.WorkSheet): { rows: Sheet1Row[]; rejects: Rejected[] } {
  // Header is on row 2 in the source; use raw arrays and slice past it.
  const raw = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: null });
  const rows: Sheet1Row[] = [];
  const rejects: Rejected[] = [];

  for (let i = 2; i < raw.length; i++) {  // skip title row + header row
    const r = raw[i];
    if (!r || r.every((c: unknown) => c === null || c === '')) continue;

    const rowNumber = i + 1;
    const meplCode  = cleanStr(r[1]);
    const partName  = cleanStr(r[2]);
    const locRaw    = cleanStr(r[3]);
    const stockRaw  = r[4];

    // Reject: null code or numeric-only / date-serial part name
    if (!meplCode || meplCode.toLowerCase() === 'null') {
      rejects.push({ rowNumber, reason: 'missing mepl_code', raw: r });
      continue;
    }
    if (!partName || (looksLikeDateSerial(partName))) {
      rejects.push({ rowNumber, reason: 'invalid part_name (blank or date serial)', raw: r });
      continue;
    }

    // Multi-location cells like "PL-04 | PL-05" → reject if quantity can't be split
    const locations = locRaw.split('|').map((s) => s.trim()).filter(Boolean);
    if (locations.length === 0) {
      rejects.push({ rowNumber, reason: 'missing location', raw: r });
      continue;
    }
    if (locations.length > 1) {
      rejects.push({
        rowNumber,
        reason: `multiple locations in one cell (${locRaw}); split manually`,
        raw: r,
      });
      continue;
    }

    const stock = parseNumber(stockRaw);
    if (stock === null || stock < 0) {
      rejects.push({ rowNumber, reason: `invalid stock value: ${stockRaw}`, raw: r });
      continue;
    }

    rows.push({ rowNumber, meplCode, partName, location: locations[0], stock });
  }

  return { rows, rejects };
}

function parseSheet2(ws: XLSX.WorkSheet): { rows: Sheet2Row[]; rejects: Rejected[] } {
  const raw = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: null });
  const rows: Sheet2Row[] = [];
  const rejects: Rejected[] = [];

  for (let i = 2; i < raw.length; i++) {
    const r = raw[i];
    if (!r || r.every((c: unknown) => c === null || c === '')) continue;

    const rowNumber = i + 1;
    const codeOrPart = cleanStr(r[1]);   // "MEPL Code / Part"
    const description = cleanStr(r[2]);  // "Shaft", "Stub Pin", "-"
    const dimensions  = cleanStr(r[3]) || null;
    const total       = parseNumber(r[4]);

    if (!codeOrPart) {
      rejects.push({ rowNumber, reason: 'missing code/part', raw: r });
      continue;
    }
    if (total === null) {
      rejects.push({ rowNumber, reason: 'missing total_nos', raw: r });
      continue;
    }

    // Sheet 2 uses e.g. "White Plate" without a code — we backfill from Sheet 1 later
    rows.push({
      rowNumber,
      meplCode: codeOrPart,      // may be a code (F246) OR a part name (White Plate)
      partName: description || codeOrPart,
      dimensions,
      totalNos: total,
    });
  }

  return { rows, rejects };
}

// ---------- reconciliation & mapping ----------

/**
 * Sheet 2 lists SKUs by code OR by part-name. We need to map each Sheet 2 row
 * to the products it corresponds to in Sheet 1. Strategy:
 *   1. If codeOrPart matches a MEPL Code found in Sheet 1 → group by that code.
 *   2. Else treat it as a part_name (e.g. "White Plate") → find the code(s) in
 *      Sheet 1 whose part_name matches (case-insensitive).
 */
function buildReconciliation(sheet1: Sheet1Row[], sheet2: Sheet2Row[]) {
  const codesInSheet1 = new Set(sheet1.map((r) => r.meplCode.toUpperCase()));
  const partsInSheet1 = new Map<string, Set<string>>(); // partName(lower) -> Set<meplCode>
  for (const r of sheet1) {
    const key = r.partName.toLowerCase();
    if (!partsInSheet1.has(key)) partsInSheet1.set(key, new Set());
    partsInSheet1.get(key)!.add(r.meplCode);
  }

  type ReconRow = {
    sheet2Row: Sheet2Row;
    resolvedCode: string | null;
    resolvedPart: string;
    sheet1Sum: number;
    delta: number;
    note: string;
  };
  const recon: ReconRow[] = [];

  for (const s2 of sheet2) {
    let resolvedCode: string | null = null;
    let resolvedPart = s2.partName;
    let note = '';

    if (codesInSheet1.has(s2.meplCode.toUpperCase())) {
      resolvedCode = s2.meplCode;
      // partName in Sheet 2 is often the *category* ("Stub Pin"); use as-is.
    } else {
      // Try treating s2.meplCode as a part name
      const codes = partsInSheet1.get(s2.meplCode.toLowerCase());
      if (codes && codes.size === 1) {
        resolvedCode = [...codes][0];
        resolvedPart = s2.meplCode;   // the actual part name
        note = `resolved by part-name lookup → code ${resolvedCode}`;
      } else if (codes && codes.size > 1) {
        note = `ambiguous: part-name maps to codes [${[...codes].join(', ')}]`;
      } else {
        note = `no match in Sheet 1`;
      }
    }

    // Sum Sheet 1 rows matching (code, dimensions filter is impossible here — Sheet 1 has no dims)
    // So the sum is per code+part_name; recon note flags when dimensions split this further.
    let sheet1Sum = 0;
    if (resolvedCode) {
      const codeUpper = resolvedCode.toUpperCase();
      sheet1Sum = sheet1
        .filter((r) => r.meplCode.toUpperCase() === codeUpper && r.partName.toLowerCase() === resolvedPart.toLowerCase())
        .reduce((s, r) => s + r.stock, 0);

      // If we couldn't match by part, fall back to code-only
      if (sheet1Sum === 0) {
        sheet1Sum = sheet1
          .filter((r) => r.meplCode.toUpperCase() === codeUpper)
          .reduce((s, r) => s + r.stock, 0);
        if (sheet1Sum > 0) note = (note ? note + '; ' : '') + 'matched by code only (part_name differs)';
      }
    }

    recon.push({
      sheet2Row: s2,
      resolvedCode,
      resolvedPart,
      sheet1Sum,
      delta: sheet1Sum - s2.totalNos,
      note,
    });
  }

  return recon;
}

function printReconciliationReport(recon: ReturnType<typeof buildReconciliation>) {
  console.log('\n═══ Reconciliation: Sheet 1 sum vs Sheet 2 Total Nos ═══\n');
  const rows = recon.map((r) => ({
    code: r.resolvedCode ?? '—',
    part: r.resolvedPart,
    dims: r.sheet2Row.dimensions ?? '',
    total_nos: r.sheet2Row.totalNos,
    sheet1_sum: r.sheet1Sum,
    delta: r.delta,
    note: r.note,
  }));
  console.table(rows);

  const matched   = rows.filter((r) => r.delta === 0 && r.sheet1_sum > 0).length;
  const mismatch  = rows.filter((r) => r.delta !== 0).length;
  const unmatched = rows.filter((r) => r.sheet1_sum === 0).length;
  console.log(`Summary: ${matched} matched · ${mismatch} mismatched · ${unmatched} unmatched`);
}

// ---------- upserts ----------
async function upsertLocations(rows: Sheet1Row[]) {
  const unique = [...new Set(rows.map((r) => r.location))].map((code) => ({ code }));
  const { error } = await supabase.from('locations').upsert(unique, { onConflict: 'code' });
  if (error) throw new Error(`upsert locations: ${error.message}`);
  const { data } = await supabase.from('locations').select('id, code');
  return new Map((data ?? []).map((l) => [l.code, l.id as string]));
}

async function upsertProducts(sheet1: Sheet1Row[], sheet2: Sheet2Row[]) {
  // SKU key from Sheet 1 = (code, part_name), no dimensions available there.
  // Enrich with Sheet 2 (description, dimensions) when a match exists.
  const sheet2ByCode = new Map<string, Sheet2Row[]>();
  for (const s of sheet2) {
    const k = s.meplCode.toUpperCase();
    if (!sheet2ByCode.has(k)) sheet2ByCode.set(k, []);
    sheet2ByCode.get(k)!.push(s);
  }

  const seen = new Set<string>();
  const products: { mepl_code: string; part_name: string; description: string | null; dimensions: string | null }[] = [];

  for (const r of sheet1) {
    const key = `${r.meplCode.toUpperCase()}||${r.partName.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Find best Sheet 2 match: same code, and (if multiple dim variants) leave dims NULL
    // and let admin split later. If only ONE variant for that code exists, use its dims.
    const s2rows = sheet2ByCode.get(r.meplCode.toUpperCase()) ?? [];
    const bestS2 = s2rows.length === 1 ? s2rows[0] : null;

    // Try to find a Sheet 2 entry whose partName matches this row's partName; else
    // fall back to the single-variant match if code has only one dim variant.
    const partMatch = s2rows.find((s) => s.partName.toLowerCase() === r.partName.toLowerCase());
    const enrich = partMatch ?? bestS2;

    products.push({
      mepl_code: r.meplCode,
      part_name: r.partName,
      description: null,               // description in Sheet 2 is a category ("Shaft"); leave null for now
      dimensions: enrich?.dimensions ?? null,
    });
  }

  const { error } = await supabase
    .from('products')
    .upsert(products, { onConflict: 'mepl_code,part_name,dimensions', ignoreDuplicates: false });
  if (error) throw new Error(`upsert products: ${error.message}`);

  // Load back with ids
  const { data } = await supabase.from('products').select('id, mepl_code, part_name, dimensions');
  const map = new Map<string, string>();
  for (const p of data ?? []) {
    const key = `${p.mepl_code.toUpperCase()}||${(p.part_name as string).toLowerCase()}||${p.dimensions ?? ''}`;
    map.set(key, p.id as string);
    // Also index by (code, part) without dims for Sheet 1 lookups
    if (!p.dimensions) {
      map.set(`${p.mepl_code.toUpperCase()}||${(p.part_name as string).toLowerCase()}||`, p.id as string);
    }
  }
  return map;
}

async function createBatch(sheetName: string, rowCount: number, errorCount: number) {
  const { data, error } = await supabase
    .from('import_batches')
    .insert({
      source_file: filePath!,
      sheet_name: sheetName,
      row_count: rowCount,
      error_count: errorCount,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error) throw new Error(`create batch: ${error.message}`);
  return data!.id as string;
}

async function logRejects(batchId: string, rejects: Rejected[]) {
  if (rejects.length === 0) return;
  const rows = rejects.map((r) => ({
    batch_id: batchId,
    row_number: r.rowNumber,
    reason: r.reason,
    raw_row: r.raw as object,
  }));
  const { error } = await supabase.from('import_errors').insert(rows);
  if (error) throw new Error(`log rejects: ${error.message}`);
}

async function postOpeningMovements(
  rows: Sheet1Row[],
  productMap: Map<string, string>,
  locationMap: Map<string, string>,
  batchId: string,
) {
  // Sum duplicates within the batch: same (code, part, location) → sum stock
  const grouped = new Map<string, { productId: string; locationId: string; qty: number }>();
  const unresolved: Rejected[] = [];

  for (const r of rows) {
    const productId  = productMap.get(`${r.meplCode.toUpperCase()}||${r.partName.toLowerCase()}||`);
    const locationId = locationMap.get(r.location);
    if (!productId || !locationId) {
      unresolved.push({ rowNumber: r.rowNumber, reason: 'could not resolve product or location', raw: r });
      continue;
    }
    const key = `${productId}||${locationId}`;
    const prev = grouped.get(key);
    if (prev) prev.qty += r.stock;
    else grouped.set(key, { productId, locationId, qty: r.stock });
  }

  if (unresolved.length) await logRejects(batchId, unresolved);

  const movements = [...grouped.values()]
    .filter((g) => g.qty > 0)
    .map((g) => ({
      product_id: g.productId,
      location_id: g.locationId,
      movement_type: 'OPENING',
      quantity: g.qty,
      reference_no: `IMPORT/${batchId.slice(0, 8)}`,
      notes: 'Initial import from stock_monitoring_board.xlsx',
      batch_id: batchId,
    }));

  // Chunk for safety
  const CHUNK = 500;
  for (let i = 0; i < movements.length; i += CHUNK) {
    const slice = movements.slice(i, i + CHUNK);
    const { error } = await supabase.from('stock_movements').insert(slice);
    if (error) throw new Error(`insert movements chunk ${i}: ${error.message}`);
    console.log(`  ...inserted ${Math.min(i + CHUNK, movements.length)}/${movements.length} movements`);
  }

  return movements.length;
}

// ---------- main ----------
async function main() {
  console.log(`Reading ${filePath}${DRY_RUN ? ' (DRY RUN — pass --commit to write)' : ' (COMMIT MODE)'}`);
  const wb = loadWorkbook(filePath!);

  const s1ws = wb.Sheets['MEPL 2'];
  const s2ws = wb.Sheets['ShaftStub'];
  if (!s1ws || !s2ws) {
    console.error('Expected sheets "MEPL 2" and "ShaftStub" — not found.');
    process.exit(1);
  }

  const { rows: s1Rows, rejects: s1Rejects } = parseSheet1(s1ws);
  const { rows: s2Rows, rejects: s2Rejects } = parseSheet2(s2ws);

  console.log(`\nSheet 1 (MEPL 2):   ${s1Rows.length} valid rows · ${s1Rejects.length} rejects`);
  console.log(`Sheet 2 (ShaftStub): ${s2Rows.length} valid rows · ${s2Rejects.length} rejects`);
  if (s1Rejects.length) {
    console.log('\nSheet 1 rejects:');
    console.table(s1Rejects.map((r) => ({ row: r.rowNumber, reason: r.reason })));
  }

  const recon = buildReconciliation(s1Rows, s2Rows);
  printReconciliationReport(recon);

  if (DRY_RUN) {
    console.log('\nDry run complete. Re-run with --commit to actually import.');
    return;
  }

  // -------- COMMIT PATH --------
  console.log('\nCommitting…');
  const batchId = await createBatch('MEPL 2', s1Rows.length, s1Rejects.length);
  console.log(`  batch_id: ${batchId}`);

  await logRejects(batchId, s1Rejects);

  const locationMap = await upsertLocations(s1Rows);
  console.log(`  locations upserted: ${locationMap.size}`);

  const productMap = await upsertProducts(s1Rows, s2Rows);
  console.log(`  products upserted: ${new Set([...productMap.values()]).size}`);

  const movementsCount = await postOpeningMovements(s1Rows, productMap, locationMap, batchId);
  console.log(`  opening movements posted: ${movementsCount}`);

  await supabase.from('import_batches').update({ status: 'committed' }).eq('id', batchId);
  console.log('\n✓ Import committed.');
  console.log('  Review the reconciliation table above — mismatched SKUs need physical verification.');
}

main().catch((err) => {
  console.error('\n✗ Import failed:', err);
  process.exit(1);
});
