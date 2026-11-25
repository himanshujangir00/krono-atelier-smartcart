# Krono Atelier (SmartCart) – E-Commerce Product Recommendation & Ranking System

DSA Odd Sem Project – Problem A6.
A full-stack e-commerce app (React + Express + Firebase) where searching, ranking and
recommendation are powered by **hand-written data structures and algorithms**.

## Features
- User registration / login (Firebase Authentication), Customer & Admin roles
- Product listing and category management (admin)
- Search (name, prefix, typo-tolerant), filter by category / price, sort by price / rating
- Shopping cart, order placement, order history
- Top-rated and popular products, related products (co-purchase graph), For You recommendations
- Sales reports and analytics dashboard
- Firestore + Storage security rules (customers see only their own data; only admins manage the catalog)

## DSA Concepts Implemented (`src/dsa/`)
| Concept | File | Used for | Time complexity | Space |
|---|---|---|---|---|
| Hash Table (chaining, auto-resize) | `HashTable.ts` | Product lookup by id, category index | get/set/delete O(1) avg, O(n) worst | O(n) |
| Inverted Index (on Hash Table) | `HashTable.ts` | Name/tag search, prefix lookup | exact O(1) avg | O(total tokens) |
| Binary Max-Heap | `Heap.ts` | Top-K rated / popular products | push/pop O(log n); Top-K O(n log k) | O(n) |
| Graph (weighted, adjacency list) | `Graph.ts` | Co-purchase related products | add edge O(1); get related O(d log d) | O(V+E) |
| Merge Sort / Quick Sort | `Sorting.ts` | Sort by price, rating, popularity | Merge O(n log n); Quick O(n log n) avg, O(n²) worst | Merge O(n); Quick O(log n) |
| Binary Search | `Searching.ts` | Price-range and exact-price search on sorted data | O(log n) | O(1) |
| Set (custom: union, intersection, difference, Jaccard) | `Sets.ts` | Unique categories, user preference matching | add/has O(1) avg | O(n) |

`ClientDSAEngine.ts` combines all of these in the browser to power search, Top-K, recommendations and reports over Firestore data.
`src/server/engine.ts` is the Express-side version of the same engine.

## Tech Stack
React 19, TypeScript, Vite, Tailwind CSS, Express, Firebase (Auth, Firestore, Storage).

## Run Locally
1. `npm install`
2. Copy `.env.example` to `.env.local` and add your own `GEMINI_API_KEY` if needed
3. `npm run dev`

To use your own Firebase project, replace the values in `firebase-applet-config.json`
and deploy `firestore.rules` and `storage.rules`.

## Project Structure
- `src/dsa/` – data structures and algorithms
- `src/server/` – Express-side engine, auth, seed data
- `src/services/` – Firestore service layer
- `src/components/` – UI components
- `firestore.rules`, `storage.rules` – security rules

## Author
Himanshu
