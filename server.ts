import crypto from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import type { NextFunction, Request, Response } from 'express';
import {
  extractBearerToken,
  hashPassword,
  signToken,
  verifyPassword,
  verifyToken,
} from './src/server/auth.ts';
import type { SessionPayload } from './src/server/auth.ts';
import type { SortAlgo, SortOption } from './src/server/engine.ts';
import { store, toPublicUser } from './src/server/store.ts';
import type { Order, OrderItem, Product } from './src/types.ts';

dotenv.config();

interface AuthenticatedRequest extends Request {
  session?: SessionPayload;
}

function attachOptionalSession(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req.headers.authorization);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.session = payload;
    }
  }
  next();
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }
  req.session = payload;
  next();
}

function requireManager(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: 'Store manager authentication required' });
    return;
  }
  const payload = verifyToken(token);
  if (!payload || !payload.isManager) {
    res.status(403).json({ error: 'Store manager authorization required' });
    return;
  }
  req.session = payload;
  next();
}

function sanitizeImageUrl(url: string | undefined): string {
  const fallback = '/src/assets/images/prod_desk_tray_1795583137741.jpg';
  if (!url || typeof url !== 'string') return fallback;
  const trimmed = url.trim();
  if (trimmed.startsWith('/src/assets/images/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:') return trimmed;
  } catch {
    return fallback;
  }
  return fallback;
}

function getAllCatalogTags(): string[] {
  const tagSet = new Set<string>();
  for (const prod of store.data.products) {
    for (const tag of prod.tags) {
      tagSet.add(tag.toLowerCase());
    }
  }
  return Array.from(tagSet).sort();
}

