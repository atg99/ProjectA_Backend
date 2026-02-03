import { Router, Request, Response } from 'express';
import pool from '../db/db';
import jwt from 'jsonwebtoken';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { itemDataManager } from '../data/ItemDataManager';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key';

const getUidFromRequest = (req: Request): number | null => {
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

// POST /shop/sell
router.post('/sell', async (req: Request, res: Response): Promise<void> => {
    const uid = getUidFromRequest(req);
    if (!uid) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }

    const { source_type, item_entry_id, qty } = req.body; // source_type: 'inventory' | 'stash'

    if (!source_type || !item_entry_id || !qty || qty <= 0) {
        res.status(400).json({ message: 'Invalid request parameters' });
        return;
    }

    if (source_type !== 'inventory' && source_type !== 'stash') {
        res.status(400).json({ message: 'Invalid source type' });
        return;
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        let item: any = null;
        let ownerCheckPassed = false;

        // 1. Fetch Item & Check Ownership
        if (source_type === 'inventory') {
            const [rows] = await connection.execute<RowDataPacket[]>(
                `SELECT i.item_entry_id, i.primary_asset_id, i.qty, i.b_rotated, inv.uid 
                 FROM inventory_items i
                 JOIN inventories inv ON i.inventory_id = inv.inventory_id
                 WHERE i.item_entry_id = ? FOR UPDATE`,
                [item_entry_id]
            );
            if (rows.length > 0) {
                item = rows[0];
                if (item.uid === uid) ownerCheckPassed = true;
            }
        } else {
            // stash
            const [rows] = await connection.execute<RowDataPacket[]>(
                `SELECT s.stash_entry_id as item_entry_id, s.primary_asset_id, s.qty, s.b_rotated, st.uid 
                 FROM stash_items s
                 JOIN stashes st ON s.stash_id = st.stash_id
                 WHERE s.stash_entry_id = ? FOR UPDATE`,
                [item_entry_id]
            );
            if (rows.length > 0) {
                item = rows[0];
                if (item.uid === uid) ownerCheckPassed = true;
            }
        }

        if (!item) {
            await connection.rollback();
            res.status(404).json({ message: 'Item not found' });
            return;
        }

        if (!ownerCheckPassed) {
            await connection.rollback();
            res.status(403).json({ message: 'You do not own this item' });
            return;
        }

        if (item.qty < qty) {
            await connection.rollback();
            res.status(400).json({ message: 'Not enough quantity' });
            return;
        }

        // 2. Get Sell Price
        const itemDef = itemDataManager.getItem(item.primary_asset_id);
        const sellPrice = itemDef ? itemDef.sellPrice : 0;

        if (sellPrice <= 0) {
            await connection.rollback();
            res.status(400).json({ message: 'This item cannot be sold to the system' });
            return;
        }

        const totalGold = sellPrice * qty;

        // 3. Remove Item / Deduct Qty
        const tableName = source_type === 'inventory' ? 'inventory_items' : 'stash_items';
        const idCol = source_type === 'inventory' ? 'item_entry_id' : 'stash_entry_id';

        if (item.qty === qty) {
            await connection.execute(`DELETE FROM ${tableName} WHERE ${idCol} = ?`, [item_entry_id]);
        } else {
            await connection.execute(`UPDATE ${tableName} SET qty = qty - ? WHERE ${idCol} = ?`, [qty, item_entry_id]);
        }

        // 4. Add Gold
        await connection.execute('UPDATE game_profiles SET gold = gold + ? WHERE uid = ?', [totalGold, uid]);

        // Fetch updated gold for response
        const [profile] = await connection.execute<RowDataPacket[]>('SELECT gold FROM game_profiles WHERE uid = ?', [uid]);
        const currentGold = profile[0].gold;

        await connection.commit();

        res.json({
            message: 'Sold successfully',
            earned_gold: totalGold,
            current_gold: currentGold
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error selling item:', error);
        res.status(500).json({ message: 'Internal server error' });
    } finally {
        connection.release();
    }
});

export default router;
