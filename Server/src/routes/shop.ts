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

// POST /shop/trade
router.post('/trade', async (req: Request, res: Response): Promise<void> => {
    const uid = getUidFromRequest(req);
    if (!uid) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }

    const { sell_items, buy_items } = req.body;

    if ((!sell_items || !Array.isArray(sell_items)) && (!buy_items || !Array.isArray(buy_items))) {
        res.status(400).json({ message: 'Invalid request: provide sell_items or buy_items arrays' });
        return;
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        let totalSellPrice = 0;
        let totalBuyPrice = 0;
        const boughtItems: any[] = []; // To store what we successfully staged for buying

        // --- 1. Process Sell Items ---
        if (sell_items && Array.isArray(sell_items)) {
            for (const sellItem of sell_items) {
                const { source_type, item_entry_id, qty } = sellItem;

                if (!source_type || !item_entry_id || !qty || qty <= 0) continue;

                let item: any = null;
                const idCol = source_type === 'inventory' ? 'item_entry_id' : 'stash_entry_id';
                const tableName = source_type === 'inventory' ? 'inventory_items' : 'stash_items';
                const containerTable = source_type === 'inventory' ? 'inventories' : 'stashes';
                const containerIdCol = source_type === 'inventory' ? 'inventory_id' : 'stash_id';

                // Fetch Item & Check Ownership
                const [rows] = await connection.execute<RowDataPacket[]>(
                    `SELECT i.${idCol} as entry_id, i.primary_asset_id, i.qty, c.uid 
                     FROM ${tableName} i
                     JOIN ${containerTable} c ON i.${containerIdCol} = c.${containerIdCol}
                     WHERE i.${idCol} = ? FOR UPDATE`,
                    [item_entry_id]
                );

                if (rows.length === 0) throw new Error(`Sell item not found: ${item_entry_id}`);
                item = rows[0];

                if (item.uid !== uid) throw new Error(`Not owner of item: ${item_entry_id}`);
                if (item.qty < qty) throw new Error(`Not enough quantity for item: ${item_entry_id}`);

                // Get Sell Price
                const itemDef = itemDataManager.getItem(item.primary_asset_id);
                const price = itemDef ? itemDef.sellPrice : 0;
                if (price <= 0) throw new Error(`Item cannot be sold: ${item.primary_asset_id}`);

                totalSellPrice += price * qty;

                // Remove Item / Deduct Qty
                if (item.qty === qty) {
                    await connection.execute(`DELETE FROM ${tableName} WHERE ${idCol} = ?`, [item_entry_id]);
                } else {
                    await connection.execute(`UPDATE ${tableName} SET qty = qty - ? WHERE ${idCol} = ?`, [qty, item_entry_id]);
                }
            }
        }

        // --- 2. Process Buy Items (To Stash) ---
        if (buy_items && Array.isArray(buy_items)) {
            // Get User's Stash
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

            // Fetch existing stash items for collision
            const [existingItems] = await connection.execute<RowDataPacket[]>(
                'SELECT x, y, primary_asset_id, b_rotated FROM stash_items WHERE stash_id = ?',
                [stashId]
            );

            // Create collision map
            const placedRects = existingItems.map((item: any) => {
                const size = itemDataManager.getItemSize(item.primary_asset_id, !!item.b_rotated);
                return { x: item.x, y: item.y, w: size.width, h: size.height };
            });

            for (const buyItem of buy_items) {
                const { primary_asset_id, qty } = buyItem;
                if (!primary_asset_id || !qty || qty <= 0) continue;

                // use `sellPrice * 1.5`

                const itemDef = itemDataManager.getItem(primary_asset_id);
                if (!itemDef) throw new Error(`Unknown item to buy: ${primary_asset_id}`);

                const unitBuyPrice = Math.floor(itemDef.sellPrice * 1.5);
                totalBuyPrice += unitBuyPrice * qty;

                // Loop for Qty (if unstackable, or if we want to place them one by one? 
                // Stash usually supports stacking? The DB schema has `qty`.
                // If the item is stackable, we should try to find an existing stack?
                // `maxStack` is in ItemDefinition.

                let remainingQty = qty;
                const maxStack = itemDef.maxStack || 1;

                while (remainingQty > 0) {
                    const stackQty = Math.min(remainingQty, maxStack);

                    // Collision Check & Placement
                    const size = itemDataManager.getItemSize(primary_asset_id, false); // Default no rotation for shop buy
                    let placeX = 0, placeY = 0, placed = false;

                    for (let y = 0; y <= gridHeight - size.height; y++) {
                        for (let x = 0; x <= gridWidth - size.width; x++) {
                            let collision = false;
                            for (const rect of placedRects) {
                                if (x < rect.x + rect.w && x + size.width > rect.x &&
                                    y < rect.y + rect.h && y + size.height > rect.y) {
                                    collision = true;
                                    break;
                                }
                            }
                            if (!collision) {
                                placeX = x;
                                placeY = y;
                                placed = true;
                                break;
                            }
                        }
                        if (placed) break;
                    }

                    if (!placed) throw new Error('Not enough space in stash');

                    // Add to DB (staged)
                    await connection.execute(
                        `INSERT INTO stash_items (stash_id, primary_asset_id, qty, x, y, b_rotated)
                         VALUES (?, ?, ?, ?, ?, 0)`,
                        [stashId, primary_asset_id, stackQty, placeX, placeY]
                    );

                    // Add to local collision tracking
                    placedRects.push({ x: placeX, y: placeY, w: size.width, h: size.height });

                    boughtItems.push({ primary_asset_id, qty: stackQty });
                    remainingQty -= stackQty;
                }
            }
        }

        // --- 3. Process Gold ---
        const netCost = totalBuyPrice - totalSellPrice;

        const [profile] = await connection.execute<RowDataPacket[]>('SELECT gold FROM game_profiles WHERE uid = ? FOR UPDATE', [uid]);
        if (profile.length === 0) throw new Error('User profile not found');

        const currentGold = profile[0].gold;

        if (netCost > 0) {
            if (currentGold < netCost) throw new Error('Insufficient gold');
            await connection.execute('UPDATE game_profiles SET gold = gold - ? WHERE uid = ?', [netCost, uid]);
        } else if (netCost < 0) {
            // Earned money
            await connection.execute('UPDATE game_profiles SET gold = gold + ? WHERE uid = ?', [Math.abs(netCost), uid]);
        }
        // If 0, do nothing

        await connection.commit();

        const [updatedProfile] = await connection.execute<RowDataPacket[]>('SELECT gold FROM game_profiles WHERE uid = ?', [uid]);

        res.json({
            message: 'Trade successful',
            earned_gold: totalSellPrice,
            spent_gold: totalBuyPrice,
            current_gold: updatedProfile[0].gold,
            bought_items: boughtItems
        });

    } catch (error: any) {
        await connection.rollback();
        console.error('Error processing trade:', error);
        res.status(400).json({ message: error.message || 'Trade failed' });
    } finally {
        connection.release();
    }
});

export default router;
