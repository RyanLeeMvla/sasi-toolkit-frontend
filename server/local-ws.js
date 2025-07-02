const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 8888 });

server.on('connection', socket => {
  console.log("✅ ESP32 connected!");

  socket.on('message', data => {
    console.log(`📥 Got audio chunk: ${data.length} bytes`);
  });
});
