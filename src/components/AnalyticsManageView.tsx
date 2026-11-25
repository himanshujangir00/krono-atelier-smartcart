import { useMemo, useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { BarChart3, Lock, Pencil, Plus, Star, Trash2, Upload } from 'lucide-react';
import type { ClientDSAEngine } from '../dsa/ClientDSAEngine.ts';
import { mergeSort, quickSort } from '../dsa/Sorting.ts';
import { auth, googleProvider } from '../firebase.ts';
import {
  createCategoryInFirestore,
  createProductInFirestore,
  deleteCategoryInFirestore,
  deleteProductInFirestore,
  seedInitialCatalogIfEmpty,
  updateProductInFirestore,
  uploadProductImage,
} from '../services/firestoreService.ts';
import type { CategoryInfo, Order, Product, UserProfile } from '../types.ts';

interface AnalyticsManageViewProps {
  products: Product[];
  categories: CategoryInfo[];
  orders: Order[];
  user: UserProfile | null;
  engine: ClientDSAEngine;
  firestoreEmpty: boolean;
}

const STUDIO_IMAGE_PRESETS: Array<{ label: string; url: string }> = [
  { label: 'Studio Monitor', url: '/src/assets/images/prod_studio_monitor_1795583135845.jpg' },
  { label: 'Reference Headphones', url: '/src/assets/images/prod_wireless_headphones_1795583138593.jpg' },
  { label: 'Field Recorder', url: '/src/assets/images/prod_field_recorder_1795583138105.jpg' },
  { label: 'Articulated Lamp', url: '/src/assets/images/prod_brass_lamp_1795583135987.jpg' },
  { label: 'Machined Keyboard', url: '/src/assets/images/prod_mech_keyboard_1795583136269.jpg' },
  { label: 'Slate Desk Valet', url: '/src/assets/images/prod_desk_tray_1795583137741.jpg' },
  { label: 'Stoneware Carafe', url: '/src/assets/images/prod_ceramic_carafe_1795583137066.jpg' },
  { label: 'Waxed Canvas Folio', url: '/src/assets/images/prod_leather_folio_1795583137432.jpg' },
];

export function AnalyticsManageView({
  products,
  categories,
  orders,
  user,
  engine,
  firestoreEmpty,
}: AnalyticsManageViewProps) {
  const [subTab, setSubTab] = useState<'reports' | 'manage'>('reports');
  const [ledgerSortBy, setLedgerSortBy] = useState<'date' | 'total'>('date');
  const [ledgerSortAlgo, setLedgerSortAlgo] = useState<'merge' | 'quick'>('merge');

  // Product Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodSku, setProdSku] = useState('');
  const [prodCategory, setProdCategory] = useState(categories[0]?.name ?? 'Audio');
  const [prodPrice, setProdPrice] = useState('220');
  const [prodStock, setProdStock] = useState('15');
  const [prodRating, setProdRating] = useState('4.8');
  const [prodMaterial, setProdMaterial] = useState('Anodized Aluminum');
  const [prodTags, setProdTags] = useState('minimalist, aluminum, studio');
  const [prodDesc, setProdDesc] = useState('');
  const [prodImage, setProdImage] = useState(STUDIO_IMAGE_PRESETS[0].url);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [manageMsg, setManageMsg] = useState<string | null>(null);
  const [manageErr, setManageErr] = useState<string | null>(null);

  // Category Form State
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');

  const isAdmin = Boolean(user && user.role === 'admin' && user.emailVerified);

  const report = useMemo(
    () => engine.generateSalesReport(orders, categories),
    [engine, orders, categories]
  );
  const diagnostics = useMemo(() => engine.getDiagnostics(), [engine]);
  const topRatedProducts = useMemo(() => engine.getTopRated(5), [engine]);
  const mostPopularProducts = useMemo(() => engine.getMostPopular(5), [engine]);

  const sortedLedger: Order[] = useMemo(
    () =>
      (ledgerSortAlgo === 'quick' ? quickSort : mergeSort)(report.recentOrders, (a, b) =>
        ledgerSortBy === 'total' ? b.total - a.total : b.createdAt.localeCompare(a.createdAt)
      ),
    [report.recentOrders, ledgerSortAlgo, ledgerSortBy]
  );

  const maxDailyRevenue =
    report.dailyRevenue.length > 0
      ? Math.max(...report.dailyRevenue.map((d) => d.revenue), 1)
      : 1;

  function startEditProduct(p: Product) {
    setEditingId(p.id);
    setProdName(p.name);
    setProdSku(p.sku);
    setProdCategory(p.category);
    setProdPrice(String(p.price));
    setProdStock(String(p.stock));
    setProdRating(String(p.rating));
    setProdMaterial(p.material);
    setProdTags(p.tags.join(', '));
    setProdDesc(p.description);
    setProdImage(p.imageUrl);
    setManageMsg(null);
    setManageErr(null);
  }

  function resetProductForm() {
    setEditingId(null);
    setProdName('');
    setProdSku('');
    setProdCategory(categories[0]?.name ?? 'Audio');
    setProdPrice('220');
    setProdStock('15');
    setProdRating('4.8');
    setProdMaterial('Anodized Aluminum');
    setProdTags('minimalist, aluminum, studio');
    setProdDesc('');
    setProdImage(STUDIO_IMAGE_PRESETS[0].url);
  }

  async function handleImageFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setManageErr(null);
    setUploadingImage(true);
    try {
      const targetId = editingId || `prod-${Date.now()}`;
      const downloadUrl = await uploadProductImage(targetId, file);
      setProdImage(downloadUrl);
      setManageMsg('Product image uploaded to Firebase Storage.');
    } catch (err) {
      setManageErr(err instanceof Error ? err.message : 'Firebase Storage upload failed.');
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    setManageMsg(null);
    setManageErr(null);
    setSavingProduct(true);

    try {
      const tags = prodTags
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      if (editingId) {
        await updateProductInFirestore(editingId, {
          name: prodName.trim(),
          sku: prodSku.trim().toUpperCase(),
          category: prodCategory,
          price: Number(prodPrice),
          stock: Number(prodStock),
          rating: Number(prodRating),
          material: prodMaterial.trim(),
          tags,
          description: prodDesc.trim(),
          imageUrl: prodImage,
        });
        setManageMsg('Product updated in Cloud Firestore and re-indexed.');
      } else {
        const newId = `prod-${Date.now().toString(36)}`;
        const sku =
          prodSku.trim().toUpperCase() ||
          `KA-${prodCategory.slice(0, 3).toUpperCase()}-${Math.floor(10 + Math.random() * 89)}`;
        await createProductInFirestore({
          id: newId,
          sku,
          name: prodName.trim(),
          category: prodCategory,
          price: Number(prodPrice),
          rating: Number(prodRating),
          reviewCount: 1,
          salesCount: 0,
          stock: Number(prodStock),
          tags: tags.length > 0 ? tags : [prodCategory.toLowerCase()],
          material: prodMaterial.trim() || 'Anodized Aluminum',
          dimensions: '200 × 140 × 60 mm',
          description:
            prodDesc.trim() ||
            'Precision-engineered studio hardware crafted for long-term architectural durability.',
          imageUrl: prodImage,
        });
        setManageMsg('Product saved to Cloud Firestore and indexed.');
      }
      resetProductForm();
    } catch (err) {
      setManageErr(err instanceof Error ? err.message : 'Failed to save product.');
    } finally {
      setSavingProduct(false);
    }
  }

  async function handleDeleteProduct(id: string) {
    if (!isAdmin) return;
    setManageErr(null);
    try {
      await deleteProductInFirestore(id);
      setManageMsg('Product removed from Cloud Firestore.');
    } catch (err) {
      setManageErr(err instanceof Error ? err.message : 'Could not delete product.');
    }
  }

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin || !newCatName.trim()) return;
    setManageErr(null);
    try {
      await createCategoryInFirestore({
        name: newCatName.trim(),
        description: newCatDesc.trim() || `${newCatName.trim()} collection`,
      });
      setNewCatName('');
      setNewCatDesc('');
      setManageMsg('Category added to Cloud Firestore.');
    } catch (err) {
      setManageErr(err instanceof Error ? err.message : 'Could not create category.');
    }
  }

  async function handleDeleteCategory(name: string) {
    if (!isAdmin) return;
    const hasProducts = products.some((p) => p.category.toLowerCase() === name.toLowerCase());
    if (hasProducts) {
      setManageErr('Reassign or delete products in this category before removing it.');
      return;
    }
    try {
      await deleteCategoryInFirestore(name);
      setManageMsg(`Category "${name}" deleted from Cloud Firestore.`);
    } catch (err) {
      setManageErr(err instanceof Error ? err.message : 'Could not delete category.');
    }
  }

  async function handleSeedFirestore() {
    if (!isAdmin) return;
    setSeeding(true);
    setManageErr(null);
    try {
      const count = await seedInitialCatalogIfEmpty();
      setManageMsg(
        count > 0
          ? `Seeded ${count} products, categories, and historical orders into Cloud Firestore.`
          : 'Cloud Firestore already contains products.'
      );
    } catch (err) {
      setManageErr(err instanceof Error ? err.message : 'Could not seed Firestore.');
    } finally {
      setSeeding(false);
    }
  }

  return (
    <section className="max-w-[1280px] mx-auto px-6 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E4E4E0] pb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#18181B] tracking-tight">
            Sales Reports & Catalog Management
          </h1>
          <p className="text-sm text-[#52525B] mt-1">
            Live Cloud Firestore analytics aggregated via HashMaps, Max-Heaps, and Merge/Quick Sort.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#EBEBE8] rounded-md self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setSubTab('reports')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded cursor-pointer whitespace-nowrap ${
              subTab === 'reports' ? 'bg-white text-[#18181B] shadow-xs' : 'text-[#52525B]'
            }`}
          >
            Sales Reports
          </button>
          <button
            type="button"
            onClick={() => setSubTab('manage')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded cursor-pointer whitespace-nowrap ${
              subTab === 'manage' ? 'bg-white text-[#18181B] shadow-xs' : 'text-[#52525B]'
            }`}
          >
            Manage Catalog
          </button>
        </div>
      </div>

      {subTab === 'reports' ? (
        <div className="space-y-8">
          {/* 5-card KPI Strip including Total Products */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white border border-[#E4E4E0] rounded-lg p-5">
              <p className="text-xs text-[#71717A]">Total Products</p>
              <p className="mt-2 font-mono text-2xl font-bold text-[#18181B] tabular-nums">
                {products.length}
              </p>
            </div>
            <div className="bg-white border border-[#E4E4E0] rounded-lg p-5">
              <p className="text-xs text-[#71717A]">Total Revenue</p>
              <p className="mt-2 font-mono text-2xl font-bold text-[#18181B] tabular-nums">
                ${report.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-white border border-[#E4E4E0] rounded-lg p-5">
              <p className="text-xs text-[#71717A]">Total Orders</p>
              <p className="mt-2 font-mono text-2xl font-bold text-[#18181B] tabular-nums">
                {report.totalOrders}
              </p>
            </div>
            <div className="bg-white border border-[#E4E4E0] rounded-lg p-5">
              <p className="text-xs text-[#71717A]">Units Sold</p>
              <p className="mt-2 font-mono text-2xl font-bold text-[#18181B] tabular-nums">
                {report.totalUnitsSold}
              </p>
            </div>
            <div className="bg-white border border-[#E4E4E0] rounded-lg p-5">
              <p className="text-xs text-[#71717A]">Average Order Value</p>
              <p className="mt-2 font-mono text-2xl font-bold text-[#18181B] tabular-nums">
                ${report.averageOrderValue.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Category Breakdown & Daily Revenue Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-[#E4E4E0] rounded-lg p-6">
              <h2 className="font-display text-base font-semibold text-[#18181B] mb-1">
                Revenue by Category
              </h2>
              <p className="text-xs text-[#71717A] mb-5">
                Aggregated with HashMap buckets and sorted via Merge Sort
              </p>
              <div className="space-y-4">
                {report.categoryBreakdown.map((cat) => (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-medium text-[#18181B]">
                        {cat.category}{' '}
                        <span className="text-[#71717A] font-normal">({cat.unitsSold} units)</span>
                      </span>
                      <span className="font-mono tabular-nums text-[#18181B]">
                        ${cat.revenue.toFixed(0)} · {cat.sharePercent}%
                      </span>
                    </div>
                    <div className="h-2 bg-[#F1F1EF] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#18181B] rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(4, cat.sharePercent)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-[#E4E4E0] rounded-lg p-6">
              <div className="mb-5">
                <h2 className="font-display text-base font-semibold text-[#18181B] inline-flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[#2563EB]" />
                  Daily Sales Revenue
                </h2>
                <p className="text-xs text-[#71717A] mt-0.5">
                  Chronological revenue distribution across recorded Firestore orders
                </p>
              </div>

              {report.dailyRevenue.length === 0 ? (
                <p className="text-xs text-[#71717A] py-12 text-center">
                  {user ? 'No orders recorded yet.' : 'Sign in to view your order sales trend, or sign in as Admin for store-wide metrics.'}
                </p>
              ) : (
                <div className="h-44 flex items-end gap-3 pt-4 border-b border-[#E4E4E0]">
                  {report.dailyRevenue.map((day) => {
                    const heightPct = Math.max(
                      10,
                      Math.round((day.revenue / maxDailyRevenue) * 100)
                    );
                    return (
                      <div
                        key={day.date}
                        className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end"
                      >
                        <span className="font-mono text-[10px] text-[#52525B] tabular-nums">
                          ${day.revenue.toFixed(0)}
                        </span>
                        <div
                          className="w-full max-w-[44px] bg-[#2563EB] rounded-t-sm transition-all duration-300"
                          style={{ height: `${heightPct}%` }}
                          title={`${day.date}: $${day.revenue.toFixed(2)} (${day.orders} orders)`}
                        />
                        <span className="font-mono text-[10px] text-[#71717A] tabular-nums pb-1">
                          {day.date.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Most Popular & Highest-Rated (Max-Heap) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-[#E4E4E0] rounded-lg p-6">
              <h2 className="font-display text-base font-semibold text-[#18181B]">
                Most Popular Products (Max-Heap)
              </h2>
              <p className="text-xs text-[#71717A] mt-0.5 mb-4">
                Weighted by cumulative order volume and rating
              </p>
              <div className="divide-y divide-[#F1F1EF] text-xs">
                {mostPopularProducts.map((p, i) => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between gap-4">
                    <span className="font-medium text-[#18181B] truncate">
                      <span className="font-mono text-[#71717A] mr-2">#{i + 1}</span>
                      {p.name}
                    </span>
                    <span className="font-mono text-[#52525B] tabular-nums shrink-0">
                      {p.salesCount} sold
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-[#E4E4E0] rounded-lg p-6">
              <h2 className="font-display text-base font-semibold text-[#18181B]">
                Product Ratings Leaderboard (Max-Heap)
              </h2>
              <p className="text-xs text-[#71717A] mt-0.5 mb-4">
                Top-rated objects extracted via Binary Max-Heap
              </p>
              <div className="divide-y divide-[#F1F1EF] text-xs">
                {topRatedProducts.map((p, i) => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between gap-4">
                    <span className="font-medium text-[#18181B] truncate">
                      <span className="font-mono text-[#71717A] mr-2">#{i + 1}</span>
                      {p.name}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono text-[#18181B] tabular-nums shrink-0">
                      <Star className="w-3 h-3 fill-[#18181B]" />
                      {p.rating.toFixed(1)} ({p.reviewCount})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Best-Selling Products from Orders (Max-Heap) */}
          <div className="bg-white border border-[#E4E4E0] rounded-lg p-6">
            <h2 className="font-display text-base font-semibold text-[#18181B]">
              Best-Selling Products by Order Revenue (Binary Max-Heap Extraction)
            </h2>
            <p className="text-xs text-[#71717A] mt-0.5 mb-4">
              Top-K revenue performers extracted in O(N + K log N) time
            </p>
            {report.topSellingProducts.length === 0 ? (
              <p className="text-xs text-[#71717A]">No order line items recorded in scope.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E4E4E0] text-[#71717A]">
                      <th className="py-2.5 pr-4 font-medium">Rank</th>
                      <th className="py-2.5 pr-4 font-medium">SKU</th>
                      <th className="py-2.5 pr-4 font-medium">Product</th>
                      <th className="py-2.5 pr-4 font-medium">Category</th>
                      <th className="py-2.5 pr-4 text-right font-medium">Units Sold</th>
                      <th className="py-2.5 text-right font-medium">Gross Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F1EF]">
                    {report.topSellingProducts.map((item, idx) => (
                      <tr key={item.productId}>
                        <td className="py-3 pr-4 font-mono tabular-nums text-[#71717A]">#{idx + 1}</td>
                        <td className="py-3 pr-4 font-mono text-[#52525B]">{item.sku}</td>
                        <td className="py-3 pr-4 font-medium text-[#18181B]">{item.name}</td>
                        <td className="py-3 pr-4 text-[#52525B]">{item.category}</td>
                        <td className="py-3 pr-4 text-right font-mono tabular-nums">{item.unitsSold}</td>
                        <td className="py-3 text-right font-mono font-semibold text-[#18181B] tabular-nums">
                          ${item.revenue.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Order Ledger + Live DSA Index Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white border border-[#E4E4E0] rounded-lg p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="font-display text-base font-semibold text-[#18181B]">
                  Order Ledger
                </h2>
                <div className="flex items-center gap-2 text-xs">
                  <select
                    aria-label="Sort ledger by"
                    value={ledgerSortBy}
                    onChange={(e) => setLedgerSortBy(e.target.value as 'date' | 'total')}
                    className="px-2.5 py-1.5 border border-[#E4E4E0] rounded-md bg-[#F8F8F7] text-[#18181B]"
                  >
                    <option value="date">Newest First</option>
                    <option value="total">Highest Total</option>
                  </select>
                  <select
                    aria-label="Ledger sort algorithm"
                    value={ledgerSortAlgo}
                    onChange={(e) => setLedgerSortAlgo(e.target.value as 'merge' | 'quick')}
                    className="px-2.5 py-1.5 border border-[#E4E4E0] rounded-md bg-[#F8F8F7] text-[#18181B]"
                  >
                    <option value="merge">Merge Sort</option>
                    <option value="quick">Quick Sort</option>
                  </select>
                </div>
              </div>

              {sortedLedger.length === 0 ? (
                <p className="text-xs text-[#71717A] py-8">No orders available for the current account.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[#E4E4E0] text-[#71717A]">
                        <th className="py-2 pr-3 font-medium">Order</th>
                        <th className="py-2 pr-3 font-medium">Customer</th>
                        <th className="py-2 pr-3 font-medium">Date</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F1EF]">
                      {sortedLedger.slice(0, 10).map((ord) => (
                        <tr key={ord.id}>
                          <td className="py-2.5 pr-3 font-mono font-semibold text-[#18181B] tabular-nums">
                            {ord.id}
                          </td>
                          <td className="py-2.5 pr-3 text-[#18181B]">{ord.customerName}</td>
                          <td className="py-2.5 pr-3 font-mono text-[#71717A] tabular-nums">
                            {ord.createdAt.slice(0, 10)}
                          </td>
                          <td className="py-2.5 pr-3 text-[#52525B]">{ord.status}</td>
                          <td className="py-2.5 text-right font-mono font-semibold text-[#18181B] tabular-nums">
                            ${ord.total.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white border border-[#E4E4E0] rounded-lg p-6">
              <h2 className="font-display text-base font-semibold text-[#18181B]">
                Engine Data Structures
              </h2>
              <p className="text-xs text-[#71717A] mt-0.5 mb-5">
                Live structural metrics computed over Cloud Firestore data
              </p>
              <dl className="space-y-3 text-xs">
                <div className="flex justify-between py-2 border-b border-[#F1F1EF]">
                  <dt className="text-[#52525B]">HashMap / HashTable Entries</dt>
                  <dd className="font-mono font-semibold tabular-nums">
                    {diagnostics.hashTable.size} / {diagnostics.hashTable.capacity}
                  </dd>
                </div>
                <div className="flex justify-between py-2 border-b border-[#F1F1EF]">
                  <dt className="text-[#52525B]">Load Factor / Max Depth</dt>
                  <dd className="font-mono font-semibold tabular-nums">
                    {diagnostics.hashTable.loadFactor} · {diagnostics.hashTable.maxBucketDepth}
                  </dd>
                </div>
                <div className="flex justify-between py-2 border-b border-[#F1F1EF]">
                  <dt className="text-[#52525B]">Inverted Index Tokens</dt>
                  <dd className="font-mono font-semibold tabular-nums">
                    {diagnostics.invertedIndexTokens}
                  </dd>
                </div>
                <div className="flex justify-between py-2 border-b border-[#F1F1EF]">
                  <dt className="text-[#52525B]">Unique Categories Set</dt>
                  <dd className="font-mono font-semibold tabular-nums">
                    {diagnostics.uniqueCategoriesCount}
                  </dd>
                </div>
                <div className="flex justify-between py-2 border-b border-[#F1F1EF]">
                  <dt className="text-[#52525B]">Graph Vertices</dt>
                  <dd className="font-mono font-semibold tabular-nums">
                    {diagnostics.graph.vertices}
                  </dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-[#52525B]">Co-Purchase Graph Edges</dt>
                  <dd className="font-mono font-semibold tabular-nums">
                    {diagnostics.graph.edges}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      ) : !isAdmin ? (
        <div className="max-w-md mx-auto bg-white border border-[#E4E4E0] rounded-lg p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-2.5">
            <Lock className="w-4 h-4 text-[#18181B]" />
            <h2 className="font-display text-lg font-bold text-[#18181B]">
              Admin Authorization Required
            </h2>
          </div>
          <p className="text-xs text-[#52525B] leading-relaxed">
            {user
              ? `Signed in as ${user.email} (${user.role}). Only authorized store administrators can create, update, or delete products and categories in Cloud Firestore.`
              : 'Sign in with an authorized store administrator Google account to manage Cloud Firestore products, categories, and Firebase Storage images.'}
          </p>
          {!user && (
            <button
              type="button"
              onClick={() => void signInWithPopup(auth, googleProvider)}
              className="w-full py-2.5 px-4 text-sm font-medium bg-[#18181B] text-white rounded-md hover:bg-[#27272A] cursor-pointer"
            >
              Sign In with Google
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {firestoreEmpty && (
            <div className="bg-white border border-[#E4E4E0] rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[#18181B]">
                  Cloud Firestore Catalog is Empty
                </p>
                <p className="text-xs text-[#52525B] mt-0.5">
                  Write the initial curated products, categories, and historical orders into your Firestore database.
                </p>
              </div>
              <button
                type="button"
                disabled={seeding}
                onClick={handleSeedFirestore}
                className="px-4 py-2 text-xs font-medium bg-[#18181B] text-white rounded-md hover:bg-[#27272A] disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                {seeding ? 'Seeding Firestore...' : 'Seed Catalog to Firestore'}
              </button>
            </div>
          )}

          {manageMsg && (
            <div className="px-4 py-3 text-xs font-medium bg-[#F1F1EF] border border-[#E4E4E0] rounded-md text-[#18181B]">
              {manageMsg}
            </div>
          )}
          {manageErr && (
            <div className="px-4 py-3 text-xs font-medium bg-red-50 border border-red-200 rounded-md text-red-700">
              {manageErr}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Add / Edit Product Form */}
            <form
              onSubmit={handleSaveProduct}
              className="bg-white border border-[#E4E4E0] rounded-lg p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-[#18181B]">
                  {editingId ? 'Edit Product' : 'Add New Product'}
                </h2>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetProductForm}
                    className="text-xs text-[#2563EB] hover:underline cursor-pointer"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-[#52525B] mb-1">Product Name</label>
                <input
                  type="text"
                  required
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  placeholder="Helios Acoustic Diffuser"
                  className="w-full px-3 py-2 text-sm border border-[#E4E4E0] rounded-md"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#52525B] mb-1">SKU</label>
                  <input
                    type="text"
                    value={prodSku}
                    onChange={(e) => setProdSku(e.target.value)}
                    placeholder="KA-AUD-04"
                    className="w-full px-3 py-2 text-sm font-mono border border-[#E4E4E0] rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#52525B] mb-1">Category</label>
                  <select
                    value={prodCategory}
                    onChange={(e) => setProdCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#E4E4E0] rounded-md bg-white"
                  >
                    {categories.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#52525B] mb-1">Price ($)</label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={prodPrice}
                    onChange={(e) => setProdPrice(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-[#E4E4E0] rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#52525B] mb-1">Stock</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={prodStock}
                    onChange={(e) => setProdStock(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-[#E4E4E0] rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#52525B] mb-1">Rating</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    step="0.1"
                    required
                    value={prodRating}
                    onChange={(e) => setProdRating(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-[#E4E4E0] rounded-md"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-[#52525B]">
                  Product Image (Firebase Storage Upload or Studio Preset)
                </label>
                <label className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium border border-dashed border-[#C8C8C2] rounded-md bg-[#F8F8F7] hover:border-[#18181B] cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingImage ? 'Uploading to Firebase Storage...' : 'Upload Image File'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingImage}
                    onChange={handleImageFileUpload}
                    className="hidden"
                  />
                </label>
                <select
                  value={STUDIO_IMAGE_PRESETS.some((i) => i.url === prodImage) ? prodImage : ''}
                  onChange={(e) => {
                    if (e.target.value) setProdImage(e.target.value);
                  }}
                  className="w-full px-3 py-2 text-sm border border-[#E4E4E0] rounded-md bg-white"
                >
                  <option value="">Custom / Uploaded Storage URL</option>
                  {STUDIO_IMAGE_PRESETS.map((img) => (
                    <option key={img.url} value={img.url}>
                      {img.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#52525B] mb-1">Material</label>
                <input
                  type="text"
                  value={prodMaterial}
                  onChange={(e) => setProdMaterial(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E4E4E0] rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#52525B] mb-1">
                  Tags (comma-separated for Set matching)
                </label>
                <input
                  type="text"
                  value={prodTags}
                  onChange={(e) => setProdTags(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E4E4E0] rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#52525B] mb-1">Description</label>
                <textarea
                  rows={2}
                  value={prodDesc}
                  onChange={(e) => setProdDesc(e.target.value)}
                  placeholder="Concise architectural specification..."
                  className="w-full px-3 py-2 text-sm border border-[#E4E4E0] rounded-md"
                />
              </div>

              <button
                type="submit"
                disabled={savingProduct || uploadingImage}
                className="w-full py-2.5 px-4 text-xs font-medium bg-[#18181B] text-white rounded-md hover:bg-[#27272A] disabled:opacity-50 inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {savingProduct
                  ? 'Saving to Firestore...'
                  : editingId
                  ? 'Save Product Changes'
                  : 'Add Product to Firestore'}
              </button>
            </form>

            {/* Product Inventory Table & Category Management */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white border border-[#E4E4E0] rounded-lg p-6">
                <h2 className="font-display text-base font-semibold text-[#18181B] mb-4">
                  Firestore Catalog Inventory ({products.length})
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[#E4E4E0] text-[#71717A]">
                        <th className="py-2 pr-3 font-medium">SKU</th>
                        <th className="py-2 pr-3 font-medium">Name</th>
                        <th className="py-2 pr-3 font-medium">Category</th>
                        <th className="py-2 pr-3 text-right font-medium">Price</th>
                        <th className="py-2 pr-3 text-right font-medium">Stock</th>
                        <th className="py-2 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F1EF]">
                      {products.map((p) => (
                        <tr key={p.id}>
                          <td className="py-2.5 pr-3 font-mono text-[#52525B]">{p.sku}</td>
                          <td className="py-2.5 pr-3 font-medium text-[#18181B]">{p.name}</td>
                          <td className="py-2.5 pr-3 text-[#52525B]">{p.category}</td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums">${p.price}</td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{p.stock}</td>
                          <td className="py-2.5 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => startEditProduct(p)}
                              aria-label={`Edit ${p.name}`}
                              className="inline-flex items-center p-1.5 text-[#52525B] hover:text-[#18181B] cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProduct(p.id)}
                              aria-label={`Delete ${p.name}`}
                              className="inline-flex items-center p-1.5 text-[#71717A] hover:text-red-700 cursor-pointer ml-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white border border-[#E4E4E0] rounded-lg p-6">
                <h2 className="font-display text-base font-semibold text-[#18181B] mb-4">
                  Category Management
                </h2>
                <form onSubmit={handleCreateCategory} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                  <input
                    type="text"
                    required
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="New category name"
                    className="px-3 py-2 text-sm border border-[#E4E4E0] rounded-md"
                  />
                  <input
                    type="text"
                    value={newCatDesc}
                    onChange={(e) => setNewCatDesc(e.target.value)}
                    placeholder="Short description"
                    className="px-3 py-2 text-sm border border-[#E4E4E0] rounded-md"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-medium bg-[#18181B] text-white rounded-md hover:bg-[#27272A] cursor-pointer whitespace-nowrap"
                  >
                    Add Category
                  </button>
                </form>

                <div className="divide-y divide-[#F1F1EF] border-t border-[#E4E4E0]">
                  {categories.map((cat) => (
                    <div key={cat.name} className="py-3 flex items-center justify-between gap-4 text-xs">
                      <div>
                        <span className="font-semibold text-[#18181B]">{cat.name}</span>
                        <span className="text-[#71717A] ml-2">
                          · {products.filter((p) => p.category === cat.name).length} products
                        </span>
                        <p className="text-[#71717A] mt-0.5">{cat.description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat.name)}
                        className="px-2.5 py-1 text-xs text-[#71717A] hover:text-red-700 border border-[#E4E4E0] rounded cursor-pointer whitespace-nowrap"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
