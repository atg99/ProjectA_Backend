import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import inventoryRoutes from './routes/inventory';
import stashRoutes from './routes/stash';
import marketRoutes from './routes/market';
import shopRoutes from './routes/shop';

import { TcpServer } from './tcpServer';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const TCP_PORT = Number(process.env.TCP_PORT) || 57776;

app.use(cors());
app.use(bodyParser.json());
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/stash', stashRoutes);
app.use('/api/v1/market', marketRoutes);
app.use('/api/v1/shop', shopRoutes);

app.get('/', (req, res) => {
    res.send('Hybrid Game Server API is running');
});

// Start HTTP Server
app.listen(PORT, () => {
    console.log(`HTTP Server is running on port ${PORT}`);
});

// Start TCP Server
const tcpServer = new TcpServer();
tcpServer.start(TCP_PORT);

// Load Game Data
import { itemDataManager } from './data/ItemDataManager';
import path from 'path';

// Assuming running from Server/dist or Server/src, data is in Server/data
// Adjust path relative to CWD
const dataPath = path.join(process.cwd(), 'data', 'ItemData.csv');
itemDataManager.loadData(dataPath);
