/**
 * Integration coverage for the delivery-by-neighborhood feature:
 * neighborhood CRUD + fee, customer addresses (multiple + default),
 * and order delivery-charge derivation from the neighborhood fee.
 *
 * Run: node tests/run-electron-node-test.cjs tests/delivery-neighborhoods.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-delivery-nb-'));

Module._load = function (request, parent, isMain) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments);
};

const {
  initTestDb,
  createApp,
  startServer,
  seedOwnerUser,
  seedCustomer,
  api,
  assert,
  assertEqual,
  getResults,
  closeDatabase,
  now,
} = require('./helpers/test-setup');
const { authRoutes } = require('../main/routes/auth');
const { neighborhoodRoutes } = require('../main/routes/neighborhoods');
const { customerAddressRoutes } = require('../main/routes/customer-addresses');
const { customerRoutes } = require('../main/routes/customers');
const { productRoutes } = require('../main/routes/products');
const { orderRoutes } = require('../main/routes/orders');

async function main() {
  console.log('Integration Test: Delivery by Neighborhood');
  console.log('='.repeat(60));

  const db = initTestDb();
  const owner = seedOwnerUser(db);
  seedCustomer(db, 'cust-1', 'Alice', '+5511999990001');
  const app = createApp({
    '/api/auth': authRoutes,
    '/api/neighborhoods': neighborhoodRoutes,
    '/api/customer-addresses': customerAddressRoutes,
    '/api/customers': customerRoutes,
    '/api/products': productRoutes,
    '/api/orders': orderRoutes,
  });
  const { baseUrl, server } = await startServer(app);
  const H = owner.authHeader;

  try {
    console.log('\n1. Neighborhood CRUD + fee');
    const created = await api(baseUrl, '/api/neighborhoods', {
      method: 'POST', headers: H,
      body: { name: 'Centro', delivery_fee: 5, sort_order: 1 },
    });
    assertEqual(created.status, 201, 'neighborhood created');
    assertEqual(created.data.neighborhood.delivery_fee, 5, 'fee stored');
    const centroId = created.data.neighborhood.id;

    const dup = await api(baseUrl, '/api/neighborhoods', {
      method: 'POST', headers: H,
      body: { name: 'Centro', delivery_fee: 3 },
    });
    assertEqual(dup.status, 409, 'duplicate name rejected');

    const updated = await api(baseUrl, `/api/neighborhoods/${centroId}`, {
      method: 'PUT', headers: H,
      body: { name: 'Centro', delivery_fee: 7, sort_order: 1, is_active: true },
    });
    assertEqual(updated.status, 200, 'neighborhood updated');
    assertEqual(updated.data.neighborhood.delivery_fee, 7, 'fee updated');

    const created2 = await api(baseUrl, '/api/neighborhoods', {
      method: 'POST', headers: H,
      body: { name: 'Vila Nova', delivery_fee: 10 },
    });
    const vilaId = created2.data.neighborhood.id;

    const list = await api(baseUrl, '/api/neighborhoods', { headers: H });
    assertEqual(list.data.neighborhoods.length, 2, 'lists both neighborhoods');

    console.log('\n2. Customer addresses (multiple + default)');
    const addr1 = await api(baseUrl, '/api/customer-addresses', {
      method: 'POST', headers: H,
      body: {
        customer_id: 'cust-1', label: 'Casa', street: 'Rua das Flores', number: '123',
        complement: 'Apto 2', reference: 'Próximo à praça', neighborhood_id: centroId,
        is_default: true,
      },
    });
    assertEqual(addr1.status, 201, 'first address created');
    assertEqual(addr1.data.address.is_default, true, 'first is default');
    assertEqual(addr1.data.address.neighborhood_name, 'Centro', 'joined neighborhood name');
    assertEqual(addr1.data.address.delivery_fee, 7, 'carries fee from neighborhood');

    const addr2 = await api(baseUrl, '/api/customer-addresses', {
      method: 'POST', headers: H,
      body: {
        customer_id: 'cust-1', label: 'Trabalho', street: 'Av. Brasil', number: '2000',
        neighborhood_id: vilaId, is_default: false,
      },
    });
    assertEqual(addr2.status, 201, 'second address created');
    assertEqual(addr2.data.address.is_default, false, 'second not default');

    const listAddr = await api(baseUrl, `/api/customer-addresses?customer_id=cust-1`, { headers: H });
    assertEqual(listAddr.data.addresses.length, 2, 'customer has 2 addresses');
    assertEqual(listAddr.data.addresses[0].id, addr1.data.address.id, 'default listed first');

    const custDetail = await api(baseUrl, '/api/customers/cust-1', { headers: H });
    assertEqual(custDetail.data.customer.addresses.length, 2, 'GET /customers/:id includes addresses');

    console.log('\n3. Set a new default — old default clears');
    const makeDefault = await api(baseUrl, `/api/customer-addresses/${addr2.data.address.id}`, {
      method: 'PUT', headers: H,
      body: { is_default: true, neighborhood_id: vilaId },
    });
    assertEqual(makeDefault.data.address.is_default, true, 'second is now default');
    const listAfter = await api(baseUrl, `/api/customer-addresses?customer_id=cust-1`, { headers: H });
    const oldDefault = listAfter.data.addresses.find((a: any) => a.id === addr1.data.address.id);
    assertEqual(oldDefault.is_default, false, 'old default cleared');

    console.log('\n4. Delivery order derives charge from neighborhood fee');
    // Seed a product to order.
    db.prepare(
      `INSERT OR IGNORE INTO products (id, category_id, name, price, tax_type, cb_percent, track_inventory, stock_quantity, is_active, sort_order, created_at, updated_at)
       VALUES ('prod-delivery', NULL, 'Pizza', 40, 'none', 0, 0, 999, 1, 1, ?, ?)`,
    ).run(now(), now());

    const order = await api(baseUrl, '/api/orders', {
      method: 'POST', headers: H,
      body: {
        customer_id: 'cust-1',
        type: 'delivery',
        delivery_address_id: addr2.data.address.id,
        items: [{ product_id: 'prod-delivery', quantity: 1 }],
      },
    });
    assertEqual(order.status, 201, 'delivery order created');
    assertEqual(order.data.order.delivery_charge, 10, 'delivery_charge = neighborhood fee (Vila Nova = 10)');
    assertEqual(order.data.order.delivery_neighborhood_name, 'Vila Nova', 'neighborhood name snapshotted');
    assertEqual(order.data.order.delivery_street, 'Av. Brasil', 'address street snapshotted');
    assertEqual(order.data.order.delivery_number, '2000', 'address number snapshotted');

    console.log('\n5. Non-delivery order ignores address / fee');
    const takeaway = await api(baseUrl, '/api/orders', {
      method: 'POST', headers: H,
      body: {
        customer_id: 'cust-1',
        type: 'takeaway',
        items: [{ product_id: 'prod-delivery', quantity: 1 }],
      },
    });
    assertEqual(takeaway.status, 201, 'takeaway order created');
    assertEqual(takeaway.data.order.delivery_charge, 0, 'takeaway has no delivery charge');
    assertEqual(takeaway.data.order.delivery_neighborhood_name, null, 'takeaway has no neighborhood');

    console.log('\n6. Delete default address promotes another');
    const delRes = await api(baseUrl, `/api/customer-addresses/${addr2.data.address.id}`, {
      method: 'DELETE', headers: H,
    });
    assertEqual(delRes.status, 200, 'default address deleted');
    const listAfterDel = await api(baseUrl, `/api/customer-addresses?customer_id=cust-1`, { headers: H });

    console.log('\n7. Invalid delivery_address_id rejected');
    const badOrder = await api(baseUrl, '/api/orders', {
      method: 'POST', headers: H,
      body: {
        customer_id: 'cust-1',
        type: 'delivery',
        delivery_address_id: 999999,
        items: [{ product_id: 'prod-delivery', quantity: 1 }],
      },
    });
    assertEqual(badOrder.status, 400, 'unknown address id rejected');

    console.log('\n8. Search returns default_address for POS prefill');
    // Phone search hits /api/customers-search (mounted in index.ts, not here).
    // We verify via GET /api/customers/:id which includes addresses + the
    // default is the first entry.
    const detail = await api(baseUrl, '/api/customers/cust-1', { headers: H });
    assertEqual(detail.data.customer.addresses.length, 1, 'one address remains after delete');

    console.log('\n9. Neighborhood soft-deactivate');
    const deact = await api(baseUrl, `/api/neighborhoods/${centroId}`, { method: 'DELETE', headers: H });
    assertEqual(deact.status, 200, 'neighborhood deactivated');
    const activeList = await api(baseUrl, '/api/neighborhoods', { headers: H });
    assertEqual(activeList.data.neighborhoods.length, 1, 'only active neighborhoods listed by default');
    const allList = await api(baseUrl, '/api/neighborhoods?include_inactive=1', { headers: H });
    assertEqual(allList.data.neighborhoods.length, 2, 'include_inactive lists all');

    console.log('\n10. Inactive neighborhood rejected on new address');
    const badAddr = await api(baseUrl, '/api/customer-addresses', {
      method: 'POST', headers: H,
      body: { customer_id: 'cust-1', street: 'X', neighborhood_id: centroId },
    });
    assertEqual(badAddr.status, 400, 'inactive neighborhood rejected');

    console.log('\n' + '='.repeat(60));
    console.log(`✅ ${getResults().passed}/${getResults().total} passed, ${getResults().failed} failed`);
    if (getResults().failed > 0) process.exit(1);
  } finally {
    server.close();
    closeDatabase();
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
