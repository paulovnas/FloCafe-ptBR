import { Router, Request, Response } from 'express';
import { getDatabase, now } from '../db';
import { requireRole } from '../middleware/security';

const router = Router();

function shape(row: any) {
  if (!row) return row;
  return {
    ...row,
    delivery_fee: Number(row.delivery_fee) || 0,
    is_active: Boolean(row.is_active),
  };
}

// GET /api/neighborhoods — list all (active by default, ?include_inactive=1 for all)
router.get('/', requireRole('owner', 'manager', 'cashier', 'waiter'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const includeInactive = req.query.include_inactive === '1';
    const rows = db.prepare(
      `SELECT * FROM neighborhoods ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY sort_order, name`,
    ).all();
    res.json({ neighborhoods: rows.map(shape) });
  } catch (error: any) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/neighborhoods/:id
router.get('/:id', requireRole('owner', 'manager', 'cashier', 'waiter'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM neighborhoods WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Neighborhood not found' });
    res.json({ neighborhood: shape(row) });
  } catch (error: any) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/neighborhoods — create
router.post('/', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { name, delivery_fee, is_active, sort_order } = req.body;
    const trimmed = String(name || '').trim();
    if (!trimmed) return res.status(400).json({ error: 'Name is required' });

    const dup = db.prepare('SELECT id FROM neighborhoods WHERE LOWER(name) = LOWER(?)').get(trimmed);
    if (dup) return res.status(409).json({ error: 'A neighborhood with this name already exists' });

    const fee = Number(delivery_fee);
    const result = db.prepare(`
      INSERT INTO neighborhoods (name, delivery_fee, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      trimmed,
      Number.isFinite(fee) && fee >= 0 ? fee : 0,
      is_active === false || is_active === 0 ? 0 : 1,
      Number.isInteger(sort_order) ? sort_order : 0,
      now(),
      now(),
    );
    const row = db.prepare('SELECT * FROM neighborhoods WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ neighborhood: shape(row) });
  } catch (error: any) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/neighborhoods/:id — update
router.put('/:id', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM neighborhoods WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Neighborhood not found' });

    const { name, delivery_fee, is_active, sort_order } = req.body;
    const trimmed = name !== undefined ? String(name).trim() : (existing as any).name;
    if (!trimmed) return res.status(400).json({ error: 'Name is required' });

    if (trimmed.toLowerCase() !== String((existing as any).name).toLowerCase()) {
      const dup = db.prepare('SELECT id FROM neighborhoods WHERE LOWER(name) = LOWER(?) AND id != ?').get(trimmed, req.params.id);
      if (dup) return res.status(409).json({ error: 'A neighborhood with this name already exists' });
    }

    const fee = delivery_fee !== undefined ? Number(delivery_fee) : Number((existing as any).delivery_fee);
    db.prepare(`
      UPDATE neighborhoods
      SET name = ?, delivery_fee = ?, is_active = ?, sort_order = ?, updated_at = ?
      WHERE id = ?
    `).run(
      trimmed,
      Number.isFinite(fee) && fee >= 0 ? fee : 0,
      is_active === false || is_active === 0 ? 0 : 1,
      sort_order !== undefined ? (Number.isInteger(Number(sort_order)) ? Number(sort_order) : 0) : (existing as any).sort_order,
      now(),
      req.params.id,
    );
    const row = db.prepare('SELECT * FROM neighborhoods WHERE id = ?').get(req.params.id);
    res.json({ neighborhood: shape(row) });
  } catch (error: any) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/neighborhoods/:id — soft-deactivate (never hard-delete: addresses/orders reference it)
router.delete('/:id', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const existing = db.prepare('SELECT id FROM neighborhoods WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Neighborhood not found' });
    db.prepare('UPDATE neighborhoods SET is_active = 0, updated_at = ? WHERE id = ?').run(now(), req.params.id);
    res.json({ message: 'Neighborhood deactivated' });
  } catch (error: any) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as neighborhoodRoutes };
