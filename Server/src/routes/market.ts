import { Router, Request, Response } from 'express';
import pool from '../db/db';
import { RowDataPacket, ResultSetHeader, Connection } from 'mysql2/promise';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key';

// --- Interfaces ---
interface MarketListing {
    listing_id: number;
    seller_uid: number;
    seller_name?: string;
    primary_asset_id: string;
    qty: number;
    price: number;
    status: number;
    item_metadata?: any;
    created_at: Date;
}

// --- Helpers ---
const getUidFromRequest = (req: Request): number | null => {
    // [FIX] GET 요청 등에서 req.body가 undefined일 수 있으므로 안전하게 접근
    let token = (req.body && req.body.token) ? req.body.token : null;

    if (!token && req.headers.authorization) {
        const parts = req.headers.authorization.split(' ');
        if (parts.length === 2 && parts[0] === 'Bearer') {
            token = parts[1];
        }
    }
    if (!token) return null;
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { uid: number };
        return decoded.uid;
    } catch (e) {
        return null;
    }
};

// --- Endpoints ---

// 1. GET /listings - Search & List
router.get('/listings', async (req: Request, res: Response): Promise<void> => {
    try {
        // Ensure strictly numbers and handle negatives
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.max(1, parseInt(req.query.limit as string) || 20);
        const offset = (page - 1) * limit;
        const sort = req.query.sort as string || 'latest';
        const keyword = req.query.keyword as string;

        let query = `
            SELECT m.*, u.username as seller_name 
            FROM market_listings m
            JOIN users u ON m.seller_uid = u.uid
            WHERE m.status = 0
        `;
        const params: any[] = [];

        if (keyword) {
            query += ` AND m.primary_asset_id LIKE ?`;
            params.push(`%${keyword}%`);
        }

        if (sort === 'price_asc') {
            query += ` ORDER BY m.price ASC`;
        } else if (sort === 'price_desc') {
            query += ` ORDER BY m.price DESC`;
        } else {
            query += ` ORDER BY m.created_at DESC`;
        }

        // FIX: Inject limit/offset directly to prevent "Incorrect arguments to mysqld_stmt_execute"
        query += ` LIMIT ${limit} OFFSET ${offset}`;
        // Note: Do NOT add limit/offset to 'params' array

        const [rows] = await pool.execute<RowDataPacket[]>(query, params);

        // Count total for pagination
        let countQuery = `SELECT COUNT(*) as total FROM market_listings WHERE status = 0`;
        const countParams: any[] = [];
        if (keyword) {
            countQuery += ` AND primary_asset_id LIKE ?`;
            countParams.push(`%${keyword}%`);
        }
        const [countRows] = await pool.execute<RowDataPacket[]>(countQuery, countParams);
        const total = countRows[0].total;

        res.json({
            data: rows,
            pagination: {
                page,
                limit,
                total,
                total_pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching listings:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// 2. GET /listings/:id - Detail
router.get('/listings/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const listingId = req.params.id;
        const query = `
            SELECT m.*, u.username as seller_name 
            FROM market_listings m
            JOIN users u ON m.seller_uid = u.uid
            WHERE m.listing_id = ?
        `;
        const [rows] = await pool.execute<RowDataPacket[]>(query, [listingId]);

        if (rows.length === 0) {
            res.status(404).json({ message: 'Listing not found' });
            return;
        }

        res.json(rows[0]);
    } catch (error) {
        console.error('Error fetching listing detail:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// 3. POST /listings - Register (Sell)
router.post('/listings', async (req: Request, res: Response): Promise<void> => {
    const uid = getUidFromRequest(req);
    if (!uid) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }

    const { item_entry_id, price, qty } = req.body;

    if (!item_entry_id || !price || !qty || price <= 0 || qty <= 0) {
        res.status(400).json({ message: 'Invalid request parameters' });
        return;
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Verify Item Ownership & Quantity from Inventory
        const [items] = await connection.execute<RowDataPacket[]>(
            'SELECT * FROM inventory_items WHERE item_entry_id = ? FOR UPDATE',
            [item_entry_id]
        );

        if (items.length === 0) {
            await connection.rollback();
            res.status(404).json({ message: 'Item not found in inventory' });
            return;
        }

        const item = items[0];

        const [invCheck] = await connection.execute<RowDataPacket[]>(
            'SELECT uid FROM inventories WHERE inventory_id = ?',
            [item.inventory_id]
        );

        if (invCheck.length === 0 || invCheck[0].uid !== uid) {
            await connection.rollback();
            res.status(403).json({ message: 'You do not own this item' });
            return;
        }

        if (item.qty < qty) {
            await connection.rollback();
            res.status(400).json({ message: 'Not enough quantity' });
            return;
        }

        if (item.qty === qty) {
            await connection.execute('DELETE FROM inventory_items WHERE item_entry_id = ?', [item_entry_id]);
        } else {
            await connection.execute('UPDATE inventory_items SET qty = qty - ? WHERE item_entry_id = ?', [qty, item_entry_id]);
        }

        // 2. Insert into Market
        const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO market_listings 
            (seller_uid, primary_asset_id, qty, price, status, item_metadata) 
            VALUES (?, ?, ?, ?, 0, ?)`,
            [uid, item.primary_asset_id, qty, price, JSON.stringify({ rotated: item.b_rotated })]
        );

        await connection.commit();
        res.json({ message: 'Item listed successfully', listing_id: result.insertId });

    } catch (error) {
        await connection.rollback();
        console.error('Error listing item:', error);
        res.status(500).json({ message: 'Internal server error' });
    } finally {
        connection.release();
    }
});

// 4. POST /listings/:id/purchase - Buy
router.post('/listings/:id/purchase', async (req: Request, res: Response): Promise<void> => {
    const buyerUid = getUidFromRequest(req);
    if (!buyerUid) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }

    const listingId = req.params.id;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Lock Listing & Check Status
        const [listings] = await connection.execute<RowDataPacket[]>(
            'SELECT * FROM market_listings WHERE listing_id = ? AND status = 0 FOR UPDATE',
            [listingId]
        );

        if (listings.length === 0) {
            await connection.rollback();
            res.status(404).json({ message: 'Listing not found or already sold' });
            return;
        }

        const listing = listings[0];

        if (listing.seller_uid === buyerUid) {
            await connection.rollback();
            res.status(400).json({ message: 'Cannot buy your own listing' });
            return;
        }

        // 2. Check Buyer's Gold
        const [buyerProfile] = await connection.execute<RowDataPacket[]>(
            'SELECT gold FROM game_profiles WHERE uid = ? FOR UPDATE',
            [buyerUid]
        );

        if (buyerProfile.length === 0) {
            await connection.rollback();
            res.status(500).json({ message: 'Buyer profile not found' });
            return;
        }

        const buyerGold = buyerProfile[0].gold;
        if (buyerGold < listing.price) {
            await connection.rollback();
            res.status(400).json({ message: 'Insufficient funds' });
            return;
        }

        // 3. Process Payment (Fee: 5%)
        const feeRate = 0.05;
        const fee = Math.floor(listing.price * feeRate);
        const sellerReceive = listing.price - fee;

        await connection.execute('UPDATE game_profiles SET gold = gold - ? WHERE uid = ?', [listing.price, buyerUid]);
        await connection.execute('UPDATE game_profiles SET gold = gold + ? WHERE uid = ?', [sellerReceive, listing.seller_uid]);

        // 4. Move Item to Buyer's Stash
        const [stashRows] = await connection.execute<RowDataPacket[]>('SELECT stash_id, grid_width, grid_height FROM stashes WHERE uid = ?', [buyerUid]);
        let stashId: number;
        let gridWidth = 10;
        let gridHeight = 30;

        if (stashRows.length === 0) {
            const [newStash] = await connection.execute<ResultSetHeader>('INSERT INTO stashes (uid) VALUES (?)', [buyerUid]);
            stashId = newStash.insertId;
        } else {
            stashId = stashRows[0].stash_id;
            gridWidth = stashRows[0].grid_width;
            gridHeight = stashRows[0].grid_height;
        }

        // Find empty spot
        const [stashItems] = await connection.execute<RowDataPacket[]>(
            'SELECT x, y FROM stash_items WHERE stash_id = ?',
            [stashId]
        );

        let placeX = 0;
        let placeY = 0;
        let placed = false;
        const occupied = new Set<string>();
        stashItems.forEach((i: any) => occupied.add(`${i.x},${i.y}`));

        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                if (!occupied.has(`${x},${y}`)) {
                    placeX = x;
                    placeY = y;
                    placed = true;
                    break;
                }
            }
            if (placed) break;
        }

        if (!placed) {
            await connection.rollback();
            res.status(400).json({ message: 'Stash is full' });
            return;
        }

        // 이미 객체라면 그대로 사용하고, 문자열일 경우에만 파싱
        const metadata = (typeof listing.item_metadata === 'string')
            ? JSON.parse(listing.item_metadata)
            : (listing.item_metadata || {});
        const isRotated = metadata.rotated ? 1 : 0;

        await connection.execute(
            `INSERT INTO stash_items (stash_id, primary_asset_id, qty, x, y, b_rotated)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [stashId, listing.primary_asset_id, listing.qty, placeX, placeY, isRotated]
        );

        // 5. Update Listing Status
        await connection.execute(
            'UPDATE market_listings SET status = 1, sold_at = NOW() WHERE listing_id = ?',
            [listingId]
        );

        // 6. Log Transaction
        await connection.execute(
            `INSERT INTO market_logs (listing_id, seller_uid, buyer_uid, primary_asset_id, qty, price, fee)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [listingId, listing.seller_uid, buyerUid, listing.primary_asset_id, listing.qty, listing.price, fee]
        );

        await connection.commit();
        res.json({ message: 'Purchase successful' });

    } catch (error) {
        await connection.rollback();
        console.error('Error purchasing item:', error);
        res.status(500).json({ message: 'Internal server error' });
    } finally {
        connection.release();
    }
});

// 5. GET /my-listings
router.get('/my-listings', async (req: Request, res: Response): Promise<void> => {
    const uid = getUidFromRequest(req);
    if (!uid) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }

    const statusFilter = req.query.status as string;

    let query = `SELECT * FROM market_listings WHERE seller_uid = ?`;
    const params: any[] = [uid];

    if (statusFilter === 'active') {
        query += ` AND status = 0`;
    } else if (statusFilter === 'sold') {
        query += ` AND status = 1`;
    } else if (statusFilter === 'history') {
        query += ` AND status IN (1, 2)`;
    }

    query += ` ORDER BY created_at DESC`;

    try {
        const [rows] = await pool.execute<RowDataPacket[]>(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching my listings:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// 6. POST /listings/:id/cancel
router.post('/listings/:id/cancel', async (req: Request, res: Response): Promise<void> => {
    const uid = getUidFromRequest(req);
    if (!uid) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }

    const listingId = req.params.id;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [listings] = await connection.execute<RowDataPacket[]>(
            'SELECT * FROM market_listings WHERE listing_id = ? AND seller_uid = ? AND status = 0 FOR UPDATE',
            [listingId, uid]
        );

        if (listings.length === 0) {
            await connection.rollback();
            res.status(404).json({ message: 'Listing not found or not active' });
            return;
        }

        const listing = listings[0];

        // Retrieve item back to Stash
        const [stashRows] = await connection.execute<RowDataPacket[]>('SELECT stash_id, grid_width, grid_height FROM stashes WHERE uid = ?', [uid]);
        let stashId: number;
        let gridWidth = 10;
        let gridHeight = 30;

        if (stashRows.length === 0) {
            const [newStash] = await connection.execute<ResultSetHeader>('INSERT INTO stashes (uid) VALUES (?)', [uid]);
            stashId = newStash.insertId;
        } else {
            stashId = stashRows[0].stash_id;
            gridWidth = stashRows[0].grid_width;
            gridHeight = stashRows[0].grid_height;
        }

        const [stashItems] = await connection.execute<RowDataPacket[]>('SELECT x, y FROM stash_items WHERE stash_id = ?', [stashId]);
        const occupied = new Set<string>();
        stashItems.forEach((i: any) => occupied.add(`${i.x},${i.y}`));

        let placeX = 0;
        let placeY = 0;
        let placed = false;

        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                if (!occupied.has(`${x},${y}`)) {
                    placeX = x;
                    placeY = y;
                    placed = true;
                    break;
                }
            }
            if (placed) break;
        }

        if (!placed) {
            await connection.rollback();
            res.status(400).json({ message: 'Stash is full, cannot cancel listing' });
            return;
        }

        // 이미 객체라면 그대로 사용하고, 문자열일 경우에만 파싱
        const metadata = (typeof listing.item_metadata === 'string')
            ? JSON.parse(listing.item_metadata)
            : (listing.item_metadata || {});

        await connection.execute(
            `INSERT INTO stash_items (stash_id, primary_asset_id, qty, x, y, b_rotated)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [stashId, listing.primary_asset_id, listing.qty, placeX, placeY, metadata.rotated ? 1 : 0]
        );

        await connection.execute('UPDATE market_listings SET status = 2 WHERE listing_id = ?', [listingId]);

        await connection.commit();
        res.json({ message: 'Listing cancelled' });

    } catch (error) {
        await connection.rollback();
        console.error('Error cancelling listing:', error);
        res.status(500).json({ message: 'Internal server error' });
    } finally {
        connection.release();
    }
});

export default router;