import fs from 'fs';
import path from 'path';
import type { CategoryInfo, Order, Product, UserProfile } from '../types.ts';
import { CommerceDSAEngine } from './engine.ts';
import { SEED_CATEGORIES, SEED_ORDERS, SEED_PRODUCTS } from './seedData.ts';

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  preferences: string[];
  purchasedProductIds: string[];
  isManager: boolean;
  createdAt: string;
}

export interface PersistedStore {
  products: Product[];
  categories: CategoryInfo[];
  orders: Order[];
  users: StoredUser[];
  managerPasscodeHash: string | null;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.resolve(DATA_DIR, 'store.json');

export function toPublicUser(user: StoredUser): UserProfile {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.isManager ? 'admin' : 'customer',
    preferences: user.preferences,
    purchasedProductIds: user.purchasedProductIds,
    isManager: user.isManager,
    createdAt: user.createdAt,
  };
}

class StoreManager {
  public data: PersistedStore;
  public engine: CommerceDSAEngine;

  constructor() {
    this.engine = new CommerceDSAEngine();
    this.data = this.loadOrSeed();
    this.syncEngine();
  }

  private loadOrSeed(): PersistedStore {
    if (!STORE_PATH.startsWith(DATA_DIR + path.sep)) {
      throw new Error('Invalid store path configuration');
    }

    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(STORE_PATH)) {
      try {
        const raw = fs.readFileSync(STORE_PATH, 'utf8');
        const parsed = JSON.parse(raw) as Partial<PersistedStore>;
        if (Array.isArray(parsed.products) && Array.isArray(parsed.categories)) {
          return {
            products: parsed.products,
            categories: parsed.categories,
            orders: Array.isArray(parsed.orders) ? parsed.orders : [],
            users: Array.isArray(parsed.users) ? parsed.users : [],
            managerPasscodeHash: parsed.managerPasscodeHash ?? null,
          };
        }
      } catch {
        // Fallback to seed if corrupted
      }
    }

    const initial: PersistedStore = {
      products: SEED_PRODUCTS,
      categories: SEED_CATEGORIES,
      orders: SEED_ORDERS,
      users: [],
      managerPasscodeHash: null,
    };
    this.writeStore(initial);
    return initial;
  }

  private writeStore(storeData: PersistedStore): void {
    fs.writeFileSync(STORE_PATH, JSON.stringify(storeData, null, 2), 'utf8');
  }

  save(): void {
    this.writeStore(this.data);
  }

  syncEngine(): void {
    this.engine.rebuild(this.data.products, this.data.categories, this.data.orders);
  }
}

export const store = new StoreManager();
