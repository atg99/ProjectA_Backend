# Hybrid Game Server - Project Result

## 1. Project Overview
**Goal**: Build a hybrid game server with Web-based Authentication and TCP-based Gameplay communication.
**Work Space**: `c:\C_dev\GameWeb`

## 2. Technology Stack
- **Language**: Node.js (TypeScript)
- **Database**: MySQL (via `mysql2` connection pool)
- **Web Server**: Express.js (REST API)
- **Game Server**: Node.js `net` (Raw TCP Sockets)
- **Serialization**: Google FlatBuffers
- **Authentication**: JWT (JSON Web Tokens) + SHA256 Password Hashing

## 3. Implemented Features

### A. Authentication Server (HTTP/Express)
- **Port**: 3000
- **Routes**:
    - `POST /auth/register`: SHA256 password hashing, DB insertion.
    - `POST /auth/login`: Credential validation, JWT generation.
- **Database**: Connected to `gamedb` (Docker MySQL).

### B. Inventory API (HTTP/Express)
- **Routes**:
    - `POST /inventory/save`: Saves grid size and item entries (Transaction-based).
    - `POST /inventory/load`: Retrieves inventory state.
- **Data Model**:
    - `inventories` table: Stores grid dimensions (`grid_width`, `grid_height`).
    - `inventory_items` table: Stores individual items (`primary_asset_id`, `qty`, `x`, `y`, `b_rotated`).

### C. TCP Game Server
- **Port**: 57776 (Updated)
- **Architecture**:
    - `TcpServer`: Handles connection events and packet framing.
    - `SessionManager`: Maps sockets to User UIDs.
    - `PacketHandler`: Dispatches logic based on `GameMessage` union type.
- **Functionality**:
    - **Framing**: `[Size (4B)][GameMessage Payload]`
    - **Protocol**: Uses `GameMessage` union containing `LoginReqPacket` or `ChatPacket`.
    - **Logic**: Handles Login (JWT validation) and Chat (Broadcast).


### D. Test Client (Node.js)
- **Folder**: `/Client`
- **Features**:
    - Auto-registers/logins via HTTP.
    - Connects to TCP server (57776).
    - Sends Authenticated `LoginReqPacket`.
    - Sends Periodic `ChatPacket` messages.

### E. Protocol (FlatBuffers)
- **Folder**: `/Schema`
- **Generates**: TypeScript (Server/Client), C++ (Unreal).
- **Structure**:
    - `root_type GameMessage`: Wrapper for all packets using `union PacketData`.
    - `PacketData`: Union of `LoginReqPacket`, `LoginResPacket`, `ChatPacket`.
    - `LoginReqPacket`: Contains Token.
    - `ChatPacket`: Contains Sender, Message, Timestamp.

## 4. Directory Structure
```
/C_dev/GameWeb
├── Server/                 # Main Server Application
│   ├── src/
│   │   ├── app.ts          # Entry Point
│   │   ├── tcpServer.ts    # TCP Listener
│   │   ├── sessionManager.ts
│   │   ├── routes/         # Auth & Inventory API
│   │   ├── packet/         # Packet Logic (Parsers/Handlers)
│   │   └── packet_gen/     # Generated FlatBuffers code
│   ├── .env
│   └── package.json
├── Client/                 # Node.js Test Client
│   ├── src/
│   │   └── test_client.ts
│   └── package.json
├── Schema/                 # Protocol Definitions
│   ├── game.fbs            # FlatBuffers Schema
│   └── cpp_gen/            # C++ Headers
└── result.md               # This Report
```

## 5. Status & Action Items
- [x] Basic Server Setup (Express + TCP)
- [x] Database Connection
- [x] Authentication Flow (JWT)
- [x] Schema Refactoring (Union `GameMessage`)
- [x] Test Client Verification (End-to-End Success)
- [x] Inventory System (Save/Load API)