async function startServer(): Promise<void> {
  const app = express();
  const port = Number(process.env.PORT ?? 3000);

  app.use(express.json({ limit: '1mb' }));
  app.use(attachOptionalSession);

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Catalog search, filtering, sorting, and heap rankings
  app.get('/api/catalog', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const tagsRaw = typeof req.query.tags === 'string' ? req.query.tags : '';
    const tags = tagsRaw
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const minPrice =
      typeof req.query.minPrice === 'string' && req.query.minPrice !== ''
        ? Number(req.query.minPrice)
        : undefined;
    const maxPrice =
      typeof req.query.maxPrice === 'string' && req.query.maxPrice !== ''
        ? Number(req.query.maxPrice)
        : undefined;

    const validSorts = new Set(['popular', 'rating', 'price-asc', 'price-desc', 'name']);
    const sortBy: SortOption =
      typeof req.query.sortBy === 'string' && validSorts.has(req.query.sortBy)
        ? (req.query.sortBy as SortOption)
        : 'popular';

    const sortAlgo: SortAlgo = req.query.sortAlgo === 'quick' ? 'quick' : 'merge';

    const queryResult = store.engine.queryCatalog({
      q,
      category,
      tags: tags.length > 0 ? tags : undefined,
      minPrice: Number.isFinite(minPrice) ? minPrice : undefined,
      maxPrice: Number.isFinite(maxPrice) ? maxPrice : undefined,
      sortBy,
      sortAlgo,
    });

    res.json({
      items: queryResult.items,
      telemetry: queryResult.telemetry,
      topRated: store.engine.getTopRated(4),
      mostPopular: store.engine.getMostPopular(4),
      categories: store.engine.categoryTable.values(),
      allTags: getAllCatalogTags(),
      diagnostics: store.engine.getDiagnostics(),
    });
  });

  // Single Product Detail + Graph Co-Purchase / Attribute Related Recommendations
  app.get('/api/products/:id', (req, res) => {
    const product = store.engine.productTable.get(req.params.id);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    const related = store.engine.getRelatedProducts(product.id, 4);
    res.json({ product, related });
  });

  // Personalized Recommendations (Set Algebra & Jaccard Similarity)
  app.get('/api/recommendations', (req: AuthenticatedRequest, res) => {
    let preferences: string[] = [];
    let purchasedIds: string[] = [];

    if (req.session && !req.session.userId.startsWith('manager-')) {
      const user = store.data.users.find((u) => u.id === req.session!.userId);
      if (user) {
        preferences = user.preferences;
        purchasedIds = user.purchasedProductIds;
      }
    }

    if (typeof req.query.prefs === 'string' && req.query.prefs.trim().length > 0) {
      const queryPrefs = req.query.prefs
        .split(',')
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean);
      preferences = Array.from(new Set([...preferences, ...queryPrefs]));
    }

    const recommendations = store.engine.getPersonalizedRecommendations(
      preferences,
      purchasedIds,
      4
    );
    res.json({
      recommendations,
      activePreferences: preferences,
      purchasedCount: purchasedIds.length,
    });
  });

  // User Registration
  app.post('/api/auth/register', (req, res) => {
    const { name, email, password, preferences } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      preferences?: string[];
    };

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      res.status(400).json({ error: 'Please provide your full name (min 2 characters).' });
      return;
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (store.data.users.some((u) => u.email === normalizedEmail)) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const cleanPrefs = Array.isArray(preferences)
      ? preferences.map((p) => String(p).trim().toLowerCase()).filter(Boolean).slice(0, 8)
      : [];

    const newUser = {
      id: `usr-${crypto.randomUUID().slice(0, 8)}`,
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: hashPassword(password),
      preferences: cleanPrefs,
      purchasedProductIds: [],
      isManager: false,
      createdAt: new Date().toISOString(),
    };

    store.data.users.push(newUser);
    store.save();

    const token = signToken({
      userId: newUser.id,
      email: newUser.email,
      isManager: false,
    });

    res.status(201).json({ token, user: toPublicUser(newUser) });
  });

  // User Login
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = store.data.users.find((u) => u.email === normalizedEmail);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      isManager: user.isManager,
    });

    res.json({ token, user: toPublicUser(user) });
  });

  // Current Authenticated User
  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.session!.userId.startsWith('manager-')) {
      res.json({
        user: {
          id: req.session!.userId,
          name: 'Store Manager',
          email: req.session!.email,
          preferences: [],
          purchasedProductIds: [],
          isManager: true,
          createdAt: new Date().toISOString(),
        },
      });
      return;
    }

    const user = store.data.users.find((u) => u.id === req.session!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user: toPublicUser(user) });
  });

  // Update User Preferences Set
  app.patch('/api/auth/preferences', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = store.data.users.find((u) => u.id === req.session!.userId);
    if (!user) {
      res.status(404).json({ error: 'Customer account not found' });
      return;
    }

    const { preferences } = req.body as { preferences?: string[] };
    if (!Array.isArray(preferences)) {
      res.status(400).json({ error: 'Preferences must be an array of strings.' });
      return;
    }

    user.preferences = Array.from(
      new Set(preferences.map((p) => String(p).trim().toLowerCase()).filter(Boolean))
    ).slice(0, 10);
    store.save();

    res.json({ user: toPublicUser(user) });
  });

  // Store Manager Status & First-Run Claim / Passcode Verification
  app.get('/api/admin/status', (_req, res) => {
    const envConfigured = Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0);
    const claimed = Boolean(store.data.managerPasscodeHash);
    res.json({
      configured: envConfigured || claimed,
      envOverride: envConfigured,
    });
  });

  app.post('/api/admin/claim', (req, res) => {
    const envPass = process.env.ADMIN_PASSCODE?.trim();
    if (envPass || store.data.managerPasscodeHash) {
      res.status(409).json({ error: 'Store manager passcode is already configured.' });
      return;
    }

    const { passcode } = req.body as { passcode?: string };
    if (!passcode || typeof passcode !== 'string' || passcode.trim().length < 6) {
      res.status(400).json({ error: 'Passcode must be at least 6 characters.' });
      return;
    }

    store.data.managerPasscodeHash = hashPassword(passcode.trim());
    store.save();

    const managerToken = signToken({
      userId: 'manager-admin',
      email: 'manager@kronoatelier.local',
      isManager: true,
    });
    res.status(201).json({ token: managerToken });
  });

  app.post('/api/admin/verify', (req, res) => {
    const { passcode } = req.body as { passcode?: string };
    if (!passcode || typeof passcode !== 'string') {
      res.status(400).json({ error: 'Passcode is required.' });
      return;
    }

    const envPass = process.env.ADMIN_PASSCODE?.trim();
    let valid = false;

    if (envPass) {
      const a = Buffer.from(passcode.trim(), 'utf8');
      const b = Buffer.from(envPass, 'utf8');
      valid = a.length === b.length && crypto.timingSafeEqual(a, b);
    } else if (store.data.managerPasscodeHash) {
      valid = verifyPassword(passcode.trim(), store.data.managerPasscodeHash);
    } else {
      res.status(400).json({ error: 'Manager access has not been claimed yet.' });
      return;
    }

    if (!valid) {
      res.status(401).json({ error: 'Incorrect store manager passcode.' });
      return;
    }

    const managerToken = signToken({
      userId: 'manager-admin',
      email: 'manager@kronoatelier.local',
      isManager: true,
    });
    res.json({ token: managerToken });
  });

  // Product Management (Manager Protected)
  app.post('/api/products', requireManager, (req, res) => {
    const body = req.body as Partial<Product>;
    if (!body.name || !body.category || typeof body.price !== 'number' || body.price <= 0) {
      res.status(400).json({ error: 'Name, category, and positive price are required.' });
      return;
    }

    const id = `prod-${crypto.randomUUID().slice(0, 8)}`;
    const sku =
      body.sku && body.sku.trim().length > 0
        ? body.sku.trim().toUpperCase()
        : `KA-${body.category.slice(0, 3).toUpperCase()}-${Math.floor(10 + Math.random() * 89)}`;

    const newProduct: Product = {
      id,
      sku,
      name: body.name.trim(),
      category: body.category.trim(),
      price: Number(body.price.toFixed(2)),
      rating: typeof body.rating === 'number' ? Math.min(5, Math.max(1, body.rating)) : 4.7,
      reviewCount: typeof body.reviewCount === 'number' ? Math.max(0, Math.floor(body.reviewCount)) : 1,
      salesCount: typeof body.salesCount === 'number' ? Math.max(0, Math.floor(body.salesCount)) : 0,
      stock: typeof body.stock === 'number' ? Math.max(0, Math.floor(body.stock)) : 12,
      tags: Array.isArray(body.tags)
        ? body.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean)
        : [body.category.trim().toLowerCase(), 'minimalist'],
      material: body.material?.trim() || 'Anodized Aluminum',
      dimensions: body.dimensions?.trim() || '200 × 140 × 60 mm',
      description:
        body.description?.trim() ||
        'Precision-engineered studio hardware crafted for long-term architectural durability.',
      imageUrl: sanitizeImageUrl(body.imageUrl),
      createdAt: new Date().toISOString(),
    };

    if (!store.data.categories.some((c) => c.name.toLowerCase() === newProduct.category.toLowerCase())) {
      store.data.categories.push({
        name: newProduct.category,
        description: `${newProduct.category} collection`,
      });
    }

    store.data.products.push(newProduct);
    store.save();
    store.syncEngine();

    res.status(201).json({ product: newProduct });
  });

  app.put('/api/products/:id', requireManager, (req, res) => {
    const idx = store.data.products.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const existing = store.data.products[idx];
    const body = req.body as Partial<Product>;
    const updated: Product = {
      ...existing,
      name: body.name ? body.name.trim() : existing.name,
      category: body.category ? body.category.trim() : existing.category,
      price: typeof body.price === 'number' && body.price > 0 ? Number(body.price.toFixed(2)) : existing.price,
      stock: typeof body.stock === 'number' && body.stock >= 0 ? Math.floor(body.stock) : existing.stock,
      rating:
        typeof body.rating === 'number'
          ? Math.min(5, Math.max(1, Number(body.rating.toFixed(1))))
          : existing.rating,
      material: body.material ? body.material.trim() : existing.material,
      dimensions: body.dimensions ? body.dimensions.trim() : existing.dimensions,
      description: body.description ? body.description.trim() : existing.description,
      tags: Array.isArray(body.tags)
        ? body.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean)
        : existing.tags,
      imageUrl: body.imageUrl ? sanitizeImageUrl(body.imageUrl) : existing.imageUrl,
    };

    store.data.products[idx] = updated;
    store.save();
    store.syncEngine();
    res.json({ product: updated });
  });

  app.delete('/api/products/:id', requireManager, (req, res) => {
    const idx = store.data.products.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    store.data.products.splice(idx, 1);
    store.save();
    store.syncEngine();
    res.json({ deleted: true });
  });

  // Category Management (Manager Protected)
  app.post('/api/categories', requireManager, (req, res) => {
    const { name, description } = req.body as { name?: string; description?: string };
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      res.status(400).json({ error: 'Category name must be at least 2 characters.' });
      return;
    }

    const trimmedName = name.trim();
    if (store.data.categories.some((c) => c.name.toLowerCase() === trimmedName.toLowerCase())) {
      res.status(409).json({ error: 'Category already exists.' });
      return;
    }

    const newCat = {
      name: trimmedName,
      description: description?.trim() || `${trimmedName} collection`,
    };
    store.data.categories.push(newCat);
    store.save();
    store.syncEngine();
    res.status(201).json({ category: newCat });
  });

  app.delete('/api/categories/:name', requireManager, (req, res) => {
    const target = req.params.name.toLowerCase();
    const hasProducts = store.data.products.some((p) => p.category.toLowerCase() === target);
    if (hasProducts) {
      res.status(400).json({ error: 'Reassign or delete products in this category before removing it.' });
      return;
    }
    store.data.categories = store.data.categories.filter((c) => c.name.toLowerCase() !== target);
    store.save();
    store.syncEngine();
    res.json({ deleted: true });
  });

  // Place Order (Updates Inventory, Sales Count, Purchase History & Co-Purchase Graph)
  app.post('/api/orders', (req: AuthenticatedRequest, res) => {
    const { customerName, customerEmail, shippingAddress, items } = req.body as {
      customerName?: string;
      customerEmail?: string;
      shippingAddress?: string;
      items?: Array<{ productId: string; quantity: number }>;
    };

    if (!customerName || customerName.trim().length < 2) {
      res.status(400).json({ error: 'Recipient name is required.' });
      return;
    }
    if (!customerEmail || !customerEmail.includes('@')) {
      res.status(400).json({ error: 'Valid email address is required.' });
      return;
    }
    if (!shippingAddress || shippingAddress.trim().length < 5) {
      res.status(400).json({ error: 'Shipping address is required.' });
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Cart cannot be empty.' });
      return;
    }

    const verifiedItems: OrderItem[] = [];
    let subtotal = 0;

    for (const reqItem of items) {
      const qty = Math.floor(Number(reqItem.quantity));
      if (!Number.isFinite(qty) || qty <= 0) {
        res.status(400).json({ error: 'Invalid item quantity.' });
        return;
      }
      const product = store.engine.productTable.get(reqItem.productId);
      if (!product) {
        res.status(404).json({ error: `Product ${reqItem.productId} not found.` });
        return;
      }
      if (product.stock < qty) {
        res.status(400).json({ error: `Insufficient stock for ${product.name} (${product.stock} left).` });
        return;
      }

      verifiedItems.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        category: product.category,
        price: product.price,
        quantity: qty,
      });
      subtotal += product.price * qty;
    }

    const shippingFee = subtotal >= 250 ? 0 : 18;
    const total = Number((subtotal + shippingFee).toFixed(2));
    const orderNumber = 1035 + store.data.orders.length + 1;

    const newOrder: Order = {
      id: `ORD-${orderNumber}`,
      userId: req.session && !req.session.userId.startsWith('manager-') ? req.session.userId : null,
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim().toLowerCase(),
      shippingAddress: shippingAddress.trim(),
      items: verifiedItems,
      subtotal: Number(subtotal.toFixed(2)),
      shippingFee,
      total,
      status: 'Confirmed',
      createdAt: new Date().toISOString(),
    };

    // Update stock & salesCount atomically
    for (const item of verifiedItems) {
      const prod = store.data.products.find((p) => p.id === item.productId);
      if (prod) {
        prod.stock -= item.quantity;
        prod.salesCount += item.quantity;
      }
    }

    // Update user purchase history if logged in
    if (newOrder.userId) {
      const user = store.data.users.find((u) => u.id === newOrder.userId);
      if (user) {
        const merged = new Set([
          ...user.purchasedProductIds,
          ...verifiedItems.map((i) => i.productId),
        ]);
        user.purchasedProductIds = Array.from(merged);
      }
    }

    store.data.orders.push(newOrder);
    store.save();
    store.syncEngine();

    res.status(201).json({ order: newOrder });
  });

  // Order History
  app.get('/api/orders', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.session!.isManager) {
      res.json({ orders: [...store.data.orders].reverse() });
      return;
    }
    const userOrders = store.data.orders
      .filter((o) => o.userId === req.session!.userId || o.customerEmail === req.session!.email)
      .reverse();
    res.json({ orders: userOrders });
  });

  // Sales Reports (HashTable + MaxHeap + MergeSort)
  app.get('/api/reports/sales', (_req, res) => {
    const report = store.engine.generateSalesReport(store.data.orders);
    res.json({
      report,
      diagnostics: store.engine.getDiagnostics(),
    });
  });

  // Dev Vite middleware or static dist serving
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Krono Atelier server listening on http://localhost:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
