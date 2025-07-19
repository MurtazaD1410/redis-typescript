import * as net from "net";
import { parseRespArray } from "./parser";

const map: Record<string, string> = {};

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

const server: net.Server = net.createServer((connection: net.Socket) => {
  // Handle connection
  connection.on("data", (data) => {
    const { command, commandArgs } = parseRespArray(data.toString());
    console.log("Parsed command:", command, "Parsed argument:", commandArgs[0]);
    if (command === "PING") {
      connection.write(`+PONG\r\n`);
    }
    if (command?.toUpperCase() === "ECHO") {
      const response = `$${commandArgs[0]?.length}\r\n${commandArgs}\r\n`;
      connection.write(response);
    }
    if (command?.toUpperCase() === "SET") {
      const key = commandArgs[0];
      const value = commandArgs[1];
      map[key] = value;
      console.log(map);
      connection.write(`+OK\r\n`);
    }
    if (command?.toUpperCase() === "GET") {
      if (!map[commandArgs[0]]) {
        connection.write(`$-1\r\n`);
      }
      connection.write(
        `$${map[commandArgs[0]].length}\r\n${map[commandArgs[0]]}\r\n`
      );
    }
  });
});

server.listen(6379, "127.0.0.1");
