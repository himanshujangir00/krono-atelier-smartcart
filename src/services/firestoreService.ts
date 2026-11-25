import type { User as FirebaseUser } from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  OperationType,
  db,
  handleFirestoreError,
  storage,
} from '../firebase.ts';
import { SEED_CATEGORIES, SEED_ORDERS, SEED_PRODUCTS } from '../server/seedData.ts';
import type {
  BrowsingHistoryItem,
  CartItem,
  CategoryInfo,
  Order,
  PersonalizedRecommendation,
  Product,
  UserProfile,
  WishlistItem,
} from '../types.ts';

function toIsoString(val: unknown): string {
  if (val && typeof (val as { toDate?: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof val === 'string' && val.length > 0) return val;
  return new Date().toISOString();
}

export function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120);
  return cleaned || `id-${Date.now()}`;
}

function clampStr(val: string, max: number): string {
  return val.trim().slice(0, max);
}

// ---------------------------------------------------------
// Subscriptions (Real-Time Firestore Listeners)
// ---------------------------------------------------------
export function subscribeProducts(
  onData: (products: Product[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const path = 'products';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list: Product[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id ?? d.id),
          sku: String(data.sku ?? ''),
          name: String(data.name ?? ''),
          category: String(data.category ?? ''),
          price: Number(data.price ?? 0),
          rating: Number(data.rating ?? 4.5),
          reviewCount: Number(data.reviewCount ?? 0),
          salesCount: Number(data.salesCount ?? 0),
          stock: Number(data.stock ?? 0),
          tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
          material: String(data.material ?? ''),
          dimensions: String(data.dimensions ?? ''),
          description: String(data.description ?? ''),
          imageUrl: String(data.imageUrl ?? ''),
          createdAt: toIsoString(data.createdAt),
        };
      });
      onData(list);
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export function subscribeCategories(
  onData: (categories: CategoryInfo[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const path = 'categories';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list: CategoryInfo[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          name: String(data.name ?? d.id),
          description: String(data.description ?? ''),
        };
      });
      onData(list);
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export function subscribeOrders(
  uid: string,
  isAdmin: boolean,
  onData: (orders: Order[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const path = 'orders';
  const q = isAdmin
    ? collection(db, path)
    : query(collection(db, path), where('userId', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: Order[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id ?? d.id),
          userId: data.userId ? String(data.userId) : null,
          customerName: String(data.customerName ?? ''),
          customerEmail: String(data.customerEmail ?? ''),
          shippingAddress: String(data.shippingAddress ?? ''),
          items: Array.isArray(data.items) ? data.items : [],
          subtotal: Number(data.subtotal ?? 0),
          shippingFee: Number(data.shippingFee ?? 0),
          total: Number(data.total ?? 0),
          status: (data.status as Order['status']) ?? 'Confirmed',
          createdAt: toIsoString(data.createdAt),
        };
      });
      onData(list);
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export function subscribeCart(
  uid: string,
  onData: (entries: Array<{ productId: string; quantity: number }>) => void
): () => void {
  const path = 'cart';
  const q = query(collection(db, path), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          productId: String(data.productId),
          quantity: Math.max(1, Math.floor(Number(data.quantity ?? 1))),
        };
      });
      onData(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export function subscribeWishlist(
  uid: string,
  onData: (items: WishlistItem[]) => void
): () => void {
  const path = 'wishlist';
  const q = query(collection(db, path), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: WishlistItem[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          userId: String(data.userId),
          productId: String(data.productId),
          addedAt: toIsoString(data.addedAt),
        };
      });
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export function subscribeBrowsingHistory(
  uid: string,
  onData: (items: BrowsingHistoryItem[]) => void
): () => void {
  const path = 'browsing_history';
  const q = query(collection(db, path), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: BrowsingHistoryItem[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          userId: String(data.userId),
          productId: String(data.productId),
          category: String(data.category ?? ''),
          viewCount: Math.max(1, Math.floor(Number(data.viewCount ?? 1))),
          lastViewedAt: toIsoString(data.lastViewedAt),
        };
      });
      list.sort((a, b) => b.lastViewedAt.localeCompare(a.lastViewedAt));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

// ---------------------------------------------------------
// User Profile & Role Management
// ---------------------------------------------------------
export async function checkIsAdminUser(fbUser: FirebaseUser): Promise<boolean> {
  if (!fbUser.emailVerified) return false;
  if (fbUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL) return true;
  try {
    const adminSnap = await getDoc(doc(db, 'admins', sanitizeId(fbUser.uid)));
    return adminSnap.exists();
  } catch {
    return false;
  }
}

export async function ensureUserProfile(
  fbUser: FirebaseUser,
  nameOverride?: string,
  initialPreferences?: string[]
): Promise<UserProfile> {
  const uid = sanitizeId(fbUser.uid);
  const isAdmin = await checkIsAdminUser(fbUser);
  const fallbackName = clampStr(
    nameOverride || fbUser.displayName || fbUser.email?.split('@')[0] || 'Studio Member',
    100
  );

  if (!fbUser.emailVerified) {
    return {
      id: uid,
      name: fallbackName,
      email: fbUser.email ?? '',
      role: 'customer',
      preferences: initialPreferences ?? ['acoustic', 'aluminum', 'minimalist'],
      purchasedProductIds: [],
      isManager: false,
      emailVerified: false,
      createdAt: new Date().toISOString(),
    };
  }

  const userRef = doc(db, 'users', uid);
  const privateRef = doc(db, 'users', uid, 'private', 'info');

  try {
    const userSnap = await getDoc(userRef);
    const privateSnap = await getDoc(privateRef);

    if (!userSnap.exists()) {
      const cleanPrefs = (initialPreferences ?? ['acoustic', 'aluminum', 'minimalist'])
        .map((t) => clampStr(t.toLowerCase(), 40))
        .filter(Boolean)
        .slice(0, 15);
      const role: 'customer' | 'admin' = isAdmin ? 'admin' : 'customer';

      const batch = writeBatch(db);
      batch.set(userRef, {
        uid,
        name: fallbackName,
        role,
        preferences: cleanPrefs,
        purchasedProductIds: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(privateRef, {
        uid,
        email: clampStr(fbUser.email ?? `${uid}@user.local`, 200),
        defaultShippingAddress: '',
        updatedAt: serverTimestamp(),
      });
      await batch.commit();

      return {
        id: uid,
        name: fallbackName,
        email: fbUser.email ?? '',
        defaultShippingAddress: '',
        role,
        preferences: cleanPrefs,
        purchasedProductIds: [],
        isManager: isAdmin,
        emailVerified: true,
        createdAt: new Date().toISOString(),
      };
    }

    const uData = userSnap.data();
    const pData = privateSnap.exists() ? privateSnap.data() : {};
    const effectiveRole: 'customer' | 'admin' =
      isAdmin || uData.role === 'admin' ? 'admin' : 'customer';

    return {
      id: uid,
      name: String(uData.name ?? fallbackName),
      email: String(pData.email ?? fbUser.email ?? ''),
      defaultShippingAddress: String(pData.defaultShippingAddress ?? ''),
      role: effectiveRole,
      preferences: Array.isArray(uData.preferences) ? uData.preferences.map(String) : [],
      purchasedProductIds: Array.isArray(uData.purchasedProductIds)
        ? uData.purchasedProductIds.map(String)
        : [],
      isManager: effectiveRole === 'admin',
      emailVerified: true,
      createdAt: toIsoString(uData.createdAt),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}`);
  }
}

export async function updateUserProfileAndPreferences(
  uid: string,
  updates: {
    name?: string;
    preferences?: string[];
    defaultShippingAddress?: string;
    email?: string;
  }
): Promise<void> {
  const safeUid = sanitizeId(uid);
  try {
    const batch = writeBatch(db);
    const userPayload: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.name !== undefined) {
      userPayload.name = clampStr(updates.name, 100);
    }
    if (updates.preferences !== undefined) {
      userPayload.preferences = Array.from(
        new Set(updates.preferences.map((p) => clampStr(p.toLowerCase(), 40)).filter(Boolean))
      ).slice(0, 15);
    }
    batch.update(doc(db, 'users', safeUid), userPayload);

    if (updates.defaultShippingAddress !== undefined) {
      const privateRef = doc(db, 'users', safeUid, 'private', 'info');
      const existingPrivate = await getDoc(privateRef);
      if (existingPrivate.exists()) {
        batch.update(privateRef, {
          defaultShippingAddress: clampStr(updates.defaultShippingAddress, 300),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(privateRef, {
          uid: safeUid,
          email: clampStr(updates.email ?? `${safeUid}@user.local`, 200),
          defaultShippingAddress: clampStr(updates.defaultShippingAddress, 300),
          updatedAt: serverTimestamp(),
        });
      }
    }

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${safeUid}`);
  }
}

// ---------------------------------------------------------
// Seeding Initial Catalog to Firestore (Admin Only)
// ---------------------------------------------------------
export async function seedInitialCatalogIfEmpty(): Promise<number> {
  try {
    const existingProducts = await getDocs(collection(db, 'products'));
    if (!existingProducts.empty) {
      return 0;
    }

    const batch = writeBatch(db);

    for (const cat of SEED_CATEGORIES) {
      const catId = sanitizeId(cat.name.toLowerCase());
      batch.set(doc(db, 'categories', catId), {
        id: catId,
        name: clampStr(cat.name, 60),
        description: clampStr(cat.description, 300),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    for (const prod of SEED_PRODUCTS) {
      const prodId = sanitizeId(prod.id);
      batch.set(doc(db, 'products', prodId), {
        id: prodId,
        sku: clampStr(prod.sku, 40),
        name: clampStr(prod.name, 140),
        category: clampStr(prod.category, 60),
        price: Number(prod.price),
        rating: Number(prod.rating),
        reviewCount: Math.floor(prod.reviewCount),
        salesCount: Math.floor(prod.salesCount),
        stock: Math.floor(prod.stock),
        tags: prod.tags.slice(0, 10),
        material: clampStr(prod.material, 160),
        dimensions: clampStr(prod.dimensions, 80),
        description: clampStr(prod.description, 1000),
        imageUrl: clampStr(prod.imageUrl, 1000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const existingOrders = await getDocs(collection(db, 'orders'));
    if (existingOrders.empty) {
      for (const ord of SEED_ORDERS) {
        const orderId = sanitizeId(ord.id);
        const orderDate = Timestamp.fromDate(new Date(ord.createdAt));
        batch.set(doc(db, 'orders', orderId), {
          id: orderId,
          userId: 'seed-archive',
          customerName: clampStr(ord.customerName, 120),
          customerEmail: clampStr(ord.customerEmail, 200),
          shippingAddress: clampStr(ord.shippingAddress, 300),
          items: ord.items.slice(0, 20),
          subtotal: Number(ord.subtotal),
          shippingFee: Number(ord.shippingFee),
          total: Number(ord.total),
          status: ord.status,
          createdAt: orderDate,
          updatedAt: orderDate,
        });
      }
    }

    await batch.commit();
    return SEED_PRODUCTS.length;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'products');
  }
}

// ---------------------------------------------------------
// Firebase Storage Upload & Admin Product / Category CRUD
// ---------------------------------------------------------
export async function uploadProductImage(productId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files are supported.');
  }
  if (file.size >= 5 * 1024 * 1024) {
    throw new Error('Image must be smaller than 5 MB.');
  }
  const safeId = sanitizeId(productId);
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64);
  const storageRef = ref(storage, `products/${safeId}/${Date.now()}_${cleanName}`);
  const snap = await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(snap.ref);
}

export async function createProductInFirestore(
  input: Omit<Product, 'createdAt'>
): Promise<void> {
  const safeId = sanitizeId(input.id);
  const path = `products/${safeId}`;
  try {
    await setDoc(doc(db, 'products', safeId), {
      id: safeId,
      sku: clampStr(input.sku, 40),
      name: clampStr(input.name, 140),
      category: clampStr(input.category, 60),
      price: Number(input.price),
      rating: Number(Math.min(5, Math.max(1, input.rating)).toFixed(1)),
      reviewCount: Math.max(0, Math.floor(input.reviewCount)),
      salesCount: Math.max(0, Math.floor(input.salesCount)),
      stock: Math.max(0, Math.floor(input.stock)),
      tags: input.tags.map((t) => clampStr(t.toLowerCase(), 40)).filter(Boolean).slice(0, 10),
      material: clampStr(input.material, 160),
      dimensions: clampStr(input.dimensions, 80),
      description: clampStr(input.description, 1000),
      imageUrl: clampStr(input.imageUrl, 1000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateProductInFirestore(
  productId: string,
  updates: Partial<Product>
): Promise<void> {
  const safeId = sanitizeId(productId);
  const path = `products/${safeId}`;
  try {
    const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.name !== undefined) payload.name = clampStr(updates.name, 140);
    if (updates.sku !== undefined) payload.sku = clampStr(updates.sku, 40);
    if (updates.category !== undefined) payload.category = clampStr(updates.category, 60);
    if (updates.price !== undefined) payload.price = Number(updates.price);
    if (updates.stock !== undefined) payload.stock = Math.max(0, Math.floor(updates.stock));
    if (updates.rating !== undefined) {
      payload.rating = Number(Math.min(5, Math.max(1, updates.rating)).toFixed(1));
    }
    if (updates.material !== undefined) payload.material = clampStr(updates.material, 160);
    if (updates.dimensions !== undefined) payload.dimensions = clampStr(updates.dimensions, 80);
    if (updates.description !== undefined) payload.description = clampStr(updates.description, 1000);
    if (updates.imageUrl !== undefined) payload.imageUrl = clampStr(updates.imageUrl, 1000);
    if (updates.tags !== undefined) {
      payload.tags = updates.tags
        .map((t) => clampStr(t.toLowerCase(), 40))
        .filter(Boolean)
        .slice(0, 10);
    }

    await updateDoc(doc(db, 'products', safeId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteProductInFirestore(productId: string): Promise<void> {
  const safeId = sanitizeId(productId);
  try {
    await deleteDoc(doc(db, 'products', safeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `products/${safeId}`);
  }
}

export async function createCategoryInFirestore(category: CategoryInfo): Promise<void> {
  const safeId = sanitizeId(category.name.toLowerCase());
  try {
    await setDoc(doc(db, 'categories', safeId), {
      id: safeId,
      name: clampStr(category.name, 60),
      description: clampStr(category.description || `${category.name} collection`, 300),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `categories/${safeId}`);
  }
}

export async function deleteCategoryInFirestore(categoryName: string): Promise<void> {
  const safeId = sanitizeId(categoryName.toLowerCase());
  try {
    await deleteDoc(doc(db, 'categories', safeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `categories/${safeId}`);
  }
}

// ---------------------------------------------------------
// Cart, Wishlist, Browsing History, Orders & Recommendations
// ---------------------------------------------------------
export async function upsertCartItemInFirestore(
  uid: string,
  productId: string,
  quantity: number
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeProdId = sanitizeId(productId);
  const docId = `${safeUid}_${safeProdId}`;
  const refDoc = doc(db, 'cart', docId);
  try {
    if (quantity <= 0) {
      await deleteDoc(refDoc);
      return;
    }
    const existing = await getDoc(refDoc);
    const boundedQty = Math.min(99, Math.max(1, Math.floor(quantity)));
    if (existing.exists()) {
      await updateDoc(refDoc, {
        quantity: boundedQty,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(refDoc, {
        userId: safeUid,
        productId: safeProdId,
        quantity: boundedQty,
        addedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `cart/${docId}`);
  }
}

export async function removeCartItemFromFirestore(uid: string, productId: string): Promise<void> {
  const docId = `${sanitizeId(uid)}_${sanitizeId(productId)}`;
  try {
    await deleteDoc(doc(db, 'cart', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `cart/${docId}`);
  }
}

export async function toggleWishlistInFirestore(
  uid: string,
  productId: string,
  currentlySaved: boolean
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeProdId = sanitizeId(productId);
  const docId = `${safeUid}_${safeProdId}`;
  const docRef = doc(db, 'wishlist', docId);
  try {
    if (currentlySaved) {
      await deleteDoc(docRef);
    } else {
      await setDoc(docRef, {
        userId: safeUid,
        productId: safeProdId,
        addedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `wishlist/${docId}`);
  }
}

export async function recordBrowsingHistoryInFirestore(
  uid: string,
  product: Product
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeProdId = sanitizeId(product.id);
  const docId = `${safeUid}_${safeProdId}`;
  const docRef = doc(db, 'browsing_history', docId);
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const prevCount = Math.max(1, Math.floor(Number(snap.data().viewCount ?? 1)));
      await updateDoc(docRef, {
        viewCount: prevCount + 1,
        category: clampStr(product.category, 60),
        lastViewedAt: serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
        userId: safeUid,
        productId: safeProdId,
        category: clampStr(product.category, 60),
        viewCount: 1,
        lastViewedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `browsing_history/${docId}`);
  }
}

export async function placeOrderInFirestore(
  uid: string,
  details: {
    customerName: string;
    customerEmail: string;
    shippingAddress: string;
  },
  cartItems: CartItem[],
  currentPurchasedIds: string[]
): Promise<Order> {
  const safeUid = sanitizeId(uid);
  const orderId = `ORD-${Date.now().toString().slice(-6)}`;
  const items = cartItems.slice(0, 20).map((ci) => ({
    productId: ci.product.id,
    sku: ci.product.sku,
    name: ci.product.name,
    category: ci.product.category,
    price: ci.product.price,
    quantity: ci.quantity,
  }));

  const subtotal = Number(
    items.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2)
  );
  const shippingFee = subtotal >= 250 ? 0 : 18;
  const total = Number((subtotal + shippingFee).toFixed(2));

  try {
    const batch = writeBatch(db);
    const orderRef = doc(db, 'orders', orderId);

    batch.set(orderRef, {
      id: orderId,
      userId: safeUid,
      customerName: clampStr(details.customerName, 120),
      customerEmail: clampStr(details.customerEmail, 200),
      shippingAddress: clampStr(details.shippingAddress, 300),
      items,
      subtotal,
      shippingFee,
      total,
      status: 'Confirmed',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Atomically decrement product stock & increment salesCount
    for (const ci of cartItems) {
      if (ci.product.stock < ci.quantity) {
        throw new Error(`Insufficient stock for ${ci.product.name}.`);
      }
      const prodRef = doc(db, 'products', sanitizeId(ci.product.id));
      batch.update(prodRef, {
        stock: Math.max(0, Math.floor(ci.product.stock - ci.quantity)),
        salesCount: Math.floor(ci.product.salesCount + ci.quantity),
        updatedAt: serverTimestamp(),
      });

      // Clear persisted cart doc
      batch.delete(doc(db, 'cart', `${safeUid}_${sanitizeId(ci.product.id)}`));
    }

    // Update purchasedProductIds on user profile
    const updatedPurchased = Array.from(
      new Set([...currentPurchasedIds, ...items.map((i) => i.productId)])
    ).slice(0, 100);
    batch.update(doc(db, 'users', safeUid), {
      purchasedProductIds: updatedPurchased,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();

    return {
      id: orderId,
      userId: safeUid,
      customerName: details.customerName.trim(),
      customerEmail: details.customerEmail.trim(),
      shippingAddress: details.shippingAddress.trim(),
      items,
      subtotal,
      shippingFee,
      total,
      status: 'Confirmed',
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `orders/${orderId}`);
  }
}

export async function saveRecommendationSnapshot(
  uid: string,
  recs: PersonalizedRecommendation[]
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const path = `recommendations/${safeUid}`;
  try {
    await setDoc(doc(db, 'recommendations', safeUid), {
      userId: safeUid,
      items: recs.slice(0, 12).map((r) => ({
        productId: r.product.id,
        score: r.similarityScore,
        reason: clampStr(r.reason, 120),
      })),
      computedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}
