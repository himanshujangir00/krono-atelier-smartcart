import { useEffect, useState } from 'react';
import { Heart, Minus, Plus, Share2, Star, X } from 'lucide-react';
import type { GraphRecommendation, Product } from '../types.ts';
import { ProductImage } from './ProductImage.tsx';

interface ProductDetailModalProps {
  product: Product | null;
  related: GraphRecommendation[];
  isWishlisted?: boolean;
  onToggleWishlist?: (product: Product) => void;
  onClose: () => void;
  onAddToCart: (product: Product, quantity: number) => void;
  onSelectRelated: (product: Product) => void;
}

export function ProductDetailModal({
  product,
  related,
  isWishlisted = false,
  onToggleWishlist,
  onClose,
  onAddToCart,
  onSelectRelated,
}: ProductDetailModalProps) {
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (product) setQuantity(1);
  }, [product]);

  if (!product) return null;

  const outOfStock = product.stock <= 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[2px] p-4 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdp-title"
    >
      <div className="relative w-full max-w-4xl bg-white border border-[#E4E4E0] rounded-xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close product details"
          className="absolute top-4 right-4 z-10 w-9 h-9 inline-flex items-center justify-center rounded-md bg-white/90 border border-[#E4E4E0] text-[#18181B] hover:bg-[#F1F1EF] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Contiguous Purchase Module */}
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="bg-[#F1F1EF] aspect-[4/3] md:aspect-auto md:h-full">
            <ProductImage
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="p-6 sm:p-8 flex flex-col justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-xs text-[#71717A] mb-2">
                <span>{product.category}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{product.sku}</span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 text-[#18181B] font-mono tabular-nums">
                  <Star className="w-3 h-3 fill-[#18181B]" />
                  {product.rating.toFixed(1)}
                </span>
              </div>

              <h2 id="pdp-title" className="font-display text-2xl font-bold text-[#18181B] tracking-tight">
                {product.name}
              </h2>

              <div className="mt-3 flex items-baseline gap-3">
                <span className="font-mono text-2xl font-semibold text-[#18181B] tabular-nums">
                  ${product.price.toFixed(2)}
                </span>
                <span className="text-xs text-[#52525B] tabular-nums">
                  {outOfStock ? 'Out of Stock' : `In Stock (${product.stock} available)`}
                </span>
              </div>

              <p className="mt-4 text-sm text-[#52525B] leading-relaxed">{product.description}</p>

              <dl className="mt-5 pt-4 border-t border-[#E4E4E0] grid grid-cols-1 gap-2.5 text-xs">
                <div className="flex justify-between gap-4">
                  <dt className="text-[#71717A]">Material</dt>
                  <dd className="text-[#18181B] text-right font-medium">{product.material}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#71717A]">Dimensions</dt>
                  <dd className="text-[#18181B] font-mono tabular-nums text-right">{product.dimensions}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#71717A]">Attributes</dt>
                  <dd className="text-[#52525B] text-right">{product.tags.join(' · ')}</dd>
                </div>
              </dl>
            </div>

            <div className="pt-4 border-t border-[#E4E4E0] flex items-center gap-3">
              <div className="inline-flex items-center border border-[#E4E4E0] rounded-md bg-[#F8F8F7]">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                  className="w-9 h-10 inline-flex items-center justify-center text-[#52525B] hover:text-[#18181B] cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-8 text-center font-mono text-sm tabular-nums text-[#18181B]">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(Math.max(1, product.stock), q + 1))}
                  aria-label="Increase quantity"
                  className="w-9 h-10 inline-flex items-center justify-center text-[#52525B] hover:text-[#18181B] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                disabled={outOfStock}
                onClick={() => {
                  onAddToCart(product, quantity);
                  onClose();
                }}
                className="flex-1 h-10 px-5 text-sm font-medium bg-[#18181B] text-white rounded-md hover:bg-[#27272A] disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
              >
                {outOfStock ? 'Out of Stock' : `Add to Bag — $${(product.price * quantity).toFixed(0)}`}
              </button>

              {onToggleWishlist && (
                <button
                  type="button"
                  onClick={() => onToggleWishlist(product)}
                  aria-label={isWishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
                  className="w-10 h-10 inline-flex items-center justify-center border border-[#E4E4E0] rounded-md bg-[#F8F8F7] hover:border-[#18181B] transition-colors cursor-pointer shrink-0"
                >
                  <Heart
                    className={`w-4 h-4 ${
                      isWishlisted ? 'fill-[#2563EB] text-[#2563EB]' : 'text-[#52525B]'
                    }`}
                  />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Graph-Based Related Products Section */}
        <div className="border-t border-[#E4E4E0] bg-[#F8F8F7] p-6 sm:p-8">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="font-display text-sm font-semibold text-[#18181B] inline-flex items-center gap-2">
                <Share2 className="w-4 h-4 text-[#2563EB]" />
                Related Products
              </h3>
              <p className="text-xs text-[#71717A] mt-0.5">
                Ranked via weighted co-purchase and attribute graph traversal
              </p>
            </div>
          </div>

          {related.length === 0 ? (
            <p className="text-xs text-[#71717A]">No graph connections recorded yet for this item.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {related.map((rec) => (
                <button
                  key={rec.product.id}
                  type="button"
                  onClick={() => onSelectRelated(rec.product)}
                  className="text-left bg-white border border-[#E4E4E0] rounded-lg overflow-hidden hover:border-[#18181B] transition-colors cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                >
                  <div className="aspect-[4/3] bg-[#F1F1EF] overflow-hidden">
                    <ProductImage
                      src={rec.product.imageUrl}
                      alt={rec.product.name}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                    />
                  </div>
                  <div className="p-3">
                    <p className="text-[11px] text-[#2563EB] font-medium truncate">
                      {rec.reasons[0]} · w={rec.score}
                    </p>
                    <p className="text-xs font-semibold text-[#18181B] mt-0.5 truncate">
                      {rec.product.name}
                    </p>
                    <p className="font-mono text-xs text-[#52525B] mt-1 tabular-nums">
                      ${rec.product.price.toFixed(0)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
