'use server';

import { revalidatePath } from 'next/cache';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

// ---------- shared types ----------
export type Sheet1Row = {
  rowNumber: number;
  meplCode: string;
  partName: string;
  location: string;
  stock: number;
};

export type Sheet2Row = {
  rowNumber: number;
  meplCode: string;
  partName: string;
  dimensions: string | null;
  totalNos: number;
};

export type ImportReject = { rowNumber: number; reason: string; sheet: 'MEPL 2' | 'ShaftStub' };

export type ReconRow = {
  code: string;
  part: string;
  dims: string;
  totalNos: number;
  sheet1Sum: number;
  delta: number;
  note: string;
};

export type PreviewResult =
  | {
      ok: true;
      sheet1Rows: Sheet1Row[];
      sheet2Rows: Sheet2Row[];
      rejects: ImportReject[];
      reconciliation: ReconRow[];
      uniqueSkus: number;
      uniqueLocations: number;
    }
  | { ok: false; error: string };

export type CommitResult =
  | { ok: true; batchId: string; skusUpserted: number; locationsUpserted: number; movementsPosted: number; rejects: number }
  | { ok: false; error: string };

// ---------- shared helpers ----------
async function requireAdmin(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') throw new Error('Admin role required');
  return user.id;
}

function cleanStr(v: unknown): string {
  return (v ?? '').toString().trim();
}
function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const s = v.toString().replace(/,/g, '').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function looksLikeDateSerial(v: string): boolean {
  const n = Number(v);
  return Number.isFinite(n) && n > 30000 && n < 80000 && !v.includes('.');
}

function parseSheet1(ws: XLSX.WorkSheet): { rows: Sheet1Row[]; rejects: ImportReject[] } {
  const raw = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: null });
  const rows: Sheet1Row[] = [];
  const rejects: ImportReject[] = [];

  for (let i = 2; i < raw.length; i++) {
    const r = raw[i];
    if (!r || r.every((c: unknown) => c === null || c === '')) continue;

    const rowNumber = i + 1;
    const meplCode = cleanStr(r[1]);
    const partName = cleanStr(r[2]);
    const locRaw = cleanStr(r[3]);
    const stockRaw = r[4];

    if (!meplCode || meplCode.toLowerCase() === 'null') {
      rejects.push({ rowNumber, reason: 'missing mepl_code', sheet: 'MEPL 2' });
      continue;
    }
    if (!partName || looksLikeDateSerial(partName)) {
      rejects.push({ rowNumber, reason: 'invalid part_name (blank or date serial)', sheet: 'MEPL 2' });
      continue;
    }

    const locations = locRaw.split('|').map((s) => s.trim()).filter(Boolean);
    if (locations.length === 0) {
      rejects.push({ rowNumber, reason: 'missing location', sheet: 'MEPL 2' });
      continue;
    }
    if (locations.length > 1) {
      rejects.push({
        rowNumber,
        reason: `multi-location cell (${locRaw}) — split manually`,
        sheet: 'MEPL 2',
      });
      continue;
    }

    const stock = parseNumber(stockRaw);
    if (stock === null || stock < 0) {
      rejects.push({ rowNumber, reason: `invalid stock value: ${stockRaw}`, sheet: 'MEPL 2' });
      continue;
    }

    rows.push({ rowNumber, meplCode, partName, location: locations[0], stock });
  }
  return { rows, rejects };
}

function parseSheet2(ws: XLSX.WorkSheet): { rows: Sheet2Row[]; rejects: ImportReject[] } {
  const raw = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: null });
  const rows: Sheet2Row[] = [];
  const rejects: ImportReject[] = [];

  for (let i = 2; i < raw.length; i++) {
    const r = raw[i];
    if (!r || r.every((c: unknown) => c === null || c === '')) continue;

    const rowNumber = i + 1;
    const codeOrPart = cleanStr(r[1]);
    const description = cleanStr(r[2]);
    const dimensions = cleanStr(r[3]) || null;
    const total = parseNumber(r[4]);

    if (!codeOrPart) {
      rejects.push({ rowNumber, reason: 'missing code/part', sheet: 'ShaftStub' });
      continue;
    }
    if (total === null) {
      rejects.push({ rowNumber, reason: 'missing total_nos', sheet: 'ShaftStub' });
      continue;
    }

    rows.push({
      rowNumber,
      meplCode: codeOrPart,
      partName: description || codeOrPart,
      dimensions,
      totalNos: total,
    });
  }
  return { rows, rejects };
}

