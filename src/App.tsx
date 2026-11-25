import { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { AccountView } from './components/AccountView.tsx';
import { AnalyticsManageView } from './components/AnalyticsManageView.tsx';
import { CartDrawer } from './components/CartDrawer.tsx';
import { Navbar } from './components/Navbar.tsx';
import type { AppSection } from './components/Navbar.tsx';
import { ProductDetailModal } from './components/ProductDetailModal.tsx';
import { StorefrontView } from './components/StorefrontView.tsx';
import { ClientDSAEngine } from './dsa/ClientDSAEngine.ts';
import { auth } from './firebase.ts';
import type { SortAlgo, SortOption } from './server/engine.ts';
import {
  ensureUserProfile,
  recordBrowsingHistoryInFirestore,
  removeCartItemFromFirestore,
  saveRecommendationSnapshot,
  seedInitialCatalogIfEmpty,
  subscribeBrowsingHistory,
  subscribeCart,
  subscribeCategories,
  subscribeOrders,
  subscribeProducts,
  subscribeWishlist,
  toggleWishlistInFirestore,
  upsertCartItemInFirestore,
} from './services/firestoreService.ts';
import type {
  BrowsingHistoryItem,
  CartItem,
  CategoryInfo,
  Order,
  Product,
  UserProfile,
  WishlistItem,
} from './types.ts';

export default function App() {
  const [activeSection, setActiveSection] = useState<AppSection>('catalog');

  // Live Firestore Catalog & Orders State
  const [firestoreProducts, setFirestoreProducts] = useState<Product[]>([]);
  const [fallbackProducts, setFallbackProducts] = useState<Product[]>([]);
  const [firestoreCategories, setFirestoreCategories] = useState<CategoryInfo[]>([]);
  const [fallbackCategories, setFallbackCategories] = useState<CategoryInfo[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  // Query Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [pricePreset, setPricePreset] = useState<'all' | 'under-150' | '150-320' | 'over-320'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('popular');
  const [sortAlgo, setSortAlgo] = useState<SortAlgo>('merge');
  const [heapMode, setHeapMode] = useState<'rated' | 'popular'>('rated');

  // Firebase Auth & User Collections
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [guestPrefs, setGuestPrefs] = useState<string[]>(['acoustic', 'aluminum']);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [browsingHistory, setBrowsingHistory] = useState<BrowsingHistoryItem[]>([]);
  const [remoteCartEntries, setRemoteCartEntries] = useState<
    Array<{ productId: string; quantity: number }>
  >([]);

  // Local guest cart (synced with Firestore cart when signed in & verified)
  const [guestCart, setGuestCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2600);
  }, []);

  // 1. Subscribe to Cloud Firestore Products & Categories
  useEffect(() => {
    let loadedFallback = false;

    const unsubProducts = subscribeProducts(
      (list) => {
        setFirestoreProducts(list);
        setLoadingCatalog(false);
        if (list.length === 0 && !loadedFallback) {
          loadedFallback = true;
          fetch('/api/catalog')
            .then((r) => r.json())
            .then((d: { items?: Product[]; categories?: CategoryInfo[] }) => {
              if (Array.isArray(d.items)) setFallbackProducts(d.items);
              if (Array.isArray(d.categories)) setFallbackCategories(d.categories);
            })
            .catch(() => {});
        }
      },
      () => setLoadingCatalog(false)
    );

    const unsubCategories = subscribeCategories((list) => {
      setFirestoreCategories(list);
    });

    return () => {
      unsubProducts();
      unsubCategories();
    };
  }, []);

  // 2. Listen to Firebase Authentication State
  const refreshUserProfile = useCallback(async () => {
    const fbUser = auth.currentUser;
    if (!fbUser) {
      setUser(null);
      setAuthReady(true);
      return;
    }
    const profile = await ensureUserProfile(fbUser);
    setUser(profile);
    setAuthReady(true);

    if (profile.role === 'admin' && profile.emailVerified) {
      await seedInitialCatalogIfEmpty().catch(() => 0);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, () => {
      void refreshUserProfile();
    });
    return () => unsub();
  }, [refreshUserProfile]);

  // 3. Subscribe to User-Scoped Firestore Collections (Cart, Wishlist, Browsing History, Orders)
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) {
      setOrders([]);
      setWishlist([]);
      setBrowsingHistory([]);
      setRemoteCartEntries([]);
      return;
    }

    const unsubOrders = subscribeOrders(user.id, user.role === 'admin', setOrders);
    const unsubCart = subscribeCart(user.id, setRemoteCartEntries);
    const unsubWishlist = subscribeWishlist(user.id, setWishlist);
    const unsubHistory = subscribeBrowsingHistory(user.id, setBrowsingHistory);

    return () => {
      unsubOrders();
      unsubCart();
      unsubWishlist();
      unsubHistory();
    };
  }, [authReady, user]);

  // Active products & categories (Firestore primary, Express read-only fallback until admin seeds)
  const activeProducts = firestoreProducts.length > 0 ? firestoreProducts : fallbackProducts;
  const activeCategories =
    firestoreCategories.length > 0 ? firestoreCategories : fallbackCategories;

  // 4. Rebuild Live DSA Engine over Firestore Data
  const engine = useMemo(
    () => new ClientDSAEngine(activeProducts, orders),
    [activeProducts, orders]
  );

  const allTags = useMemo(() => engine.getAllTags(), [engine]);
  const topRated = useMemo(() => engine.getTopRated(4), [engine]);
  const mostPopular = useMemo(() => engine.getMostPopular(4), [engine]);

  const queryResult = useMemo(() => {
    let minPrice: number | undefined;
    let maxPrice: number | undefined;
    if (pricePreset === 'under-150') {
      minPrice = 0;
      maxPrice = 149.99;
    } else if (pricePreset === '150-320') {
      minPrice = 150;
      maxPrice = 320;
    } else if (pricePreset === 'over-320') {
      minPrice = 320.01;
    }
    return engine.queryCatalog({
      q: searchQuery,
      category: selectedCategory,
      tags: selectedTags,
      minPrice,
      maxPrice,
      sortBy,
      sortAlgo,
    });
  }, [engine, searchQuery, selectedCategory, selectedTags, pricePreset, sortBy, sortAlgo]);

  const wishlistIds = useMemo(
    () => new Set(wishlist.map((w) => w.productId)),
    [wishlist]
  );

  const recommendations = useMemo(
    () =>
      engine.getPersonalizedRecommendations(
        user ? user.preferences : guestPrefs,
        user ? user.purchasedProductIds : [],
        browsingHistory,
        Array.from(wishlistIds),
        4
      ),
    [engine, user, guestPrefs, browsingHistory, wishlistIds]
  );

  // Persist recommendation snapshot in Firestore when signed in & verified
  useEffect(() => {
    if (user && user.emailVerified && recommendations.length > 0 && firestoreProducts.length > 0) {
      void saveRecommendationSnapshot(user.id, recommendations).catch(() => {});
    }
  }, [user, recommendations, firestoreProducts.length]);

  const selectedRelated = useMemo(() => {
    if (!selectedProduct) return [];
    return engine.getRelatedProducts(selectedProduct.id, 4);
  }, [engine, selectedProduct]);

  // Cart Hydration (Firestore when verified user signed in, local state when guest)
  const activeCart: CartItem[] = useMemo(() => {
    if (user && user.emailVerified) {
      const hydrated: CartItem[] = [];
      for (const entry of remoteCartEntries) {
        const prod = engine.getProductById(entry.productId);
        if (prod) {
          hydrated.push({ product: prod, quantity: Math.min(prod.stock || 99, entry.quantity) });
        }
      }
      return hydrated;
    }
    return guestCart;
  }, [user, remoteCartEntries, guestCart, engine]);

  function handleNavigate(section: AppSection) {
    setActiveSection(section);
    if (section === 'top-ranked') {
      setTimeout(() => {
        document.getElementById('top-ranked-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 40);
    } else if (section === 'for-you') {
      setTimeout(() => {
        document.getElementById('for-you-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 40);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function handleSelectProduct(product: Product) {
    setSelectedProduct(product);
    if (user && user.emailVerified && firestoreProducts.some((p) => p.id === product.id)) {
      void recordBrowsingHistoryInFirestore(user.id, product).catch(() => {});
    }
  }

  function handleAddToCart(product: Product, qty = 1) {
    if (user && user.emailVerified && firestoreProducts.some((p) => p.id === product.id)) {
      const existing = activeCart.find((i) => i.product.id === product.id);
      const nextQty = Math.min(product.stock, (existing?.quantity ?? 0) + qty);
      void upsertCartItemInFirestore(user.id, product.id, nextQty);
    } else {
      setGuestCart((prev) => {
        const existing = prev.find((i) => i.product.id === product.id);
        if (existing) {
          const nextQty = Math.min(product.stock, existing.quantity + qty);
          return prev.map((i) => (i.product.id === product.id ? { ...i, quantity: nextQty } : i));
        }
        return [...prev, { product, quantity: Math.min(product.stock, qty) }];
      });
    }
    showToast(`Added ${product.name} to bag`);
  }

  function handleUpdateCartQty(productId: string, quantity: number) {
    if (user && user.emailVerified && firestoreProducts.some((p) => p.id === productId)) {
      if (quantity <= 0) {
        void removeCartItemFromFirestore(user.id, productId);
      } else {
        void upsertCartItemInFirestore(user.id, productId, quantity);
      }
      return;
    }

    if (quantity <= 0) {
      setGuestCart((prev) => prev.filter((i) => i.product.id !== productId));
      return;
    }
    setGuestCart((prev) =>
      prev.map((i) =>
        i.product.id === productId
          ? { ...i, quantity: Math.min(i.product.stock, quantity) }
          : i
      )
    );
  }

  function handleRemoveCartItem(productId: string) {
    if (user && user.emailVerified) {
      void removeCartItemFromFirestore(user.id, productId);
    } else {
      setGuestCart((prev) => prev.filter((i) => i.product.id !== productId));
    }
  }

  function handleToggleWishlist(product: Product) {
    if (!user || !user.emailVerified) {
      showToast('Sign in with a verified account to save wishlist items');
      setActiveSection('account');
      return;
    }
    const saved = wishlistIds.has(product.id);
    void toggleWishlistInFirestore(user.id, product.id, saved);
    showToast(saved ? `Removed ${product.name} from wishlist` : `Saved ${product.name} to wishlist`);
  }

  function handleOrderSuccess(order: Order) {
    if (user) {
      const updatedPurchased = Array.from(
        new Set([...user.purchasedProductIds, ...order.items.map((i) => i.productId)])
      );
      setUser({ ...user, purchasedProductIds: updatedPurchased });
    }
    showToast(`Order ${order.id} confirmed`);
  }

  const cartCount = activeCart.reduce((sum, item) => sum + item.quantity, 0);
  const isStorefront =
    activeSection === 'catalog' || activeSection === 'top-ranked' || activeSection === 'for-you';

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F8F7] text-[#18181B]">
      <Navbar
        activeSection={activeSection}
        onNavigate={handleNavigate}
        cartCount={cartCount}
        onOpenCart={() => setCartOpen(true)}
      />

      <main className="flex-1">
        {isStorefront && (
          <StorefrontView
            products={queryResult.items}
            topRated={topRated}
            mostPopular={mostPopular}
            categories={activeCategories}
            allTags={allTags}
            telemetry={queryResult.telemetry}
            loadingCatalog={loadingCatalog}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            selectedTags={selectedTags}
            onToggleTag={(tag) =>
              setSelectedTags((prev) =>
                prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
              )
            }
            pricePreset={pricePreset}
            onPricePresetChange={setPricePreset}
            sortBy={sortBy}
            onSortByChange={setSortBy}
            sortAlgo={sortAlgo}
            onSortAlgoChange={setSortAlgo}
            onResetFilters={() => {
              setSearchQuery('');
              setSelectedCategory('All');
              setSelectedTags([]);
              setPricePreset('all');
            }}
            heapMode={heapMode}
            onHeapModeChange={setHeapMode}
            recommendations={recommendations}
            guestPrefs={guestPrefs}
            onToggleGuestPref={(tag) =>
              setGuestPrefs((prev) =>
                prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
              )
            }
            user={user}
            wishlistIds={wishlistIds}
            browsingHistory={browsingHistory}
            onSelectProduct={handleSelectProduct}
            onAddToCart={(prod) => handleAddToCart(prod, 1)}
            onToggleWishlist={handleToggleWishlist}
          />
        )}

        {activeSection === 'analytics' && (
          <AnalyticsManageView
            products={activeProducts}
            categories={activeCategories}
            orders={orders}
            user={user}
            engine={engine}
            firestoreEmpty={firestoreProducts.length === 0}
          />
        )}

        {activeSection === 'account' && (
          <AccountView
            user={user}
            allTags={allTags}
            orders={orders}
            wishlist={wishlist}
            browsingHistory={browsingHistory}
            productMap={engine.productMap}
            onUserUpdated={(updated) => setUser(updated)}
            onRefreshAuthUser={refreshUserProfile}
            onAddToCart={(prod) => handleAddToCart(prod, 1)}
            onToggleWishlist={handleToggleWishlist}
            onSelectProduct={(prod) => {
              handleSelectProduct(prod);
            }}
          />
        )}
      </main>

      <footer className="border-t border-[#E4E4E0] bg-white">
        <div className="max-w-[1280px] mx-auto px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#71717A]">
          <div>
            <span className="font-display font-semibold text-[#18181B]">Krono Atelier</span>
            <span className="mx-2" aria-hidden="true">·</span>
            <span>Curated Industrial & Studio Objects</span>
          </div>
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => handleNavigate('catalog')}
              className="hover:text-[#18181B] cursor-pointer"
            >
              Catalog
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('analytics')}
              className="hover:text-[#18181B] cursor-pointer"
            >
              Sales Reports
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('account')}
              className="hover:text-[#18181B] cursor-pointer"
            >
              Account
            </button>
          </div>
        </div>
      </footer>

      <ProductDetailModal
        product={selectedProduct}
        related={selectedRelated}
        isWishlisted={selectedProduct ? wishlistIds.has(selectedProduct.id) : false}
        onToggleWishlist={handleToggleWishlist}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
        onSelectRelated={handleSelectProduct}
      />

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        items={activeCart}
        onUpdateQty={handleUpdateCartQty}
        onRemoveItem={handleRemoveCartItem}
        onClearCart={() => setGuestCart([])}
        user={user}
        onRequestSignIn={() => setActiveSection('account')}
        onOrderSuccess={handleOrderSuccess}
      />

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 px-4 py-2.5 text-xs font-medium bg-[#18181B] text-white rounded-md shadow-md"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
