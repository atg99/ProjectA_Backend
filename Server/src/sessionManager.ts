import { Socket } from 'net';
import { UserSession } from './session';

export class SessionManager {
    private sessions: Map<Socket, UserSession> = new Map();

    addSession(socket: Socket, session: UserSession) {
        this.sessions.set(socket, session);
        console.log(`User ${session.username} (UID: ${session.uid}) connected. Total sessions: ${this.sessions.size}`);
    }

    removeSession(socket: Socket) {
        const session = this.sessions.get(socket);
        if (session) {
            console.log(`User ${session.username} (UID: ${session.uid}) disconnected.`);
            this.sessions.delete(socket);
        }
    }

    getSession(socket: Socket): UserSession | undefined {
        return this.sessions.get(socket);
    }

    getAllSessions(): IterableIterator<UserSession> {
        return this.sessions.values();
    }

    broadcast(data: Uint8Array, excludeSocket?: Socket) {
        for (const [socket, _] of this.sessions) {
            if (socket !== excludeSocket) {
                try {
                    socket.write(data);
                } catch (e) {
                    console.error('Error broadcasting to socket:', e);
                }
            }
        }
    }
}

export const sessionManager = new SessionManager();
