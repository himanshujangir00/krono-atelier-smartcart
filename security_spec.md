# Security Specification & Payload-First Verification

## 1. Data Invariants
1. **Identity Integrity**: Every user-owned document (`users/{uid}`, `users/{uid}/private/info`, `cart/{cartItemId}`, `wishlist/{wishlistItemId}`, `browsing_history/{historyId}`, `recommendations/{uid}`, `orders/{orderId}`) must carry a UID matching `request.auth.uid`, and `uid`/`userId` is immutable after creation.
2. **Privilege Escalation Prevention**: Customers can only create `users/{uid}` with `role == 'customer'` and cannot self-assign `role == 'admin'` or write to `admins/{uid}`.
3. **PII Isolation**: User emails and shipping addresses live in `users/{uid}/private/info` and `orders/{orderId}`, readable strictly by the owning user or verified admins.
4. **Catalog Protection**: Only verified admins (`exists(/databases/$(database)/documents/admins/$(request.auth.uid))` or verified bootstrapped admin `hj704838@gmail.com`) can create, edit, or delete `products` and `categories`. Customers may only decrement stock / increment `salesCount` when atomically accompanied by an `orders` write (`existsAfter`) or admin action.
5. **Terminal State Locking**: Orders with `status == 'Shipped'` are locked against non-admin updates.
6. **Strict Timestamps & Key Whitelists**: Every write uses `request.time` for `createdAt`/`updatedAt`/`addedAt`/`lastViewedAt`/`computedAt` and validates exact allowed keys via `hasAll` and `hasOnly`.

## 2. Dirty Dozen Attack Payloads (All Must Fail with `PERMISSION_DENIED`)
1. **Self-Assigned Admin Role**: `POST /users/uid_1` with `{ uid: 'uid_1', name: 'Mallory', role: 'admin', ... }` -> Denied (`role` must be `'customer'`).
2. **Shadow Field Injection**: `POST /products/p1` with extra `{ isFeaturedHack: true }` -> Denied (`keys().hasOnly(...)`).
3. **Unverified Admin Email Spoof**: Request with `token.email == 'hj704838@gmail.com'` and `token.email_verified == false` -> Denied (`email_verified == true` required).
4. **Cross-User Cart Theft**: User A reads/lists `cart` without `userId == request.auth.uid` or writes `cart/uidB_p1` -> Denied.
5. **Cross-User Order Snooping**: User A reads `orders/ord_userB` -> Denied (`existing().userId == request.auth.uid || isAdmin()`).
6. **ID Poisoning**: Document ID > 128 chars or containing spaces/slashes (`isValidId` fails) -> Denied.
7. **Timestamp Forgery**: Creating `orders/ord_1` with client-supplied past `createdAt` instead of `request.time` -> Denied.
8. **Negative Price / Stock Poisoning**: Creating or updating `products/p1` with `price: -50` or `stock: -1` -> Denied.
9. **Terminal Order Reversal**: Customer updating an order whose `status == 'Shipped'` back to `'Confirmed'` -> Denied.
10. **PII Blanket Read**: Signed-in User A reading `users/uid_B/private/info` -> Denied.
11. **Unbounded Tag Array Injection**: Creating `products/p1` with 25 tags -> Denied (`tags.size() <= 10`).
12. **Orphaned Order Item**: Creating `orders/ord_1` with `items: []` or > 20 items -> Denied (`items.size() >= 1 && items.size() <= 20`).