function buildReconciliation(sheet1: Sheet1Row[], sheet2: Sheet2Row[]): ReconRow[] {
  const codesInSheet1 = new Set(sheet1.map((r) => r.meplCode.toUpperCase()));
  const partsInSheet1 = new Map<string, Set<string>>();
  for (const r of sheet1) {
    const key = r.partName.toLowerCase();
    if (!partsInSheet1.has(key)) partsInSheet1.set(key, new Set());
    partsInSheet1.get(key)!.add(r.meplCode);
  }

  const recon: ReconRow[] = [];
  for (const s2 of sheet2) {
    let resolvedCode: string | null = null;
    let resolvedPart = s2.partName;
    let note = '';

    if (codesInSheet1.has(s2.meplCode.toUpperCase())) {
      resolvedCode = s2.meplCode;
    } else {
      const codes = partsInSheet1.get(s2.meplCode.toLowerCase());
      if (codes && codes.size === 1) {
        resolvedCode = [...codes][0];
        resolvedPart = s2.meplCode;
        note = `matched by part-name → code ${resolvedCode}`;
      } else if (codes && codes.size > 1) {
        note = `ambiguous: maps to [${[...codes].join(', ')}]`;
      } else {
        note = 'no match in Sheet 1';
      }
    }

    let sheet1Sum = 0;
    if (resolvedCode) {
      const codeUpper = resolvedCode.toUpperCase();
      sheet1Sum = sheet1
        .filter((r) => r.meplCode.toUpperCase() === codeUpper && r.partName.toLowerCase() === resolvedPart.toLowerCase())
        .reduce((s, r) => s + r.stock, 0);
      if (sheet1Sum === 0) {
        sheet1Sum = sheet1
          .filter((r) => r.meplCode.toUpperCase() === codeUpper)
          .reduce((s, r) => s + r.stock, 0);
        if (sheet1Sum > 0) note = (note ? note + '; ' : '') + 'matched by code only';
      }
    }

    recon.push({
      code: resolvedCode ?? '—',
      part: resolvedPart,
      dims: s2.dimensions ?? '',
      totalNos: s2.totalNos,
      sheet1Sum,
      delta: sheet1Sum - s2.totalNos,
      note,
    });
  }
  return recon;
}

async function parseWorkbook(formData: FormData) {
  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    throw new Error('No file provided');
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const s1ws = wb.Sheets['MEPL 2'];
  const s2ws = wb.Sheets['ShaftStub'];
  if (!s1ws || !s2ws) {
    throw new Error('Expected sheets "MEPL 2" and "ShaftStub" — not found in the uploaded file.');
  }
  const s1 = parseSheet1(s1ws);
  const s2 = parseSheet2(s2ws);
  return { s1, s2, filename: file.name };
}

