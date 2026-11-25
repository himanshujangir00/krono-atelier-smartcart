import { Search, SlidersHorizontal, X } from 'lucide-react';
import type { SortAlgo, SortOption } from '../server/engine.ts';
import type {
  BrowsingHistoryItem,
  CategoryInfo,
  PersonalizedRecommendation,
  Product,
  SearchTelemetry,
  UserProfile,
} from '../types.ts';
import { ProductCard } from './ProductCard.tsx';
import { ProductImage } from './ProductImage.tsx';

interface StorefrontViewProps {
  products: Product[];
  topRated: Product[];
  mostPopular: Product[];
  categories: CategoryInfo[];
  allTags: string[];
  telemetry: SearchTelemetry | null;
  loadingCatalog: boolean;
  // Query controls
  searchQuery: string;
  onSearchChange: (value: string) => void;
  selectedCategory: string;
  onCategoryChange: (cat: string) => void;
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  pricePreset: 'all' | 'under-150' | '150-320' | 'over-320';
  onPricePresetChange: (preset: 'all' | 'under-150' | '150-320' | 'over-320') => void;
  sortBy: SortOption;
  onSortByChange: (sort: SortOption) => void;
  sortAlgo: SortAlgo;
  onSortAlgoChange: (algo: SortAlgo) => void;
  onResetFilters: () => void;
  // Top-K Heap toggle
  heapMode: 'rated' | 'popular';
  onHeapModeChange: (mode: 'rated' | 'popular') => void;
  // Personalized Set recommendations & wishlist/history
  recommendations: PersonalizedRecommendation[];
  guestPrefs: string[];
  onToggleGuestPref: (tag: string) => void;
  user: UserProfile | null;
  wishlistIds: Set<string>;
  browsingHistory: BrowsingHistoryItem[];
  // Actions
  onSelectProduct: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onToggleWishlist: (product: Product) => void;
}

