const SerialPort = require('serialport');
const Readline = require('@serialport/parser-readline');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

// Serial port setup
const port = new SerialPort('COM5', { baudRate: 115200 });
const parser = port.pipe(new Readline({ delimiter: '\n' }));

// Web server + Socket.io
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

parser.on('data', data => {
  if (data.includes("PRESSED")) {
    console.log("Button Pressed!");
    io.emit('buttonPress');
  }
});

server.listen(3001, () => {
  console.log("Bridge server running on http://localhost:3001");
});
