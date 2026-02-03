import { Router, Request, Response } from 'express';
import pool from '../db/db';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key';

// Register
// Register
router.post('/register', async (req: Request, res: Response): Promise<void> => {
    const { username, password } = req.body;

    if (!username || !password) {
        res.status(400).json({ message: 'Username and password are required' });
        return;
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Hash password
        const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

        // Insert user
        const [userResult] = await connection.execute<any>(
            'INSERT INTO users (username, password_hash) VALUES (?, ?)',
            [username, hashedPassword]
        );

        const newUserId = userResult.insertId;

        // Create Game Profile
        await connection.execute(
            'INSERT INTO game_profiles (uid) VALUES (?)',
            [newUserId]
        );

        await connection.commit();

        res.status(201).json({ message: 'User registered successfully' });
    } catch (error: any) {
        await connection.rollback();
        console.error(error);
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(409).json({ message: 'Username already exists' });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
    } finally {
        connection.release();
    }
});

// Login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
    const { username, password } = req.body;

    if (!username || !password) {
        res.status(400).json({ message: 'Username and password are required' });
        return;
    }

    try {
        const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

        const [rows]: [any[], any] = await pool.execute(
            'SELECT uid, username FROM users WHERE username = ? AND password_hash = ?',
            [username, hashedPassword]
        );

        if (rows.length === 0) {
            res.status(401).json({ message: 'Invalid credentials' });
            return;
        }

        const user = rows[0];
        const token = jwt.sign({ uid: user.uid, username: user.username }, JWT_SECRET, { expiresIn: '24h' });

        res.json({ token });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Verify Token
router.post('/verify', async (req: Request, res: Response): Promise<void> => {
    const { token } = req.body;
    console.log(`[Verify] Request received. Token: ${token}`);

    if (!token) {
        console.log('[Verify] Token is missing');
        res.status(400).json({ message: 'Token is required' });
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { uid: number; username: string };
        console.log(`[Verify] Success. UID: ${decoded.uid}, Username: ${decoded.username}`);
        res.json({ uid: decoded.uid, username: decoded.username });
    } catch (error) {
        console.error('[Verify] Validation failed:', error);
        res.status(401).json({ message: 'Invalid or expired token' });
    }
});

// GET /profile
router.get('/profile', async (req: Request, res: Response): Promise<void> => {
    let token = (req.query.token as string) || (req.headers.authorization?.split(' ')[1]);

    // Also check body if needed, though GET usually doesn't have body
    if (!token && req.body && req.body.token) {
        token = req.body.token;
    }

    if (!token) {
        res.status(401).json({ message: 'Unauthorized: No token provided' });
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { uid: number; username: string };
        const uid = decoded.uid;

        // LEFT JOIN to check if profile exists
        const query = `
            SELECT u.username, p.level, p.exp, p.gold, p.last_pos_x, p.last_pos_y, p.last_pos_z
            FROM users u
            LEFT JOIN game_profiles p ON u.uid = p.uid
            WHERE u.uid = ?
        `;

        const [rows] = await pool.execute<any[]>(query, [uid]);

        if (rows.length === 0) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        const userData = rows[0];

        // If p.level is null, it means game_profile is missing (Left Join result)
        if (userData.level === null) {
            console.warn(`[Profile] Profile missing for uid ${uid}. Creating default profile.`);

            // Auto-create profile
            await pool.execute('INSERT INTO game_profiles (uid) VALUES (?)', [uid]);

            // Return default values manually since we just inserted default
            const defaultProfile = {
                username: userData.username,
                level: 1,
                exp: 0,
                gold: 0,
                last_pos_x: 0,
                last_pos_y: 0,
                last_pos_z: 0
            };
            res.json(defaultProfile);
        } else {
            // Profile exists
            res.json(userData);
        }

    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(401).json({ message: 'Invalid token' });
    }
});

export default router;
