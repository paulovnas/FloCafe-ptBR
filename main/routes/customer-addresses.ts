import { Router, Request, Response } from 'express';
import { getDatabase, now } from '../db';
import { requireRole } from '../middleware/security';

const router = Router();

function shapeAddress(row: any) {
  if (!row) return row;
  return {
    ...row,
    delivery_fee: Number(row.delivery_fee) || 0,
    is_default: Boolean(row.is_default),
  };
}

const ADDRESS_FIELDS = 'ca.id, ca.customer_id, ca.label, ca.street, ca.number, ca.complement, ca.reference, ca.neighborhood_id, ca.is_default, ca.created_at, ca.updated_at, n.name AS neighborhood_name, n.delivery_fee AS delivery_fee';

function listForCustomer(customerId: string) {
  const db = getDatabase();
  return db.prepare(`
    SELECT ${ADDRESS_FIELDS}
    FROM customer_addresses ca
    LEFT JOIN neighborhoods n ON n.id = ca.neighborhood_id
    WHERE ca.customer_id = ?
    ORDER BY ca.is_default DESC, ca.id ASC
  `).all(customerId);
}

// GET /api/customer-addresses?customer_id=
router.get('/', requireRole('owner', 'manager', 'cashier', 'waiter'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const customerId = String(req.query.customer_id || '');
    if (!customerId) return res.status(400).json({ error: 'customer_id is required' });
    // Existence check — don't leak addresses of unknown customers.
    const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json({ addresses: listForCustomer(customerId).map(shapeAddress) });
  } catch (error: any) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/customer-addresses
router.post('/', requireRole('owner', 'manager', 'cashier', 'waiter'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const {
      customer_id, label, street, number, complement, reference,
      neighborhood_id, is_default,
    } = req.body;

    const customerId = String(customer_id || '').trim();
    if (!customerId) return res.status(400).json({ error: 'customer_id is required' });

    const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    if (neighborhood_id !== undefined && neighborhood_id !== null) {
      const nb = db.prepare('SELECT id FROM neighborhoods WHERE id = ? AND is_active = 1').get(neighborhood_id);
      if (!nb) return res.status(400).json({ error: 'Neighborhood not found or inactive' });
    }

    const makeDefault = is_default === true || is_default === 1;
    const ts = now();

    const result = db.transaction(() => {
      if (makeDefault) {
        db.prepare('UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?').run(customerId);
      }
      return db.prepare(`
        INSERT INTO customer_addresses
          (customer_id, label, street, number, complement, reference, neighborhood_id, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        customerId,
        label ? String(label).trim() : null,
        street ? String(street).trim() : null,
        number ? String(number).trim() : null,
        complement ? String(complement).trim() : null,
        reference ? String(reference).trim() : null,
        neighborhood_id ?? null,
        makeDefault ? 1 : 0,
        ts,
        ts,
      );
    })();

    const row = db.prepare(`
      SELECT ${ADDRESS_FIELDS}
      FROM customer_addresses ca
      LEFT JOIN neighborhoods n ON n.id = ca.neighborhood_id
      WHERE ca.id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json({ address: shapeAddress(row) });
  } catch (error: any) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/customer-addresses/:id
router.put('/:id', requireRole('owner', 'manager', 'cashier'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM customer_addresses WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Address not found' });

    const { label, street, number, complement, reference, neighborhood_id, is_default } = req.body;

    if (neighborhood_id !== undefined && neighborhood_id !== null) {
      const nb = db.prepare('SELECT id FROM neighborhoods WHERE id = ? AND is_active = 1').get(neighborhood_id);
      if (!nb) return res.status(400).json({ error: 'Neighborhood not found or inactive' });
    }

    const makeDefault = is_default === true || is_default === 1;
    const ts = now();

    db.transaction(() => {
      if (makeDefault) {
        db.prepare('UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?').run(existing.customer_id);
      }
      db.prepare(`
        UPDATE customer_addresses
        SET label = ?, street = ?, number = ?, complement = ?, reference = ?,
            neighborhood_id = ?, is_default = ?, updated_at = ?
        WHERE id = ?
      `).run(
        label !== undefined ? (label ? String(label).trim() : null) : existing.label,
        street !== undefined ? (street ? String(street).trim() : null) : existing.street,
        number !== undefined ? (number ? String(number).trim() : null) : existing.number,
        complement !== undefined ? (complement ? String(complement).trim() : null) : existing.complement,
        reference !== undefined ? (reference ? String(reference).trim() : null) : existing.reference,
        neighborhood_id !== undefined ? neighborhood_id : existing.neighborhood_id,
        makeDefault ? 1 : (existing.is_default ? 1 : 0),
        ts,
        req.params.id,
      );
    })();

    const row = db.prepare(`
      SELECT ${ADDRESS_FIELDS}
      FROM customer_addresses ca
      LEFT JOIN neighborhoods n ON n.id = ca.neighborhood_id
      WHERE ca.id = ?
    `).get(req.params.id);
    res.json({ address: shapeAddress(row) });
  } catch (error: any) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/customer-addresses/:id — hard delete (no FK history; orders snapshot the address)
router.delete('/:id', requireRole('owner', 'manager', 'cashier'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const existing = db.prepare('SELECT id, customer_id, is_default FROM customer_addresses WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Address not found' });

    db.transaction(() => {
      // Orders snapshot the address columns (street/number/neighborhood/fee),
      // so dropping the FK reference keeps the historical order intact.
      db.prepare('UPDATE orders SET delivery_address_id = NULL WHERE delivery_address_id = ?').run(req.params.id);
      db.prepare('DELETE FROM customer_addresses WHERE id = ?').run(req.params.id);
      // If we removed the default, promote the first remaining address.
      if (existing.is_default) {
        const next = db.prepare('SELECT id FROM customer_addresses WHERE customer_id = ? ORDER BY id ASC LIMIT 1').get(existing.customer_id) as any;
        if (next) db.prepare('UPDATE customer_addresses SET is_default = 1 WHERE id = ?').run(next.id);
      }
    })();

    res.json({ message: 'Address deleted' });
  } catch (error: any) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as customerAddressRoutes };
