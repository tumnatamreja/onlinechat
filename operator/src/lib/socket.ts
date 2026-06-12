import { io, Socket } from 'socket.io-client';
import { API_URL } from './api';
import { getToken } from './api';

let socket: Socket | null = null;

export function getOperatorSocket(): Socket {
  if (socket && socket.connected) return socket;

  socket = io(`${API_URL}/operator`, {
    auth: { token: getToken() },
    transports: ['websocket'],
    autoConnect: true,
  });

  return socket;
}

export function disconnectOperatorSocket() {
  socket?.disconnect();
  socket = null;
}
