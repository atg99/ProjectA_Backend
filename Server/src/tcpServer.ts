import net from 'net';
import { PacketHandler } from './packet/packetHandler';
import { sessionManager } from './sessionManager';

const HEADER_SIZE = 4;

export class TcpServer {
    private server: net.Server;

    constructor() {
        this.server = net.createServer((socket) => {
            console.log('New TCP connection');

            let buffer = Buffer.alloc(0);

            socket.on('data', (data: Buffer) => {
                buffer = Buffer.concat([buffer, data]);

                while (true) {
                    if (buffer.length < HEADER_SIZE) {
                        break; // Wait for more data
                    }

                    // Read size (LE)
                    const size = buffer.readUInt32LE(0);

                    if (buffer.length < HEADER_SIZE + size) {
                        break; // Wait for full body
                    }

                    // Extract packet
                    // Format: [Size(4)][GameMessage Buffer]
                    // We read size at 0.
                    // The 'packet' data starts at 4.

                    const packetBody = buffer.subarray(4, 4 + size);

                    try {
                        PacketHandler.handlePacket(socket, packetBody);
                    } catch (e) {
                        console.error("Error handling packet", e);
                        socket.destroy();
                    }

                    // Remove processed data
                    buffer = buffer.subarray(HEADER_SIZE + size);
                }
            });

            socket.on('close', () => {
                sessionManager.removeSession(socket);
            });

            socket.on('error', (err) => {
                console.error('Socket error:', err);
                sessionManager.removeSession(socket);
            });
        });
    }

    start(port: number) {
        this.server.listen(port, () => {
            console.log(`TCP Server running on port ${port}`);
        });
    }
}
