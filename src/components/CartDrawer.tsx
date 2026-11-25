import { useEffect, useState } from 'react';
import { CheckCircle2, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { placeOrderInFirestore } from '../services/firestoreService.ts';
import type { CartItem, Order, UserProfile } from '../types.ts';
import { ProductImage } from './ProductImage.tsx';

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQty: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  user: UserProfile | null;
  onRequestSignIn: () => void;
  onOrderSuccess: (order: Order) => void;
}

export function CartDrawer({
  open,
  onClose,
  items,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  user,
  onRequestSignIn,
  onOrderSuccess,
}: CartDrawerProps) {
  const [customerName, setCustomerName] = useState(user?.name ?? '');
  const [customerEmail, setCustomerEmail] = useState(user?.email ?? '');
  const [shippingAddress, setShippingAddress] = useState(user?.defaultShippingAddress ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (user) {
      setCustomerName((prev) => prev || user.name);
      setCustomerEmail((prev) => prev || user.email);
      if (user.defaultShippingAddress) {
        setShippingAddress((prev) => prev || user.defaultShippingAddress || '');
      }
    }
  }, [user]);

  if (!open) return null;

  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const freeShippingThreshold = 250;
  const shippingFee = subtotal === 0 || subtotal >= freeShippingThreshold ? 0 : 18;
  const total = subtotal + shippingFee;

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!user) {
      setError('Please sign in first to place your order in Cloud Firestore.');
      return;
    }
    if (!user.emailVerified) {
      setError('Please verify your email address in the Account tab before placing an order.');
      return;
    }

    setSubmitting(true);
    try {
      const order = await placeOrderInFirestore(
        user.id,
        { customerName, customerEmail, shippingAddress },
        items,
        user.purchasedProductIds
      );
      setConfirmedOrder(order);
      onClearCart();
      onOrderSuccess(order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not place order.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="Shopping Bag">
      <div className="w-full max-w-md bg-white h-full border-l border-[#E4E4E0] flex flex-col">
        <div className="px-6 py-4 border-b border-[#E4E4E0] flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-[#18181B] inline-flex items-center gap-2">
            <ShoppingBag className="w-4 h-4" />
            Shopping Bag
          </h2>
          <button
            type="button"
            onClick={() => {
              setConfirmedOrder(null);
              onClose();
            }}
            aria-label="Close bag"
            className="w-8 h-8 inline-flex items-center justify-center rounded-md text-[#52525B] hover:bg-[#F1F1EF] hover:text-[#18181B] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {confirmedOrder ? (
            <div className="space-y-5">
              <div className="p-4 rounded-lg bg-[#F1F1EF] border border-[#E4E4E0]">
                <div className="flex items-center gap-2 text-[#18181B] font-semibold text-sm">
                  <CheckCircle2 className="w-4 h-4 text-[#2563EB]" />
                  <span>Order {confirmedOrder.id} Confirmed — {confirmedOrder.status}</span>
                </div>
                <p className="text-xs text-[#52525B] mt-1">
                  Saved to Cloud Firestore for {confirmedOrder.customerName}. Inventory stock, co-purchase graph edges, and sales analytics have updated live.
                </p>
              </div>

              <div className="border border-[#E4E4E0] rounded-lg divide-y divide-[#E4E4E0]">
                {confirmedOrder.items.map((item) => (
                  <div key={item.productId} className="p-3 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-medium text-[#18181B]">{item.name}</p>
                      <p className="text-[#71717A] font-mono tabular-nums">
                        {item.quantity} × ${item.price.toFixed(0)}
                      </p>
                    </div>
                    <span className="font-mono font-semibold text-[#18181B] tabular-nums">
                      ${(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
                <div className="p-3 flex items-center justify-between text-xs bg-[#F8F8F7]">
                  <span className="font-medium text-[#52525B]">Total Paid</span>
                  <span className="font-mono text-sm font-bold text-[#18181B] tabular-nums">
                    ${confirmedOrder.total.toFixed(2)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setConfirmedOrder(null);
                  onClose();
                }}
                className="w-full py-2.5 px-4 text-xs font-medium bg-[#18181B] text-white rounded-md hover:bg-[#27272A] cursor-pointer"
              >
                Continue Browsing
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-16">
              <ShoppingBag className="w-8 h-8 text-[#A1A1AA] mb-3 stroke-[1.5]" />
              <p className="font-display text-sm font-semibold text-[#18181B]">Your bag is empty</p>
              <p className="text-xs text-[#71717A] mt-1 max-w-[240px]">
                Select objects from the catalog to build an order or view graph-matched recommendations.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-xs text-[#52525B] pb-3 border-b border-[#E4E4E0]">
                {subtotal >= freeShippingThreshold ? (
                  <span>Complimentary studio courier shipping unlocked.</span>
                ) : (
                  <span className="tabular-nums">
                    Add ${(freeShippingThreshold - subtotal).toFixed(0)} more for complimentary shipping ($250 threshold).
                  </span>
                )}
              </div>

              <ul className="divide-y divide-[#E4E4E0]">
                {items.map((item) => (
                  <li key={item.product.id} className="py-4 flex gap-4">
                    <div className="w-20 h-16 rounded-md bg-[#F1F1EF] overflow-hidden shrink-0">
                      <ProductImage
                        src={item.product.imageUrl}
                        alt={item.product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-[#18181B] truncate">
                          {item.product.name}
                        </p>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.product.id)}
                          aria-label={`Remove ${item.product.name}`}
                          className="text-[#71717A] hover:text-[#18181B] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-xs text-[#71717A] font-mono tabular-nums mt-0.5">
                        ${item.product.price.toFixed(0)} each
                      </p>
                      <div className="mt-2.5 flex items-center justify-between">
                        <div className="inline-flex items-center border border-[#E4E4E0] rounded bg-[#F8F8F7]">
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.product.id, item.quantity - 1)}
                            aria-label="Decrease item quantity"
                            className="w-7 h-7 inline-flex items-center justify-center text-[#52525B] hover:text-[#18181B] cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-7 text-center font-mono text-xs tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateQty(
                                item.product.id,
                                Math.min(item.product.stock, item.quantity + 1)
                              )
                            }
                            aria-label="Increase item quantity"
                            className="w-7 h-7 inline-flex items-center justify-center text-[#52525B] hover:text-[#18181B] cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="font-mono text-sm font-semibold text-[#18181B] tabular-nums">
                          ${(item.product.price * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Totals Summary */}
              <div className="pt-4 border-t border-[#E4E4E0] space-y-2 text-xs">
                <div className="flex justify-between text-[#52525B]">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[#52525B]">
                  <span>Shipping</span>
                  <span className="font-mono tabular-nums">
                    {shippingFee === 0 ? 'Complimentary' : `$${shippingFee.toFixed(2)}`}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-[#18181B] pt-2 border-t border-[#E4E4E0]">
                  <span>Total</span>
                  <span className="font-mono tabular-nums">${total.toFixed(2)}</span>
                </div>
              </div>

              {/* Checkout Form */}
              {!user ? (
                <div className="pt-4 border-t border-[#E4E4E0] space-y-3">
                  <p className="text-xs text-[#52525B] leading-relaxed">
                    Sign in with your account to complete checkout, update live stock, and sync your order history to Cloud Firestore.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onRequestSignIn();
                    }}
                    className="w-full py-2.5 px-4 text-sm font-medium bg-[#18181B] text-white rounded-md hover:bg-[#27272A] cursor-pointer"
                  >
                    Sign In to Checkout
                  </button>
                </div>
              ) : (
                <form onSubmit={handleCheckout} className="pt-4 border-t border-[#E4E4E0] space-y-3">
                  <h3 className="font-display text-sm font-semibold text-[#18181B]">
                    Shipping & Checkout
                  </h3>

                  {error && (
                    <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 break-words">
                      {error}
                    </p>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-[#52525B] mb-1" htmlFor="checkout-name">
                      Full Name
                    </label>
                    <input
                      id="checkout-name"
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Alex Mercer"
                      className="w-full px-3 py-2 text-sm border border-[#E4E4E0] rounded-md bg-white focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#52525B] mb-1" htmlFor="checkout-email">
                      Email Address
                    </label>
                    <input
                      id="checkout-email"
                      type="email"
                      required
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="alex@studio.com"
                      className="w-full px-3 py-2 text-sm border border-[#E4E4E0] rounded-md bg-white focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#52525B] mb-1" htmlFor="checkout-address">
                      Delivery Address
                    </label>
                    <input
                      id="checkout-address"
                      type="text"
                      required
                      minLength={5}
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                      placeholder="420 Brannan St, San Francisco, CA 94107"
                      className="w-full px-3 py-2 text-sm border border-[#E4E4E0] rounded-md bg-white focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 text-sm font-medium bg-[#18181B] text-white rounded-md hover:bg-[#27272A] disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {submitting ? 'Confirming Order...' : `Place Order — $${total.toFixed(2)}`}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
