import { Router, Request, Response } from 'express';
import pool from '../db/db';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key';

// Register
router.post('/register', async (req: Request, res: Response): Promise<void> => {
    const { username, password } = req.body;

    if (!username || !password) {
        res.status(400).json({ message: 'Username and password are required' });
        return;
    }

    try {
        // Hash password
        const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

        // Check user existence (implied by unique constraint usually, but let's be explicit if needed or just catch error)
        // Insert user
        const [result] = await pool.execute(
            'INSERT INTO users (username, password_hash) VALUES (?, ?)',
            [username, hashedPassword]
        );

        res.status(201).json({ message: 'User registered successfully' });
    } catch (error: any) {
        console.error(error);
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(409).json({ message: 'Username already exists' });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
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
        const token = jwt.sign({ uid: user.uid, username: user.username }, JWT_SECRET, { expiresIn: '1h' });

        res.json({ token });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

export default router;
