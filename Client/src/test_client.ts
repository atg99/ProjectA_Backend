import axios from 'axios';
import net from 'net';
import * as flatbuffers from 'flatbuffers';
// Importing generated code. We assume Server and Client are siblings.
// In a real repo, this might be in a shared package.
import * as GamePacket from '../../Server/src/packet_gen/game-packet';
import { PacketUtils } from '../../Server/src/packet/packetUtils';

const API_URL = 'http://localhost:3000/auth';
const TCP_PORT = 57776;
const TCP_HOST = 'localhost';

async function main() {
    // 1. HTTP Register & Login
    const username = `user_${Math.floor(Math.random() * 1000)}`;
    const password = 'password123';

    console.log(`[HTTP] Registering ${username}...`);
    try {
        await axios.post(`${API_URL}/register`, { username, password });
    } catch (e: any) {
        if (e.response?.status !== 409) {
            console.error('[HTTP] Register failed:', e.message);
            return;
        }
        console.log('[HTTP] User already exists, proceeding to login.');
    }

    console.log(`[HTTP] Logging in...`);
    let token = '';
    try {
        const res = await axios.post(`${API_URL}/login`, { username, password });
        token = res.data.token;
        console.log(`[HTTP] Received Token: ${token.substring(0, 10)}...`);
    } catch (e: any) {
        console.error('[HTTP] Login failed:', e.message);
        return;
    }

    // 2. TCP Connection
    const socket = new net.Socket();
    socket.connect(TCP_PORT, TCP_HOST, () => {
        console.log(`[TCP] Connected to ${TCP_HOST}:${TCP_PORT}`);

        // 3. Send Login Packet
        sendLoginPacket(socket, token);
    });

    let buffer = Buffer.alloc(0);

    socket.on('data', (data: Buffer) => {
        buffer = Buffer.concat([buffer, data]);

        while (true) {
            if (buffer.length < 4) break;
            const size = buffer.readUInt32LE(0);
            if (buffer.length < 4 + size) break;

            const packetBody = buffer.subarray(4, 4 + size);

            try {
                handlePacket(packetBody);
            } catch (e) {
                console.error("Error handling packet:", e);
            }

            buffer = buffer.subarray(4 + size);
        }
    });

    socket.on('close', () => {
        console.log('[TCP] Connection closed');
    });

    socket.on('error', (err) => {
        console.error('[TCP] Error:', err.message);
    });

    // Helper to send chat every 3 seconds
    setInterval(() => {
        if (!socket.destroyed) {
            sendChatPacket(socket, `Hello from ${username} at ${new Date().toLocaleTimeString()}`);
        }
    }, 3000);
}

function sendLoginPacket(socket: net.Socket, token: string) {
    const builder = new flatbuffers.Builder(1024);
    const tokenOffset = builder.createString(token);

    GamePacket.LoginReqPacket.startLoginReqPacket(builder);
    GamePacket.LoginReqPacket.addToken(builder, tokenOffset);
    const offset = GamePacket.LoginReqPacket.endLoginReqPacket(builder);

    const packet = PacketUtils.serializePacket(builder, GamePacket.PacketData.LoginReqPacket, offset);
    socket.write(packet);
    console.log('[TCP] Sent LoginReq');
}

function sendChatPacket(socket: net.Socket, msg: string) {
    const builder = new flatbuffers.Builder(1024);
    // Note: sender_id and timestamp are server-authoritative usually, but schema has them.
    // Server will likely overwrite or we just send message. 
    // Checking server logic: It uses `handleChat` which reads `message`. SenderID/Timestamp are ignored from client input likely (or should be).
    // Let's populate message.
    const msgOffset = builder.createString(msg);
    const senderOffset = builder.createString("me"); // Server sets this really

    GamePacket.ChatPacket.startChatPacket(builder);
    GamePacket.ChatPacket.addMessage(builder, msgOffset);
    GamePacket.ChatPacket.addSenderId(builder, senderOffset);
    GamePacket.ChatPacket.addTimestamp(builder, BigInt(Date.now()));
    const offset = GamePacket.ChatPacket.endChatPacket(builder);

    const packet = PacketUtils.serializePacket(builder, GamePacket.PacketData.ChatPacket, offset);
    socket.write(packet);
    console.log(`[TCP] Sent Chat: ${msg}`);
}

function handlePacket(data: Uint8Array) {
    const buf = new flatbuffers.ByteBuffer(data);
    const gameMsg = GamePacket.GameMessage.getRootAsGameMessage(buf);
    const dataType = gameMsg.dataType();

    if (dataType === GamePacket.PacketData.LoginResPacket) {
        const pkt = gameMsg.data(new GamePacket.LoginResPacket()) as GamePacket.LoginResPacket;
        console.log(`[TCP] Received LoginRes: Success=${pkt.success()}, Msg=${pkt.message()}, MyUID=${pkt.myUid()}`);
    } else if (dataType === GamePacket.PacketData.ChatPacket) {
        const pkt = gameMsg.data(new GamePacket.ChatPacket()) as GamePacket.ChatPacket;
        console.log(`[TCP] Chat Received: [${pkt.senderId()}] ${pkt.message()} (Time: ${pkt.timestamp()})`);
    } else {
        console.log(`[TCP] Unknown packet type ${dataType}`);
    }
}

main();
