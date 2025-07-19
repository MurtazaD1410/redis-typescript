import * as net from "net";
import { parseRespArray } from "./parser";

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

const server: net.Server = net.createServer((connection: net.Socket) => {
  // Handle connection
  connection.on("data", (data) => {
    const { argument, command } = parseRespArray(data.toString());
    console.log("Parsed command:", command, "Parsed argument:", argument);
    if (command === "PING") {
      connection.write(`+PONG\r\n`);
    }
    if (command?.toUpperCase() === "ECHO") {
      const response = `$${argument?.length}\r\n${argument}\r\n`;
      connection.write(response);
    }
  });
});

server.listen(6379, "127.0.0.1");
