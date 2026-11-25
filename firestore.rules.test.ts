/**
 * Payload-First Security Verification Suite for Krono Atelier Firestore Rules.
 * Documents the 12 adversarial Dirty Dozen assertions evaluated against DRAFT_firestore.rules / firestore.rules.
 */

export interface SecurityTestCase {
  id: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  actor: 'anonymous' | 'customerA' | 'unverifiedAdminEmail' | 'admin';
  payload?: Record<string, unknown>;
  expected: 'ALLOW' | 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: SecurityTestCase[] = [
  {
    id: 'DD-01-self-assigned-admin',
    collection: 'users/customerA',
    operation: 'create',
    actor: 'customerA',
    payload: { uid: 'customerA', name: 'Mallory', role: 'admin', preferences: [], purchasedProductIds: [] },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-02-shadow-field-product',
    collection: 'products/prod_x',
    operation: 'create',
    actor: 'admin',
    payload: { id: 'prod_x', isFeaturedHack: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-03-unverified-admin-spoof',
    collection: 'products/prod_x',
    operation: 'delete',
    actor: 'unverifiedAdminEmail',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-04-cross-user-cart',
    collection: 'cart/customerB_prod1',
    operation: 'create',
    actor: 'customerA',
    payload: { userId: 'customerB', productId: 'prod1', quantity: 1 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-05-cross-user-order-read',
    collection: 'orders/ord_customerB',
    operation: 'get',
    actor: 'customerA',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-06-id-poisoning',
    collection: 'wishlist/' + 'a'.repeat(160),
    operation: 'create',
    actor: 'customerA',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-07-timestamp-forgery',
    collection: 'orders/ord_1',
    operation: 'create',
    actor: 'customerA',
    payload: { createdAt: '1999-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-08-negative-price',
    collection: 'products/prod_1',
    operation: 'create',
    actor: 'admin',
    payload: { price: -10, stock: 5 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-09-terminal-order-reversal',
    collection: 'orders/ord_shipped',
    operation: 'update',
    actor: 'customerA',
    payload: { status: 'Confirmed' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-10-pii-blanket-read',
    collection: 'users/customerB/private/info',
    operation: 'get',
    actor: 'customerA',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-11-unbounded-tags',
    collection: 'products/prod_1',
    operation: 'create',
    actor: 'admin',
    payload: { tags: Array.from({ length: 25 }, (_, i) => `t${i}`) },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-12-empty-order-items',
    collection: 'orders/ord_empty',
    operation: 'create',
    actor: 'customerA',
    payload: { items: [] },
    expected: 'PERMISSION_DENIED',
  },
];
