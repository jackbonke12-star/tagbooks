// Inventory consumption + material helpers.
//
// The inventory model lives in two tables:
//   inventory_materials  -> one row per physical material (review sticker roll,
//                           blank NFC tag stock, adhesive, a filament roll, ...)
//   stock_movements      -> an append-only log of every +/- to a material.
//
// CONSUMPTION (lib/catalog) maps a product value to the materials a single unit
// consumes. consumeForSale() applies that when a sale is booked: it decrements
// the best-matching material of each kind and logs a stock_movement. It is
// deliberately best-effort and NEVER throws in a way that breaks the caller —
// a missing material just gets skipped and reported back.

import { CONSUMPTION } from './catalog';

// Human labels + ordering for the material kinds shown on the Inventory tab.
export const MATERIAL_KINDS = [
  { value: 'review_sticker', label: 'Google Review Stickers', unit: 'pcs' },
  { value: 'nfc_tag', label: 'NFC Tags', unit: 'pcs' },
  { value: 'adhesive', label: 'Adhesive', unit: 'ml' },
  { value: 'filament', label: 'Filament', unit: 'g' },
  { value: 'other', label: 'Other', unit: 'pcs' },
];

export function kindLabel(value) {
  const k = MATERIAL_KINDS.find((x) => x.value === value);
  return k ? k.label : value || 'Other';
}

export function defaultUnitForKind(value) {
  const k = MATERIAL_KINDS.find((x) => x.value === value);
  return k ? k.unit : 'pcs';
}

// How many units a sale consumes. Sales have no explicit quantity column today,
// so we look for sale.qty / sale.quantity and fall back to 1.
function saleMultiplier(sale) {
  const raw =
    sale && (sale.qty ?? sale.quantity ?? sale.inv_qty ?? sale.units);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// Pick the material row of `kind` to draw down: prefer the one with the lowest
// positive qty (use up nearly-empty rolls first), else fall back to the first
// row of that kind so a movement is still logged even when everything is at 0.
function pickMaterial(materials, kind) {
  const ofKind = materials.filter((m) => m.kind === kind);
  if (ofKind.length === 0) return null;
  const positive = ofKind
    .filter((m) => Number(m.qty || 0) > 0)
    .sort((a, b) => Number(a.qty || 0) - Number(b.qty || 0));
  return positive[0] || ofKind[0];
}

// Apply a delta to a material and log the movement. Returns true on success.
// `delta` negative = consume, positive = restock. qty is clamped at 0.
export async function adjustMaterial(supabase, material, delta, reason, ref) {
  const current = Number(material.qty || 0);
  const next = Math.max(0, current + Number(delta || 0));
  const { error } = await supabase
    .from('inventory_materials')
    .update({ qty: next })
    .eq('id', material.id);
  if (error) return false;
  // Log the ACTUAL change applied (after clamping), so the ledger reconciles.
  const applied = next - current;
  try {
    await supabase.from('stock_movements').insert({
      material_id: material.id,
      delta: applied,
      reason: reason || 'manual',
      ref: ref || null,
    });
  } catch {
    /* movement log is best-effort; the qty update is the source of truth */
  }
  return true;
}

// Decrement stock for a booked sale according to CONSUMPTION[sale.product].
// Signature is fixed: consumeForSale(supabase, sale). Multiplies each line by
// the sale quantity (defaults to 1). Best-effort + resilient: wraps everything
// so it can never throw into the caller. Returns:
//   { consumed: [{ kind, name, qty }], missing: [kind, ...] }
export async function consumeForSale(supabase, sale) {
  const result = { consumed: [], missing: [] };
  try {
    if (!supabase || !sale || !sale.product) return result;

    const lines = CONSUMPTION[sale.product];
    if (!Array.isArray(lines) || lines.length === 0) return result;

    const mult = saleMultiplier(sale);
    const ref = sale.id || null;
    const reason = 'sale:' + sale.product;

    // Load only the kinds we care about, once.
    const kinds = [...new Set(lines.map((l) => l.kind))];
    const { data: materials, error } = await supabase
      .from('inventory_materials')
      .select('*')
      .in('kind', kinds);
    if (error || !Array.isArray(materials)) return result;

    // Work on a local copy so multiple lines of the same kind draw down the
    // same in-memory qty and pick the emptiest remaining row each time.
    const pool = materials.map((m) => ({ ...m }));

    for (const line of lines) {
      const want = Number(line.qty || 0) * mult;
      if (!(want > 0)) continue;

      const mat = pickMaterial(pool, line.kind);
      if (!mat) {
        if (!result.missing.includes(line.kind)) result.missing.push(line.kind);
        continue;
      }

      const ok = await adjustMaterial(supabase, mat, -want, reason, ref);
      if (ok) {
        // Reflect the draw-down locally for subsequent lines.
        mat.qty = Math.max(0, Number(mat.qty || 0) - want);
        result.consumed.push({ kind: mat.kind, name: mat.name, qty: want });
      }
    }
  } catch {
    // Never break the sale that already saved.
  }
  return result;
}
