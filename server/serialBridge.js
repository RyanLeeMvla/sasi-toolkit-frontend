const { SerialPort } = require('serialport');

const { ReadlineParser } = require('@serialport/parser-readline');

const { SerialPort: Binding } = require('@serialport/bindings-cpp');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors'); // ✅ Add this

SerialPort.Binding = Binding;

// Serial port setup
const port = new SerialPort({ path: 'COM6', baudRate: 115200 });
const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));



// Web server + Socket.io
const app = express();

// ✅ Enable CORS for frontend
app.use(cors({ origin: 'http://localhost:3000' }));

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

parser.on('data', data => {
  if (data.includes("PRESSED")) {
    console.log("Button Pressed!");
    io.emit('buttonPress');
  }
});

server.listen(3001, () => {
  console.log("Bridge server running on http://localhost:3001");
});
