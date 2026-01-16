import { Socket } from 'net';

export interface UserSession {
    socket: Socket;
    uid: number;
    username: string;
}
