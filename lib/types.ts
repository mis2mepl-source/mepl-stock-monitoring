export type InventoryRow = {
  product_id: string;
  location_id: string;
  mepl_code: string;
  part_name: string;
  description: string | null;
  dimensions: string | null;
  unit: string;
  reorder_level: number;
  product_active: boolean;
  location_code: string;
  zone: string;
  quantity: number;
  updated_at: string;
  stock_status: 'ok' | 'low' | 'out';
};

export type MovementRow = {
  id: string;
  product_id: string;
  location_id: string;
  to_location_id: string | null;
  movement_type: 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT' | 'OPENING';
  quantity: number;
  reference_no: string | null;
  notes: string | null;
  performed_by: string | null;
  performed_at: string;
};

export type ProductRow = {
  id: string;
  mepl_code: string;
  part_name: string;
  description: string | null;
  dimensions: string | null;
  unit: string;
  reorder_level: number;
  is_active: boolean;
};

export type LocationRow = {
  id: string;
  code: string;
  zone: string | null;
  description: string | null;
  is_active: boolean;
};
