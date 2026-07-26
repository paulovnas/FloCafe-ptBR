/**
 * Integration coverage for the LAN waiter order pad contract:
 * waiter authorization, menu/table reads, new and existing table orders,
 * add-on/note persistence, table occupancy, and QR URL generation.
 *
 * Run: node tests/run-electron-node-test.cjs tests/waiter-ordering.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-waiter-ordering-'));

Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments);
};

const {
  initTestDb,
  createApp,
  startServer,
  seedCategory,
  seedProduct,
  seedTable,
  api,
  assert,
  assertEqual,
  assertIncludes,
  getResults,
  closeDatabase,
  now,
} = require('./helpers/test-setup');
const { authRoutes, getJWTSecret } = require('../main/routes/auth');
const { categoryRoutes } = require('../main/routes/categories');
const { productRoutes } = require('../main/routes/products');
const { tableRoutes } = require('../main/routes/tables');
const { orderRoutes } = require('../main/routes/orders');
const { posInfoRoutes } = require('../main/routes/pos-info');

interface TestStatement {
  run: (...params: unknown[]) => unknown;
}

interface TestDatabase {
  prepare: (sql: string) => TestStatement;
}

function readUserId(row: unknown): string | undefined {
  if (typeof row === 'object' && row !== null && 'user_id' in row && typeof row.user_id === 'string') {
    return row.user_id;
  }
  return undefined;
}

function readTableStatus(row: unknown): string | undefined {
  if (typeof row === 'object' && row !== null && 'status' in row && typeof row.status === 'string') {
    return row.status;
  }
  return undefined;
}

function seedStaff(db: TestDatabase, role: 'waiter' | 'chef', id: string): { authHeader: Record<string, string> } {
  const email = `${role}-${id}@test.local`;
  db.prepare(
    `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(id, `Test ${role}`, email, bcrypt.hashSync('testpass123', 10), role, now(), now());
  const token = jwt.sign({ userId: id, email, role }, getJWTSecret(), { expiresIn: '1h' });
  return { authHeader: { Authorization: `Bearer ${token}` } };
}

async function main() {
  console.log('Integration Test: Mobile Waiter Ordering');
  console.log('='.repeat(60));

  const db = initTestDb();
  const waiter = seedStaff(db, 'waiter', 'waiter-ordering-001');
  const chef = seedStaff(db, 'chef', 'chef-ordering-001');
  seedCategory(db, 'cat-waiter', 'Coffee');
  seedProduct(db, 'prod-coffee', 'cat-waiter', 'Coffee', 12, { tax_type: 'none' });
  seedProduct(db, 'prod-cake', 'cat-waiter', 'Cake', 8, { tax_type: 'none' });
  seedTable(db, 'table-waiter-01', 1, 4);
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run('language', 'pt', now());
  db.prepare(`INSERT INTO addon_groups (id, name, min_selection, max_selection, is_active)
    VALUES ('ag-waiter-milk', 'Milk', 0, 2, 1)`).run();
  db.prepare(`INSERT INTO addons (id, addon_group_id, name, price, is_active)
    VALUES ('addon-waiter-oat', 'ag-waiter-milk', 'Oat milk', 3, 1)`).run();
  db.prepare(`INSERT INTO addon_group_product (product_id, addon_group_id)
    VALUES ('prod-coffee', 'ag-waiter-milk')`).run();

  const app = createApp({
    '/api/auth': authRoutes,
    '/api/categories': categoryRoutes,
    '/api/products': productRoutes,
    '/api/tables': tableRoutes,
    '/api/orders': orderRoutes,
    '/api/pos-info': posInfoRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    console.log('\n1. Public pre-login locale');
    const publicInfo = await api(baseUrl, '/api/auth/public-info');
    assertEqual(publicInfo.status, 200, 'pre-login locale is available without authentication');
    assertEqual(publicInfo.data.language, 'pt', 'pre-login locale reflects the configured language');

    console.log('\n2. Waiter catalog and table access');
    const unauthenticated = await api(baseUrl, '/api/products?active=1');
    assertEqual(unauthenticated.status, 401, 'catalog rejects an unauthenticated LAN client');

    const [categories, products, tables] = await Promise.all([
      api(baseUrl, '/api/categories?active=1', { headers: waiter.authHeader }),
      api(baseUrl, '/api/products?active=1', { headers: waiter.authHeader }),
      api(baseUrl, '/api/tables?active=1', { headers: waiter.authHeader }),
    ]);
    assertEqual(categories.status, 200, 'waiter can load categories');
    assertEqual(products.status, 200, 'waiter can load products');
    assertEqual(tables.status, 200, 'waiter can load tables');
    const coffee = products.data.products.find((product: {
      id: string;
      addon_groups?: Array<{ addons?: Array<{ name: string }> }>;
    }) => product.id === 'prod-coffee');
    assertEqual(coffee?.addon_groups?.[0]?.addons?.[0]?.name, 'Oat milk', 'catalog includes configured add-ons');

    console.log('\n3. New table order');
    const created = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: waiter.authHeader,
      body: {
        table_id: 'table-waiter-01',
        type: 'dine_in',
        special_instructions: 'Serve together',
        items: [{
          product_id: 'prod-coffee',
          quantity: 1,
          special_instructions: 'No cinnamon',
          addons: [{ id: 'addon-waiter-oat', name: 'Oat milk', price: 3, quantity: 1 }],
        }],
      },
    });
    assertEqual(created.status, 201, 'waiter creates a dine-in order');
    const orderId = created.data.order.id;
    assertEqual(created.data.order.items[0].addons[0].name, 'Oat milk', 'selected add-on is returned with the order');
    assertEqual(created.data.order.items[0].special_instructions, 'No cinnamon', 'item note is persisted');
    assertEqual(created.data.order.special_instructions, 'Serve together', 'order note is persisted');
    const orderDetail = await api(baseUrl, `/api/orders/${orderId}`, { headers: waiter.authHeader });
    assertEqual(orderDetail.status, 200, 'waiter can load the occupied table order');
    assertEqual(orderDetail.data.order.items.length, 1, 'occupied table detail includes its existing items');
    const attribution = db.prepare('SELECT user_id FROM orders WHERE id = ?').get(orderId);
    assertEqual(
      readUserId(attribution),
      'waiter-ordering-001',
      'order is attributed to the authenticated waiter',
    );
    const tableState = db.prepare('SELECT status FROM tables WHERE id = ?').get('table-waiter-01');
    assertEqual(
      readTableStatus(tableState),
      'occupied',
      'new dine-in order marks the table occupied',
    );

    console.log('\n4. Continue an occupied table order');
    const appended = await api(baseUrl, `/api/orders/${orderId}/items`, {
      method: 'POST',
      headers: waiter.authHeader,
      body: { items: [{ product_id: 'prod-cake', quantity: 2 }] },
    });
    assertEqual(appended.status, 200, 'waiter can add items to the open table order');
    assertEqual(appended.data.order.items.length, 2, 'existing order contains both order lines');

    console.log('\n5. Role boundary');
    const denied = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: chef.authHeader,
      body: { table_id: 'table-waiter-01', type: 'dine_in', items: [{ product_id: 'prod-cake', quantity: 1 }] },
    });
    assertEqual(denied.status, 403, 'chef role cannot create orders from the waiter API flow');

    console.log('\n6. Waiter QR URL');
    const waiterInfo = await api(baseUrl, '/api/pos-info?mode=waiter', { headers: waiter.authHeader });
    assertEqual(waiterInfo.status, 200, 'waiter pairing info is available to authenticated staff');
    assertIncludes(waiterInfo.data.ip_url, '/waiter', 'direct-IP pairing URL targets the waiter route');
    assertIncludes(waiterInfo.data.mdns_url, '/waiter', 'mDNS pairing URL targets the waiter route');
    assert(
      waiterInfo.data.ips_data.every((entry: { url: string }) => entry.url.endsWith('/waiter')),
      'every network-interface URL targets the waiter route',
    );
    assert(
      typeof waiterInfo.data.qr_data_url === 'string' && waiterInfo.data.qr_data_url.startsWith('data:image/png;base64,'),
      'waiter pairing response contains a QR image',
    );

    const posInfo = await api(baseUrl, '/api/pos-info', { headers: waiter.authHeader });
    assert(!posInfo.data.ip_url.endsWith('/waiter'), 'default POS pairing URL remains unchanged');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    closeDatabase();
    Module._load = originalLoad;
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  const { passed, failed, total } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`${passed}/${total} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
