import { Router, Request, Response } from 'express';
import pool from '../db/db';
import jwt from 'jsonwebtoken';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key';

// Interface for stash items (same structure as inventory items)
interface StashItem {
    primary_asset_id: string;
    qty: number;
    x: number;
    y: number;
    b_rotated: boolean;
}

// Interface for save request body
interface StashSaveRequest {
    token?: string;
    saved_entries: StashItem[];
    grid_width: number;
    grid_height: number;
}

// Helper to extract UID from token (Duplicated from inventory.ts for now, could be moved to middleware/utils)
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

// POST /stash/save
router.post('/save', async (req: Request, res: Response): Promise<void> => {
    const uid = getUidFromRequest(req);
    if (!uid) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }

    const { saved_entries, grid_width, grid_height } = req.body as StashSaveRequest;

    if (!saved_entries || grid_width === undefined || grid_height === undefined) {
        res.status(400).json({ message: 'Missing required fields: saved_entries, grid_width, grid_height' });
        return;
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Check or Create Stash for User
        const [rows] = await connection.execute<RowDataPacket[]>('SELECT stash_id FROM stashes WHERE uid = ?', [uid]);
        let stashId: number;

        if (rows.length > 0) {
            stashId = rows[0].stash_id;
            // Update grid dimensions if changed (e.g. upgrade)
            await connection.execute('UPDATE stashes SET grid_width = ?, grid_height = ? WHERE stash_id = ?', [grid_width, grid_height, stashId]);
        } else {
            const [result] = await connection.execute<ResultSetHeader>('INSERT INTO stashes (uid, grid_width, grid_height) VALUES (?, ?, ?)', [uid, grid_width, grid_height]);
            stashId = result.insertId;
        }

        // 2. Clear existing items to overwrite
        await connection.execute('DELETE FROM stash_items WHERE stash_id = ?', [stashId]);

        // 3. Insert new items
        if (saved_entries.length > 0) {
            const values = saved_entries.map(item => [
                stashId,
                item.primary_asset_id,
                item.qty,
                item.x,
                item.y,
                item.b_rotated ? 1 : 0
            ]);

            // Use query for bulk insert
            await connection.query(
                'INSERT INTO stash_items (stash_id, primary_asset_id, qty, x, y, b_rotated) VALUES ?',
                [values]
            );
        }

        await connection.commit();
        res.json({ message: 'Stash saved successfully', stash_id: stashId });

    } catch (error) {
        await connection.rollback();
        console.error('Error saving stash:', error);
        res.status(500).json({ message: 'Internal server error' });
    } finally {
        connection.release();
    }
});

// POST /stash/load
router.post('/load', async (req: Request, res: Response): Promise<void> => {
    const uid = getUidFromRequest(req);
    if (!uid) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }

    try {
        const [stashRows] = await pool.execute<RowDataPacket[]>('SELECT stash_id, grid_width, grid_height FROM stashes WHERE uid = ?', [uid]);

        if (stashRows.length === 0) {
            // Default "New User" stash (default per schema is 10x30)
            res.json({
                saved_entries: [],
                grid_width: 10,
                grid_height: 30
            });
            return;
        }

        const { stash_id, grid_width, grid_height } = stashRows[0];

        const [itemRows] = await pool.execute<RowDataPacket[]>('SELECT primary_asset_id, qty, x, y, b_rotated FROM stash_items WHERE stash_id = ?', [stash_id]);

        const saved_entries = itemRows.map(row => ({
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
        console.error('Error loading stash:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

export default router;