export function StorefrontView({
  products,
  topRated,
  mostPopular,
  categories,
  allTags,
  telemetry,
  loadingCatalog,
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  selectedTags,
  onToggleTag,
  pricePreset,
  onPricePresetChange,
  sortBy,
  onSortByChange,
  sortAlgo,
  onSortAlgoChange,
  onResetFilters,
  heapMode,
  onHeapModeChange,
  recommendations,
  guestPrefs,
  onToggleGuestPref,
  user,
  wishlistIds,
  browsingHistory,
  onSelectProduct,
  onAddToCart,
  onToggleWishlist,
}: StorefrontViewProps) {
  const rankedList = heapMode === 'rated' ? topRated : mostPopular;
  const activePrefs = user ? user.preferences : guestPrefs;
  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    selectedCategory !== 'All' ||
    selectedTags.length > 0 ||
    pricePreset !== 'all';

  return (
    <div className="space-y-16 pb-20">
      {/* 1. Storefront Hero */}
      <section className="max-w-[1280px] mx-auto px-6 pt-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch bg-white border border-[#E4E4E0] rounded-xl overflow-hidden">
          <div className="lg:col-span-5 p-8 sm:p-10 lg:p-12 flex flex-col justify-between gap-8">
            <div>
              <p className="text-xs font-medium text-[#52525B] mb-3">
                Autumn Hardware Collection · Precision Acoustic & Desk Objects
              </p>
              <h1 className="font-display text-[clamp(2rem,3.6vw,3.1rem)] font-bold text-[#18181B] leading-[1.08] tracking-tight [text-wrap:balance]">
                Tactile instruments for focused studio work.
              </h1>
              <p className="mt-4 text-sm sm:text-base text-[#52525B] leading-relaxed max-w-md">
                Machined aluminum monitors, articulated high-CRI task lighting, and durable carry goods ranked in real time by rating, co-purchase graphs, and your preference profile.
              </p>
            </div>

            <div className="flex items-center gap-4">
              <a
                href="#catalog-workspace"
                className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium bg-[#18181B] text-white rounded-md hover:bg-[#27272A] transition-colors whitespace-nowrap"
              >
                Explore Collection
              </a>
              <a
                href="#top-ranked-section"
                className="text-sm font-medium text-[#18181B] hover:text-[#2563EB] transition-colors whitespace-nowrap"
              >
                View Top Ranked
              </a>
            </div>
          </div>

          <div className="lg:col-span-7 bg-[#EBEBE8] min-h-[280px] lg:min-h-[420px]">
            <ProductImage
              src="/src/assets/images/hero_atelier_showcase_1795583135897.jpg"
              alt="Krono Atelier studio desk with aluminum monitor speaker and articulated lamp"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* 2. Top-Rated & Popular Products (Binary Max-Heap) */}
      <section id="top-ranked-section" className="max-w-[1280px] mx-auto px-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-[#E4E4E0]">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#18181B] tracking-tight">
              {heapMode === 'rated' ? 'Top-Rated Objects' : 'Most Popular Objects'}
            </h2>
            <p className="text-xs text-[#71717A] mt-1">
              Extracted via Binary Max-Heap priority queue in O(N + K log N)
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#EBEBE8] rounded-md self-start sm:self-auto">
            <button
              type="button"
              onClick={() => onHeapModeChange('rated')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded cursor-pointer whitespace-nowrap transition-colors ${
                heapMode === 'rated' ? 'bg-white text-[#18181B] shadow-xs' : 'text-[#52525B]'
              }`}
            >
              Top Rated
            </button>
            <button
              type="button"
              onClick={() => onHeapModeChange('popular')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded cursor-pointer whitespace-nowrap transition-colors ${
                heapMode === 'popular' ? 'bg-white text-[#18181B] shadow-xs' : 'text-[#52525B]'
              }`}
            >
              Most Popular
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {rankedList.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              isWishlisted={wishlistIds.has(product.id)}
              onToggleWishlist={onToggleWishlist}
              onSelect={onSelectProduct}
              onAddToCart={onAddToCart}
              subNote={`Rank #${index + 1} · ${product.salesCount} studio orders`}
            />
          ))}
        </div>
      </section>

      {/* 3. Search, Filter & Catalog Grid */}
      <section id="catalog-workspace" className="max-w-[1280px] mx-auto px-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-[#E4E4E0]">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#18181B] tracking-tight">
              Complete Catalog
            </h2>
            <p className="text-xs text-[#71717A] mt-1">
              {telemetry
                ? `${telemetry.matchedCount} items · ${telemetry.searchAlgorithm} · ${telemetry.sortAlgorithm} (${telemetry.executionMs} ms)`
                : `${products.length} items`}
            </p>
          </div>

          {/* Search Input & Sort Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-[#71717A] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label="Search products by name, SKU, material, or tag"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search SKU, material, or object..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#E4E4E0] rounded-md focus:outline-none focus:border-[#2563EB]"
              />
            </div>

            <select
              aria-label="Sort products"
              value={sortBy}
              onChange={(e) => onSortByChange(e.target.value as SortOption)}
              className="px-3 py-2 text-xs font-medium bg-white border border-[#E4E4E0] rounded-md text-[#18181B] focus:outline-none focus:border-[#2563EB]"
            >
              <option value="popular">Sort: Popularity</option>
              <option value="rating">Sort: Highest Rated</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="name">Name: A to Z</option>
            </select>

            <select
              aria-label="Sorting algorithm"
              value={sortAlgo}
              onChange={(e) => onSortAlgoChange(e.target.value as SortAlgo)}
              className="px-3 py-2 text-xs font-mono bg-white border border-[#E4E4E0] rounded-md text-[#52525B] focus:outline-none focus:border-[#2563EB]"
            >
              <option value="merge">Merge Sort</option>
              <option value="quick">Quick Sort</option>
            </select>
          </div>
        </div>

        {/* Category Tabs + Binary Search Price Range + Set Tag Filters */}
        <div className="bg-white border border-[#E4E4E0] rounded-lg p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onCategoryChange('All')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  selectedCategory === 'All'
                    ? 'bg-[#18181B] text-white'
                    : 'bg-[#F1F1EF] text-[#52525B] hover:text-[#18181B]'
                }`}
              >
                All Collections
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => onCategoryChange(cat.name)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    selectedCategory === cat.name
                      ? 'bg-[#18181B] text-white'
                      : 'bg-[#F1F1EF] text-[#52525B] hover:text-[#18181B]'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Binary Search Price Brackets */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[#71717A] inline-flex items-center gap-1 mr-1">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Price:
              </span>
              {(
                [
                  { id: 'all', label: 'Any' },
                  { id: 'under-150', label: 'Under $150' },
                  { id: '150-320', label: '$150–$320' },
                  { id: 'over-320', label: '$320+' },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onPricePresetChange(preset.id)}
                  className={`px-2.5 py-1 rounded-md border text-xs font-mono tabular-nums cursor-pointer whitespace-nowrap transition-colors ${
                    pricePreset === preset.id
                      ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]'
                      : 'border-[#E4E4E0] bg-white text-[#52525B] hover:border-[#18181B]'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Attribute Tag Set Filter */}
          <div className="pt-3 border-t border-[#F1F1EF] flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-[#71717A] mr-1">Attributes (Set filter):</span>
              {allTags.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => onToggleTag(tag)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#18181B] text-white border-[#18181B]'
                        : 'bg-[#F8F8F7] text-[#52525B] border-[#E4E4E0] hover:border-[#18181B]'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={onResetFilters}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] hover:underline cursor-pointer whitespace-nowrap"
              >
                <X className="w-3.5 h-3.5" />
                Reset filters
              </button>
            )}
          </div>
        </div>

        {/* Product Grid */}
        {loadingCatalog ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="h-80 rounded-lg bg-[#EBEBE8] animate-pulse" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="bg-white border border-[#E4E4E0] rounded-lg py-16 px-6 text-center">
            <p className="font-display text-base font-semibold text-[#18181B]">
              No matching objects found
            </p>
            <p className="text-xs text-[#71717A] mt-1">
              Adjust your search terms, price range, or attribute set filters.
            </p>
            <button
              type="button"
              onClick={onResetFilters}
              className="mt-4 px-4 py-2 text-xs font-medium bg-[#18181B] text-white rounded-md hover:bg-[#27272A] cursor-pointer"
            >
              Clear All Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                isWishlisted={wishlistIds.has(product.id)}
                onToggleWishlist={onToggleWishlist}
                onSelect={onSelectProduct}
                onAddToCart={onAddToCart}
              />
            ))}
          </div>
        )}
      </section>

      {/* 4. Personalized Recommendations (CustomSet Jaccard Similarity + Browsing History + Graph) */}
      <section id="for-you-section" className="max-w-[1280px] mx-auto px-6">
        <div className="bg-white border border-[#E4E4E0] rounded-xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#E4E4E0]">
            <div>
              <h2 className="font-display text-xl font-bold text-[#18181B]">
                {user ? `Recommended for ${user.name}` : 'Recommended for Your Studio'}
              </h2>
              <p className="text-xs text-[#71717A] mt-1">
                {user
                  ? `Ranked via Set Jaccard Similarity & Co-Purchase Graph across your preferences, ${browsingHistory.length} viewed objects, and ${user.purchasedProductIds.length} purchases.`
                  : 'Select interest attributes below to compute real-time Jaccard Similarity recommendations (or sign in to sync browsing history).'}
              </p>
            </div>

            {!user && (
              <div className="flex flex-wrap items-center gap-1.5">
                {allTags.slice(0, 7).map((tag) => {
                  const active = activePrefs.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => onToggleGuestPref(tag)}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#2563EB] text-white border-[#2563EB]'
                          : 'bg-[#F8F8F7] text-[#52525B] border-[#E4E4E0] hover:border-[#18181B]'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {recommendations.map((rec) => (
              <ProductCard
                key={rec.product.id}
                product={rec.product}
                isWishlisted={wishlistIds.has(rec.product.id)}
                onToggleWishlist={onToggleWishlist}
                onSelect={onSelectProduct}
                onAddToCart={onAddToCart}
                subNote={`Jaccard ${(rec.similarityScore * 100).toFixed(0)}% · ${rec.reason}`}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