// ---------- action: preview ----------
export async function previewImport(formData: FormData): Promise<PreviewResult> {
  try {
    await requireAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Auth check failed' };
  }

  try {
    const { s1, s2 } = await parseWorkbook(formData);
    const uniqueSkus = new Set(s1.rows.map((r) => `${r.meplCode}||${r.partName.toLowerCase()}`)).size;
    const uniqueLocations = new Set(s1.rows.map((r) => r.location)).size;
    const rejects = [...s1.rejects, ...s2.rejects];
    return {
      ok: true,
      sheet1Rows: s1.rows,
      sheet2Rows: s2.rows,
      rejects,
      reconciliation: buildReconciliation(s1.rows, s2.rows),
      uniqueSkus,
      uniqueLocations,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to parse file' };
  }
}

// ---------- action: commit ----------
export async function commitImport(formData: FormData): Promise<CommitResult> {
  let userId: string;
  try {
    userId = await requireAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Auth check failed' };
  }

  let s1: Sheet1Row[];
  let s1Rejects: ImportReject[];
  let s2: Sheet2Row[];
  let filename: string;
  try {
    const parsed = await parseWorkbook(formData);
    s1 = parsed.s1.rows;
    s1Rejects = parsed.s1.rejects;
    s2 = parsed.s2.rows;
    filename = parsed.filename;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Parse failed' };
  }

  const service = createServiceClient();

  // Create import batch
  const { data: batch, error: batchErr } = await service
    .from('import_batches')
    .insert({
      source_file: filename,
      sheet_name: 'MEPL 2',
      imported_by: userId,
      row_count: s1.length,
      error_count: s1Rejects.length,
      status: 'pending',
    })
    .select('id')
    .single();
  if (batchErr) return { ok: false, error: `create batch: ${batchErr.message}` };
  const batchId = batch!.id as string;

  // Log rejects
  if (s1Rejects.length) {
    const rows = s1Rejects.map((r) => ({
      batch_id: batchId,
      row_number: r.rowNumber,
      reason: r.reason,
      raw_row: r as unknown as object,
    }));
    await service.from('import_errors').insert(rows);
  }

  // Upsert locations
  const uniqueLocs = [...new Set(s1.map((r) => r.location))].map((code) => ({ code }));
  const { error: locErr } = await service.from('locations').upsert(uniqueLocs, { onConflict: 'code' });
  if (locErr) return { ok: false, error: `upsert locations: ${locErr.message}` };
  const { data: allLocs } = await service.from('locations').select('id, code');
  const locationMap = new Map((allLocs ?? []).map((l) => [l.code, l.id as string]));

  // Upsert products (enrich with dimensions when Sheet 2 has a single matching variant)
  const sheet2ByCode = new Map<string, Sheet2Row[]>();
  for (const s of s2) {
    const k = s.meplCode.toUpperCase();
    if (!sheet2ByCode.has(k)) sheet2ByCode.set(k, []);
    sheet2ByCode.get(k)!.push(s);
  }

  const seen = new Set<string>();
  const productsToUpsert: {
    mepl_code: string;
    part_name: string;
    description: string | null;
    dimensions: string | null;
  }[] = [];
  for (const r of s1) {
    const key = `${r.meplCode.toUpperCase()}||${r.partName.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const s2rows = sheet2ByCode.get(r.meplCode.toUpperCase()) ?? [];
    const partMatch = s2rows.find((s) => s.partName.toLowerCase() === r.partName.toLowerCase());
    const bestS2 = s2rows.length === 1 ? s2rows[0] : null;
    const enrich = partMatch ?? bestS2;
    productsToUpsert.push({
      mepl_code: r.meplCode,
      part_name: r.partName,
      description: null,
      dimensions: enrich?.dimensions ?? null,
    });
  }

  const { error: prodErr } = await service
    .from('products')
    .upsert(productsToUpsert, { onConflict: 'mepl_code,part_name,dimensions' });
  if (prodErr) return { ok: false, error: `upsert products: ${prodErr.message}` };

  const { data: allProducts } = await service.from('products').select('id, mepl_code, part_name, dimensions');
  const productMap = new Map<string, string>();
  for (const p of allProducts ?? []) {
    // Index by (code, part, no-dims) so Sheet 1 rows (no dims) can find their product
    productMap.set(
      `${(p.mepl_code as string).toUpperCase()}||${(p.part_name as string).toLowerCase()}||`,
      p.id as string,
    );
  }

  // Group and post OPENING movements
  const grouped = new Map<string, { productId: string; locationId: string; qty: number }>();
  const unresolved: { rowNumber: number; reason: string }[] = [];
  for (const r of s1) {
    const productId = productMap.get(`${r.meplCode.toUpperCase()}||${r.partName.toLowerCase()}||`);
    const locationId = locationMap.get(r.location);
    if (!productId || !locationId) {
      unresolved.push({ rowNumber: r.rowNumber, reason: 'could not resolve product or location' });
      continue;
    }
    const key = `${productId}||${locationId}`;
    const prev = grouped.get(key);
    if (prev) prev.qty += r.stock;
    else grouped.set(key, { productId, locationId, qty: r.stock });
  }

  if (unresolved.length) {
    await service.from('import_errors').insert(
      unresolved.map((u) => ({
        batch_id: batchId,
        row_number: u.rowNumber,
        reason: u.reason,
        raw_row: null,
      })),
    );
  }

  const movements = [...grouped.values()]
    .filter((g) => g.qty > 0)
    .map((g) => ({
      product_id: g.productId,
      location_id: g.locationId,
      movement_type: 'OPENING',
      quantity: g.qty,
      reference_no: `IMPORT/${batchId.slice(0, 8)}`,
      notes: `In-app import of ${filename}`,
      batch_id: batchId,
      performed_by: userId,
    }));

  const CHUNK = 500;
  for (let i = 0; i < movements.length; i += CHUNK) {
    const slice = movements.slice(i, i + CHUNK);
    const { error } = await service.from('stock_movements').insert(slice);
    if (error) return { ok: false, error: `insert movements: ${error.message}` };
  }

  await service.from('import_batches').update({ status: 'committed' }).eq('id', batchId);

  revalidatePath('/inventory');
  revalidatePath('/');
  revalidatePath('/movements');

  return {
    ok: true,
    batchId,
    skusUpserted: productsToUpsert.length,
    locationsUpserted: uniqueLocs.length,
    movementsPosted: movements.length,
    rejects: s1Rejects.length + unresolved.length,
  };
}
