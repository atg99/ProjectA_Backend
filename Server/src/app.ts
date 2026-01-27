import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import inventoryRoutes from './routes/inventory';
import stashRoutes from './routes/stash';
import marketRoutes from './routes/market';

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

app.use('/auth', authRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/stash', stashRoutes);
app.use('/api/v1/market', marketRoutes);

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
