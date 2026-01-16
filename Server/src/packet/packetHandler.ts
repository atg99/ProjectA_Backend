import { Socket } from 'net';
import * as flatbuffers from 'flatbuffers';
import * as GamePacket from '../packet_gen/game-packet';
import { sessionManager } from '../sessionManager';
import { PacketUtils } from './packetUtils';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key';

export class PacketHandler {
    static handlePacket(socket: Socket, data: Uint8Array) {
        const buf = new flatbuffers.ByteBuffer(data);
        const gameMsg = GamePacket.GameMessage.getRootAsGameMessage(buf);
        const dataType = gameMsg.dataType();

        switch (dataType) {
            case GamePacket.PacketData.LoginReqPacket:
                const loginReq = gameMsg.data(new GamePacket.LoginReqPacket()) as GamePacket.LoginReqPacket;
                this.handleLogin(socket, loginReq);
                break;
            case GamePacket.PacketData.ChatPacket:
                const chatPkt = gameMsg.data(new GamePacket.ChatPacket()) as GamePacket.ChatPacket;
                this.handleChat(socket, chatPkt);
                break;
            default:
                console.log(`Unknown packet type: ${dataType}`);
                break;
        }
    }

    private static handleLogin(socket: Socket, pkt: GamePacket.LoginReqPacket) {
        const token = pkt.token();

        if (!token) {
            this.sendLoginResponse(socket, false, "No token provided");
            socket.destroy();
            return;
        }

        try {
            const decoded = jwt.verify(token, JWT_SECRET) as { uid: number, username: string };
            sessionManager.addSession(socket, {
                socket: socket,
                uid: decoded.uid,
                username: decoded.username
            });
            this.sendLoginResponse(socket, true, "Login successful", decoded.uid);
        } catch (e) {
            this.sendLoginResponse(socket, false, "Invalid token");
            socket.destroy();
        }
    }

    private static handleChat(socket: Socket, pkt: GamePacket.ChatPacket) {
        const session = sessionManager.getSession(socket);
        if (!session) {
            console.log("Chat attempt from unauthenticated socket");
            socket.destroy();
            return;
        }

        const message = pkt.message();
        if (!message) return;

        console.log(`Chat from ${session.username}: ${message}`);

        // Broadcast to all
        const builder = new flatbuffers.Builder(1024);
        const senderIdParams = builder.createString(session.username);
        const messageParams = builder.createString(message);

        GamePacket.ChatPacket.startChatPacket(builder);
        GamePacket.ChatPacket.addSenderId(builder, senderIdParams);
        GamePacket.ChatPacket.addMessage(builder, messageParams);
        GamePacket.ChatPacket.addTimestamp(builder, BigInt(Date.now()));
        const chatOffset = GamePacket.ChatPacket.endChatPacket(builder);

        const buffer = PacketUtils.serializePacket(builder, GamePacket.PacketData.ChatPacket, chatOffset);
        sessionManager.broadcast(buffer);
    }

    private static sendLoginResponse(socket: Socket, success: boolean, message: string, myUid: number = 0) {
        const builder = new flatbuffers.Builder(1024);
        const messageOffset = builder.createString(message);

        GamePacket.LoginResPacket.startLoginResPacket(builder);
        GamePacket.LoginResPacket.addSuccess(builder, success);
        GamePacket.LoginResPacket.addMessage(builder, messageOffset);
        GamePacket.LoginResPacket.addMyUid(builder, BigInt(myUid));
        const resOffset = GamePacket.LoginResPacket.endLoginResPacket(builder);

        const buffer = PacketUtils.serializePacket(builder, GamePacket.PacketData.LoginResPacket, resOffset);
        try {
            socket.write(buffer);
        } catch (e) {
            console.error("Failed to send LoginResponse");
        }
    }
}
