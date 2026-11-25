export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  rating: number;
  reviewCount: number;
  salesCount: number;
  stock: number;
  tags: string[];
  material: string;
  dimensions: string;
  description: string;
  imageUrl: string;
  createdAt: string;
}

export interface CategoryInfo {
  name: string;
  description: string;
  productCount?: number;
}

export interface OrderItem {
  productId: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  userId: string | null;
  customerName: string;
  customerEmail: string;
  shippingAddress: string;
  items: OrderItem[];
  subtotal: number;
  shippingFee: number;
  total: number;
  status: 'Confirmed' | 'Preparing Shipment' | 'Shipped';
  createdAt: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  defaultShippingAddress?: string;
  role: 'customer' | 'admin';
  preferences: string[];
  purchasedProductIds: string[];
  isManager: boolean;
  emailVerified?: boolean;
  createdAt: string;
}

export interface WishlistItem {
  userId: string;
  productId: string;
  addedAt: string;
}

export interface BrowsingHistoryItem {
  userId: string;
  productId: string;
  category: string;
  viewCount: number;
  lastViewedAt: string;
}

export interface GraphRecommendation {
  product: Product;
  score: number;
  hopDistance: 1 | 2;
  reasons: string[];
}

export interface PersonalizedRecommendation {
  product: Product;
  similarityScore: number;
  matchedTags: string[];
  reason: string;
}

export interface SearchTelemetry {
  searchAlgorithm: string;
  sortAlgorithm: string;
  filterAlgorithm: string;
  executionMs: number;
  candidatesEvaluated: number;
  matchedCount: number;
}

export interface SalesReport {
  totalRevenue: number;
  totalOrders: number;
  totalUnitsSold: number;
  averageOrderValue: number;
  topSellingProducts: Array<{
    productId: string;
    sku: string;
    name: string;
    category: string;
    unitsSold: number;
    revenue: number;
    rating: number;
  }>;
  categoryBreakdown: Array<{
    category: string;
    revenue: number;
    unitsSold: number;
    orderCount: number;
    sharePercent: number;
  }>;
  dailyRevenue: Array<{
    date: string;
    revenue: number;
    orders: number;
  }>;
  recentOrders: Order[];
}

export interface CartItem {
  product: Product;
  quantity: number;
}
