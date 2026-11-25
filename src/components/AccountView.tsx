import { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { Eye, Heart, LogOut, MailCheck, PackageCheck, Plus, Trash2, User } from 'lucide-react';
import { auth, googleProvider } from '../firebase.ts';
import { updateUserProfileAndPreferences } from '../services/firestoreService.ts';
import type {
  BrowsingHistoryItem,
  Order,
  Product,
  UserProfile,
  WishlistItem,
} from '../types.ts';
import { ProductImage } from './ProductImage.tsx';

interface AccountViewProps {
  user: UserProfile | null;
  allTags: string[];
  orders: Order[];
  wishlist: WishlistItem[];
  browsingHistory: BrowsingHistoryItem[];
  productMap: Map<string, Product>;
  onUserUpdated: (user: UserProfile) => void;
  onRefreshAuthUser: () => Promise<void>;
  onAddToCart: (product: Product) => void;
  onToggleWishlist: (product: Product) => void;
  onSelectProduct: (product: Product) => void;
}

export function AccountView({
  user,
  allTags,
  orders,
  wishlist,
  browsingHistory,
  productMap,
  onUserUpdated,
  onRefreshAuthUser,
  onAddToCart,
  onToggleWishlist,
  onSelectProduct,
}: AccountViewProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedPrefs, setSelectedPrefs] = useState<string[]>(['acoustic', 'aluminum', 'minimalist']);
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [editName, setEditName] = useState(user?.name ?? '');
  const [editAddress, setEditAddress] = useState(user?.defaultShippingAddress ?? '');
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsSavedMsg, setPrefsSavedMsg] = useState(false);

  useEffect(() => {
    if (user) {
      setSelectedPrefs(user.preferences);
      setEditName(user.name);
      setEditAddress(user.defaultShippingAddress ?? '');
    }
  }, [user]);

  function togglePref(tag: string) {
    setSelectedPrefs((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function handleGoogleSignIn() {
    setError(null);
    setInfoMsg(null);
    setSubmitting(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);
    setSubmitting(true);

    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name.trim()) {
          await updateProfile(cred.user, { displayName: name.trim() });
        }
        await sendEmailVerification(cred.user);
        setInfoMsg('Account created. A verification email has been sent to your inbox.');
      }
      setPassword('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed.';
      if (msg.includes('operation-not-allowed')) {
        setError(
          'Email/Password sign-in is not yet enabled in your Firebase Console (Authentication → Sign-in method). Please use Continue with Google above, or enable Email/Password in Firebase Console.'
        );
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendVerification() {
    if (!auth.currentUser) return;
    setError(null);
    try {
      await sendEmailVerification(auth.currentUser);
      setInfoMsg('Verification link sent. Click Refresh Status after verifying.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send verification email.');
    }
  }

  async function handleRefreshVerification() {
    if (!auth.currentUser) return;
    setError(null);
    try {
      await reload(auth.currentUser);
      await onRefreshAuthUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not refresh status.');
    }
  }

  async function handleSaveProfileAndPrefs() {
    if (!user || !user.emailVerified) return;
    setSavingPrefs(true);
    setPrefsSavedMsg(false);
    setError(null);
    try {
      await updateUserProfileAndPreferences(user.id, {
        name: editName.trim() || user.name,
        preferences: selectedPrefs,
        defaultShippingAddress: editAddress.trim(),
        email: user.email,
      });
      onUserUpdated({
        ...user,
        name: editName.trim() || user.name,
        preferences: selectedPrefs,
        defaultShippingAddress: editAddress.trim(),
      });
      setPrefsSavedMsg(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile.');
    } finally {
      setSavingPrefs(false);
    }
  }

  async function handleLogout() {
    await signOut(auth);
  }

  if (!user) {
    return (
      <section className="max-w-[1280px] mx-auto px-6 py-12">
        <div className="max-w-lg mx-auto bg-white border border-[#E4E4E0] rounded-lg p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between border-b border-[#E4E4E0] pb-4">
            <div>
              <h1 className="font-display text-xl font-bold text-[#18181B]">
                {mode === 'login' ? 'Sign In' : 'Create Customer Account'}
              </h1>
              <p className="text-xs text-[#71717A] mt-1">
                Sync cart, wishlist, browsing history, and orders with Firebase.
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-[#F1F1EF] rounded-md">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`px-3 py-1 text-xs font-medium rounded cursor-pointer ${
                  mode === 'login' ? 'bg-white text-[#18181B] shadow-xs' : 'text-[#52525B]'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className={`px-3 py-1 text-xs font-medium rounded cursor-pointer ${
                  mode === 'register' ? 'bg-white text-[#18181B] shadow-xs' : 'text-[#52525B]'
                }`}
              >
                Register
              </button>
            </div>
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={handleGoogleSignIn}
            className="w-full py-2.5 px-4 text-sm font-medium bg-white border border-[#E4E4E0] text-[#18181B] rounded-md hover:border-[#18181B] transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            <span>Continue with Google</span>
          </button>

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-[#E4E4E0]" />
            <span className="px-3 text-[11px] text-[#71717A]">or use email</span>
            <div className="flex-grow border-t border-[#E4E4E0]" />
          </div>

          {error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 leading-relaxed">
              {error}
            </p>
          )}
          {infoMsg && (
            <p className="text-xs text-[#1D4ED8] bg-[#EFF6FF] border border-[#BFDBFE] rounded-md px-3 py-2">
              {infoMsg}
            </p>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-[#52525B] mb-1" htmlFor="auth-name">
                  Full Name
                </label>
                <input
                  id="auth-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Elena Lindqvist"
                  className="w-full px-3 py-2 text-sm border border-[#E4E4E0] rounded-md bg-white focus:outline-none focus:border-[#2563EB]"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#52525B] mb-1" htmlFor="auth-email">
                Email Address
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="elena@studio.com"
                className="w-full px-3 py-2 text-sm border border-[#E4E4E0] rounded-md bg-white focus:outline-none focus:border-[#2563EB]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#52525B] mb-1" htmlFor="auth-password">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full px-3 py-2 text-sm border border-[#E4E4E0] rounded-md bg-white focus:outline-none focus:border-[#2563EB]"
              />
            </div>

            {mode === 'register' && (
              <div className="pt-2">
                <p className="text-xs font-medium text-[#52525B] mb-2">
                  Select Interest Preferences (Set-based matching)
                </p>
                <div className="flex flex-wrap gap-2">
                  {allTags.map((tag) => {
                    const active = selectedPrefs.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => togglePref(tag)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
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
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 text-sm font-medium bg-[#18181B] text-white rounded-md hover:bg-[#27272A] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {submitting
                ? 'Please wait...'
                : mode === 'login'
                ? 'Sign In with Email'
                : 'Create Account'}
            </button>
          </form>
        </div>
      </section>
    );
  }

  const wishlistProducts = wishlist
    .map((w) => productMap.get(w.productId))
    .filter((p): p is Product => Boolean(p));

  return (
    <section className="max-w-[1280px] mx-auto px-6 py-10 space-y-8">
      {/* Header Profile Card */}
      <div className="bg-white border border-[#E4E4E0] rounded-lg p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-[#F1F1EF] border border-[#E4E4E0] flex items-center justify-center text-[#18181B]">
            <User className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-[#18181B]">{user.name}</h1>
            <p className="text-xs text-[#71717A] mt-0.5">
              {user.email} <span aria-hidden="true">·</span>{' '}
              <span className="capitalize font-medium text-[#18181B]">{user.role}</span>{' '}
              <span aria-hidden="true">·</span>{' '}
              <span className="font-mono tabular-nums">{user.purchasedProductIds.length}</span> unique objects purchased
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium border border-[#E4E4E0] rounded-md text-[#18181B] hover:bg-[#F1F1EF] cursor-pointer whitespace-nowrap self-start sm:self-auto"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </div>

      {/* Email Verification Notice if unverified */}
      {!user.emailVerified && (
        <div className="bg-white border border-[#E4E4E0] rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <MailCheck className="w-5 h-5 text-[#2563EB] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-[#18181B]">Verify your email to enable Firestore sync</p>
              <p className="text-xs text-[#52525B] mt-0.5">
                Cloud Firestore security rules require a verified email before saving orders, cart, wishlist, and profile updates.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleResendVerification}
              className="px-3 py-1.5 text-xs font-medium border border-[#E4E4E0] rounded-md hover:border-[#18181B] cursor-pointer"
            >
              Resend Link
            </button>
            <button
              type="button"
              onClick={handleRefreshVerification}
              className="px-3 py-1.5 text-xs font-medium bg-[#18181B] text-white rounded-md hover:bg-[#27272A] cursor-pointer"
            >
              Refresh Status
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">
          {error}
        </p>
      )}
      {infoMsg && (
        <p className="text-xs text-[#1D4ED8] bg-[#EFF6FF] border border-[#BFDBFE] rounded-md px-4 py-3">
          {infoMsg}
        </p>
      )}

      {/* Profile & Preference Set Editor */}
      <div className="bg-white border border-[#E4E4E0] rounded-lg p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-[#18181B]">
              Profile & Taste Preference Set
            </h2>
            <p className="text-xs text-[#71717A] mt-0.5">
              Stored in Cloud Firestore and combined with browsing history for Set Jaccard recommendations.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {prefsSavedMsg && <span className="text-xs text-[#2563EB] font-medium">Saved to Firestore</span>}
            <button
              type="button"
              disabled={savingPrefs || !user.emailVerified}
              onClick={handleSaveProfileAndPrefs}
              className="px-4 py-2 text-xs font-medium bg-[#18181B] text-white rounded-md hover:bg-[#27272A] disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              {savingPrefs ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#52525B] mb-1">Display Name</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#E4E4E0] rounded-md"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#52525B] mb-1">Default Shipping Address</label>
            <input
              type="text"
              value={editAddress}
              onChange={(e) => setEditAddress(e.target.value)}
              placeholder="420 Brannan St, San Francisco, CA"
              className="w-full px-3 py-2 text-sm border border-[#E4E4E0] rounded-md"
            />
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-[#52525B] mb-2">Interest Attributes</p>
          <div className="flex flex-wrap gap-2">
            {allTags.map((tag) => {
              const active = selectedPrefs.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => togglePref(tag)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
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
        </div>
      </div>

      {/* Wishlist & Browsing History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E4E4E0] rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Heart className="w-4 h-4 text-[#2563EB]" />
            <h2 className="font-display text-base font-semibold text-[#18181B]">
              Saved Wishlist ({wishlistProducts.length})
            </h2>
          </div>

          {wishlistProducts.length === 0 ? (
            <p className="text-xs text-[#71717A]">No items saved to your wishlist yet.</p>
          ) : (
            <div className="divide-y divide-[#F1F1EF]">
              {wishlistProducts.map((prod) => (
                <div key={prod.id} className="py-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onSelectProduct(prod)}
                    className="flex items-center gap-3 text-left min-w-0 cursor-pointer"
                  >
                    <div className="w-12 h-10 rounded bg-[#F1F1EF] overflow-hidden shrink-0">
                      <ProductImage src={prod.imageUrl} alt={prod.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#18181B] truncate">{prod.name}</p>
                      <p className="font-mono text-[11px] text-[#52525B] tabular-nums">${prod.price}</p>
                    </div>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onAddToCart(prod)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-[#18181B] text-white rounded cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      Bag
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleWishlist(prod)}
                      aria-label={`Remove ${prod.name} from wishlist`}
                      className="p-1.5 text-[#71717A] hover:text-red-700 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#E4E4E0] rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Eye className="w-4 h-4 text-[#18181B]" />
            <h2 className="font-display text-base font-semibold text-[#18181B]">
              Browsing History ({browsingHistory.length})
            </h2>
          </div>

          {browsingHistory.length === 0 ? (
            <p className="text-xs text-[#71717A]">
              Objects you inspect in the catalog are tracked here to refine Set-based recommendations.
            </p>
          ) : (
            <div className="divide-y divide-[#F1F1EF]">
              {browsingHistory.slice(0, 6).map((entry) => {
                const prod = productMap.get(entry.productId);
                if (!prod) return null;
                return (
                  <button
                    key={entry.productId}
                    type="button"
                    onClick={() => onSelectProduct(prod)}
                    className="w-full py-2.5 flex items-center justify-between gap-3 text-left hover:bg-[#F8F8F7] px-1 rounded cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[#18181B] truncate">{prod.name}</p>
                      <p className="text-[11px] text-[#71717A]">{entry.category}</p>
                    </div>
                    <span className="font-mono text-[11px] text-[#52525B] tabular-nums shrink-0">
                      {entry.viewCount} {entry.viewCount === 1 ? 'view' : 'views'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Order History */}
      <div className="bg-white border border-[#E4E4E0] rounded-lg p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-4">
          <PackageCheck className="w-4 h-4 text-[#18181B]" />
          <h2 className="font-display text-base font-semibold text-[#18181B]">Order History</h2>
        </div>

        {orders.length === 0 ? (
          <p className="text-xs text-[#71717A]">
            You have not placed any orders yet under this account.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E4E4E0] text-[#71717A]">
                  <th className="py-2.5 pr-4 font-medium">Order ID</th>
                  <th className="py-2.5 pr-4 font-medium">Date</th>
                  <th className="py-2.5 pr-4 font-medium">Items</th>
                  <th className="py-2.5 pr-4 font-medium">Status</th>
                  <th className="py-2.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F1EF]">
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td className="py-3 pr-4 font-mono font-semibold text-[#18181B] tabular-nums">
                      {order.id}
                    </td>
                    <td className="py-3 pr-4 font-mono text-[#52525B] tabular-nums">
                      {order.createdAt.slice(0, 10)}
                    </td>
                    <td className="py-3 pr-4 text-[#18181B]">
                      {order.items.map((i) => `${i.name} (×${i.quantity})`).join(', ')}
                    </td>
                    <td className="py-3 pr-4 text-[#52525B]">{order.status}</td>
                    <td className="py-3 text-right font-mono font-semibold text-[#18181B] tabular-nums">
                      ${order.total.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
