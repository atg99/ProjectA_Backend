import { Router, Request, Response } from 'express';
import pool from '../db/db';
import jwt from 'jsonwebtoken';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key';

// Interface for inventory items
interface InventoryItem {
    item_entry_id: number;
    primary_asset_id: string;
    qty: number;
    x: number;
    y: number;
    b_rotated: boolean;
}

// Interface for save request body
interface InventorySaveRequest {
    token?: string;
    saved_entries: InventoryItem[];
    grid_width: number;
    grid_height: number;
}

// Helper to extract UID from token
const getUidFromRequest = (req: Request): number | null => {
    let token = req.body.token;

    // Also check Authorization header
    if (!token && req.headers.authorization) {
        const parts = req.headers.authorization.split(' ');
        if (parts.length === 2 && parts[0] === 'Bearer') {
            token = parts[1];
        }
    }

    if (!token) return null;

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { uid: number; username: string };
        return decoded.uid;
    } catch (e) {
        return null;
    }
};

// POST /inventory/save
router.post('/save', async (req: Request, res: Response): Promise<void> => {
    const uid = getUidFromRequest(req);
    if (!uid) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }

    const { saved_entries, grid_width, grid_height } = req.body as InventorySaveRequest;

    if (!saved_entries || grid_width === undefined || grid_height === undefined) {
        res.status(400).json({ message: 'Missing required fields: saved_entries, grid_width, grid_height' });
        return;
    }

    const connection = await pool.getConnection();
    console.log(`[Inventory] Saving for UID: ${uid}. Width: ${grid_width}, Height: ${grid_height}. Entries: ${saved_entries.length}`);
    try {
        await connection.beginTransaction();

        // 1. Check or Create Inventory for User
        const [rows] = await connection.execute<RowDataPacket[]>('SELECT inventory_id FROM inventories WHERE uid = ?', [uid]);
        let inventoryId: number;

        if (rows.length > 0) {
            inventoryId = rows[0].inventory_id;
            // Update grid dimensions if changed
            await connection.execute('UPDATE inventories SET grid_width = ?, grid_height = ? WHERE inventory_id = ?', [grid_width, grid_height, inventoryId]);
        } else {
            const [result] = await connection.execute<ResultSetHeader>('INSERT INTO inventories (uid, grid_width, grid_height) VALUES (?, ?, ?)', [uid, grid_width, grid_height]);
            inventoryId = result.insertId;
        }

        // --- Upsert Logic Start ---

        // 2. Fetch existing items from DB to identify what to Delete/Update
        const [existingRows] = await connection.execute<RowDataPacket[]>(
            'SELECT item_entry_id FROM inventory_items WHERE inventory_id = ?',
            [inventoryId]
        );
        const existingIds = new Set(existingRows.map(r => r.item_entry_id));
        const incomeIds = new Set<number>();

        const toInsert: InventoryItem[] = [];
        const toUpdate: InventoryItem[] = [];

        // 3. Categorize Incoming Items
        for (const item of saved_entries) {
            // item_entry_id might be missing or 0 for new items
            const id = item.item_entry_id;

            if (id && id > 0 && existingIds.has(id)) {
                // Exists in DB -> Update
                toUpdate.push(item);
                incomeIds.add(id);
            } else {
                // New or Invalid ID -> Insert
                toInsert.push(item);
            }
        }

        // 4. Execute DELETE for items NOT in incoming list
        const toDeleteIds: number[] = [];
        existingIds.forEach(id => {
            if (!incomeIds.has(id)) {
                toDeleteIds.push(id);
            }
        });

        if (toDeleteIds.length > 0) {
            // Use IN clause
            const placeholders = toDeleteIds.map(() => '?').join(',');
            await connection.execute(
                `DELETE FROM inventory_items WHERE item_entry_id IN (${placeholders})`,
                toDeleteIds
            );
        }

        // 5. Execute UPDATE
        for (const item of toUpdate) {
            await connection.execute(
                `UPDATE inventory_items 
                 SET qty = ?, x = ?, y = ?, b_rotated = ? 
                 WHERE item_entry_id = ?`,
                [item.qty, item.x, item.y, item.b_rotated ? 1 : 0, item.item_entry_id]
            );
        }

        // 6. Execute INSERT
        if (toInsert.length > 0) {
            const values = toInsert.map(item => [
                inventoryId,
                item.primary_asset_id,
                item.qty,
                item.x,
                item.y,
                item.b_rotated ? 1 : 0
            ]);

            await connection.query(
                'INSERT INTO inventory_items (inventory_id, primary_asset_id, qty, x, y, b_rotated) VALUES ?',
                [values]
            );
        }

        // --- Upsert Logic End ---

        await connection.commit();
        res.json({ message: 'Inventory saved successfully', inventory_id: inventoryId });

    } catch (error) {
        await connection.rollback();
        console.error('Error saving inventory:', error);
        res.status(500).json({ message: 'Internal server error' });
    } finally {
        connection.release();
    }
});

// POST /inventory/load (using POST to easily carry token in body if needed, but GET is also fine if using header)
// Supporting POST for consistency with providing token in body
router.post('/load', async (req: Request, res: Response): Promise<void> => {
    const uid = getUidFromRequest(req);
    if (!uid) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }

    try {
        console.log(`[Inventory] Loading for UID: ${uid}`);
        const [invRows] = await pool.execute<RowDataPacket[]>('SELECT inventory_id, grid_width, grid_height FROM inventories WHERE uid = ?', [uid]);

        if (invRows.length === 0) {
            // Default "New User" inventory
            res.json({
                saved_entries: [],
                grid_width: 10,
                grid_height: 10
            });
            return;
        }

        const { inventory_id, grid_width, grid_height } = invRows[0];

        const [itemRows] = await pool.execute<RowDataPacket[]>('SELECT item_entry_id, primary_asset_id, qty, x, y, b_rotated FROM inventory_items WHERE inventory_id = ?', [inventory_id]);

        const saved_entries = itemRows.map(row => ({
            item_entry_id: row.item_entry_id,
            primary_asset_id: row.primary_asset_id,
            qty: row.qty,
            x: row.x,
            y: row.y,
            b_rotated: Boolean(row.b_rotated)
        }));

        res.json({
            saved_entries,
            grid_width,
            grid_height
        });

    } catch (error) {
        console.error('Error loading inventory:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

export default router;
