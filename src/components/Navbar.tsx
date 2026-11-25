import { ShoppingBag } from 'lucide-react';

export type AppSection = 'catalog' | 'top-ranked' | 'for-you' | 'analytics' | 'account';

interface NavbarProps {
  activeSection: AppSection;
  onNavigate: (section: AppSection) => void;
  cartCount: number;
  onOpenCart: () => void;
}

export function Navbar({ activeSection, onNavigate, cartCount, onOpenCart }: NavbarProps) {
  const navItems: Array<{ id: AppSection; label: string }> = [
    { id: 'catalog', label: 'Catalog' },
    { id: 'top-ranked', label: 'Top Ranked' },
    { id: 'for-you', label: 'For You' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'account', label: 'Account' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#F8F8F7]/95 backdrop-blur-sm border-b border-[#E4E4E0]">
      <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line brand wordmark */}
        <button
          type="button"
          onClick={() => onNavigate('catalog')}
          className="font-display text-lg font-bold tracking-tight text-[#18181B] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-sm"
        >
          Krono Atelier
        </button>

        {/* Zone 2: 5 concise single-line text nav links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#52525B]" aria-label="Primary">
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`py-1 whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-xs ${
                  isActive
                    ? 'text-[#18181B] border-[#18181B]'
                    : 'border-transparent hover:text-[#18181B] hover:border-[#D4D4D0]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onOpenCart}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-[#18181B] text-white rounded-md hover:bg-[#27272A] transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Bag</span>
            <span className="font-mono tabular-nums">({cartCount})</span>
          </button>
        </div>
      </div>

      {/* Compact mobile navigation row */}
      <nav className="md:hidden flex items-center gap-5 px-6 pb-2.5 overflow-x-auto text-xs font-medium text-[#52525B] border-t border-[#ECECE8]" aria-label="Mobile Primary">
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`pt-2 pb-1 whitespace-nowrap shrink-0 border-b-2 ${
                isActive ? 'text-[#18181B] border-[#18181B]' : 'border-transparent'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
