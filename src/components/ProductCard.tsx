import { Heart, Plus, Star } from 'lucide-react';
import type { Product } from '../types.ts';
import { ProductImage } from './ProductImage.tsx';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  isWishlisted?: boolean;
  onToggleWishlist?: (product: Product) => void;
  subNote?: string;
}

export function ProductCard({
  product,
  onSelect,
  onAddToCart,
  isWishlisted = false,
  onToggleWishlist,
  subNote,
}: ProductCardProps) {
  const outOfStock = product.stock <= 0;

  return (
    <article className="group flex flex-col bg-white border border-[#E4E4E0] rounded-lg overflow-hidden transition-transform duration-200 hover:-translate-y-0.5 hover:border-[#C8C8C2]">
      <div className="relative aspect-[4/3] w-full bg-[#F1F1EF] overflow-hidden">
        <button
          type="button"
          onClick={() => onSelect(product)}
          className="w-full h-full block text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2563EB]"
        >
          <ProductImage
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </button>

        {onToggleWishlist && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleWishlist(product);
            }}
            aria-label={isWishlisted ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
            className="absolute top-3 right-3 w-8 h-8 inline-flex items-center justify-center rounded-md bg-white/90 border border-[#E4E4E0] text-[#52525B] hover:text-[#18181B] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            <Heart
              className={`w-3.5 h-3.5 ${
                isWishlisted ? 'fill-[#2563EB] text-[#2563EB]' : 'text-[#52525B]'
              }`}
            />
          </button>
        )}
      </div>

      <div className="p-5 flex flex-col flex-1 justify-between gap-4">
        <div>
          <div className="flex items-center justify-between gap-2 text-xs text-[#71717A] mb-1.5">
            <span className="truncate">{product.category}</span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums shrink-0 text-[#52525B]">
              <Star className="w-3 h-3 fill-[#18181B] text-[#18181B]" />
              {product.rating.toFixed(1)} ({product.reviewCount})
            </span>
          </div>

          <button
            type="button"
            onClick={() => onSelect(product)}
            className="text-left block w-full cursor-pointer focus-visible:outline-none focus-visible:underline"
          >
            <h3 className="font-display text-base font-semibold text-[#18181B] leading-snug line-clamp-1 group-hover:text-[#2563EB] transition-colors">
              {product.name}
            </h3>
          </button>

          {subNote ? (
            <p className="mt-1.5 text-xs text-[#52525B] line-clamp-1">{subNote}</p>
          ) : (
            <p className="mt-1.5 text-xs text-[#71717A] line-clamp-1">{product.material}</p>
          )}
        </div>

        <div className="pt-3 border-t border-[#F1F1EF] flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="font-mono text-[15px] font-semibold text-[#18181B] tabular-nums">
              ${product.price.toFixed(0)}
            </span>
            <span className="text-[11px] text-[#71717A] tabular-nums">
              {outOfStock ? 'Out of stock' : `${product.stock} in stock · ${product.salesCount} sold`}
            </span>
          </div>

          <button
            type="button"
            disabled={outOfStock}
            onClick={() => onAddToCart(product)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-[#E4E4E0] bg-[#F8F8F7] text-[#18181B] hover:bg-[#18181B] hover:text-white hover:border-[#18181B] disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{outOfStock ? 'Sold Out' : 'Add to Bag'}</span>
          </button>
        </div>
      </div>
    </article>
  );
}
