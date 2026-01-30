# Server Code Analysis Result

## 1. Overview
The server is a Hybrid Game Server built with **Node.js** and **TypeScript**. It provides both an HTTP API (Express) for asynchronous game actions (Inventory, Stash, Market) and a TCP Server (using `net` module) for real-time features (Chat).

- **Entry Point**: `src/app.ts`
- **HTTP Port**: 3000 (default)
- **TCP Port**: 57776 (default)
- **Database**: MySQL (using `mysql2/promise`)

---

## 2. HTTP API Structure
All HTTP routes are prefixed with `/api/v1` and use JSON for request/response bodies.

### 2.1 Authentication (`/routes/auth.ts`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| **POST** | `/api/v1/auth/register` | Creates a new user with SHA-256 hashed password. |
| **POST** | `/api/v1/auth/login` | Authenticates user and returns a **JWT Token**. |
| **POST** | `/api/v1/auth/verify` | Validates a JWT token and returns UID/Username. |

### 2.2 Inventory (`/routes/inventory.ts`)
Manages the player's local inventory grid.
- **Authentication**: JWT Token (via Body or Bearer Header).
- **Data Model**: `inventories` (metadata), `inventory_items` (items).

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| **POST** | `/api/v1/inventory/save` | Full overwrite save of inventory state. Uses transactions. |
| **POST** | `/api/v1/inventory/load` | Loads inventory grid size and items. Returns default empty grid if new user. |

### 2.3 Stash (`/routes/stash.ts`)
Manages the player's persistent storage (Bank/Stash).
- **Authentication**: JWT Token.
- **Data Model**: `stashes`, `stash_items`.
- **Logic**: Almost identical to Inventory logic but targeting Stash tables.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| **POST** | `/api/v1/stash/save` | Full overwrite save of stash state. |
| **POST** | `/api/v1/stash/load` | Loads stash grid size and items. |

### 2.4 Market (`/routes/market.ts`)
Implements a player-to-player trading system.
- **Transactional Safety**: Uses MySQL transactions (`beginTransaction`, `commit`, `rollback`) and Row Locking (`FOR UPDATE`) to prevent race conditions during purchase and listing.
- **Data Model**: `market_listings`, `game_profiles` (for Gold currency), `market_logs`.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| **GET** | `/api/v1/market/listings` | Search active listings with pagination, sorting, and keyword filtering. |
| **POST** | `/api/v1/market/listings` | Create a listing. Moves item from **Stash** -> **Market**. |
| **GET** | `/api/v1/market/listings/:id` | Get details of a specific listing. |
| **POST** | `/api/v1/market/listings/:id/purchase` | Buy an item. <br>1. Deducts Gold from Buyer.<br>2. Adds Gold to Seller (minus 5% fee).<br>3. Moves item to Buyer's **Stash**. |
| **POST** | `/api/v1/market/listings/:id/cancel` | Cancel listing. Returns item to Seller's **Stash**. |
| **GET** | `/api/v1/market/my-listings` | View own listings (active, sold, functionality history). |

---

## 3. TCP Server & Real-time (`src/tcpServer.ts`)
The TCP server handles persistent connections for real-time features.

### 3.1 Packet Structure
- **Framing**: `[Size (4 bytes LE)][FlatBuffers Payload]`
- **Protocol**: FlatBuffers (Schema definition in `src/packet_gen/game.fbs` likely).
- **Packet Handling**: `src/packet/packetHandler.ts`

### 3.2 Implemented Functionality
1.  **Login**:
    - Client sends `LoginReqPacket` containing a JWT Token.
    - Server verifies token, creates a `Session`, and responds with `LoginResPacket`.
2.  **Chat**:
    - Client sends `ChatPacket`.
    - Server verifies session, broadcasts message to **ALL** connected clients.

---

## 4. Database Schema (Inferred)
Based on SQL queries in the code:

- `users (uid, username, password_hash)`
- `game_profiles (uid, gold, ...)`
- `inventories (inventory_id, uid, grid_width, grid_height)`
- `inventory_items (inventory_id, primary_asset_id, qty, x, y, b_rotated)`
- `stashes (stash_id, uid, grid_width, grid_height)`
- `stash_items (stash_id, primary_asset_id, qty, x, y, b_rotated)`
- `market_listings (listing_id, seller_uid, primary_asset_id, qty, price, status, item_metadata, created_at, sold_at)`
- `market_logs (log entries for transactions)`
