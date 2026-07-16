'use server';

import { createClient } from '@/lib/supabase/server';
import { format } from 'date-fns';

const MOVEMENT_TYPES = ['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT', 'OPENING'] as const;

type ExportInput = {
  from?: string;
  to?: string;
  type?: string;
  locationId?: string;
  search?: string;
};

type ExportResult = { ok: true; csv: string; count: number } | { ok: false; error: string };

const CSV_ROW_CAP = 20000; // hard safety limit

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function exportMovementsCsv(input: ExportInput): Promise<ExportResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  let query = supabase
    .from('stock_movements')
    .select(
      `
      id, movement_type, quantity, reference_no, notes, performed_at,
      products(mepl_code, part_name, dimensions, unit),
      locations!stock_movements_location_id_fkey(code),
      to_location:locations!stock_movements_to_location_id_fkey(code)
    `,
    )
    .order('performed_at', { ascending: false })
    .limit(CSV_ROW_CAP);

  if (input.from) query = query.gte('performed_at', `${input.from}T00:00:00`);
  if (input.to) query = query.lte('performed_at', `${input.to}T23:59:59`);
  if (input.type && MOVEMENT_TYPES.includes(input.type as (typeof MOVEMENT_TYPES)[number])) {
    query = query.eq('movement_type', input.type);
  }
  if (input.locationId) {
    query = query.or(`location_id.eq.${input.locationId},to_location_id.eq.${input.locationId}`);
  }

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };

  let rows = data ?? [];
  if (input.search) {
    const q = input.search.toLowerCase();
    rows = rows.filter((m: any) => {
      return (
        (m.products?.mepl_code ?? '').toLowerCase().includes(q) ||
        (m.products?.part_name ?? '').toLowerCase().includes(q) ||
        (m.reference_no ?? '').toLowerCase().includes(q)
      );
    });
  }

  const header = [
    'When',
    'Type',
    'MEPL Code',
    'Part Name',
    'Dimensions',
    'Unit',
    'From Location',
    'To Location',
    'Quantity',
    'Reference No',
    'Notes',
  ].join(',');

  const lines = rows.map((m: any) => {
    return [
      csvEscape(format(new Date(m.performed_at), 'yyyy-MM-dd HH:mm:ss')),
      csvEscape(m.movement_type),
      csvEscape(m.products?.mepl_code),
      csvEscape(m.products?.part_name),
      csvEscape(m.products?.dimensions),
      csvEscape(m.products?.unit),
      csvEscape(m.locations?.code),
      csvEscape(m.to_location?.code),
      csvEscape(m.quantity),
      csvEscape(m.reference_no),
      csvEscape(m.notes),
    ].join(',');
  });

  const csv = [header, ...lines].join('\n');
  return { ok: true, csv, count: rows.length };
}
