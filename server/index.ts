import http from 'http';
import { Server } from 'socket.io';
import { createApp } from './src/app';
import { initSockets } from './src/sockets';
import { config } from './src/config';

const app = createApp();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.corsOrigin,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
});

initSockets(io);

server.listen(config.port, () => {
  console.log(`\n  JAMSC Server running on http://localhost:${config.port}\n`);
});
