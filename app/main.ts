import * as net from "net";
import { parseRespArray } from "./parser";

const map: Record<string, { value: string; expiresAt?: number }> = {};

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

const server: net.Server = net.createServer((connection: net.Socket) => {
  // Handle connection
  connection.on("data", (data) => {
    const { command, commandArgs } = parseRespArray(data.toString());
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
      map[key] = { value: value };
      if (commandArgs[2]) {
        if (commandArgs[2].toUpperCase() === "PX") {
          map[key].expiresAt = Date.now() + parseInt(commandArgs[3]);
        }
        if (commandArgs[2].toUpperCase() === "EX") {
          map[key].expiresAt = Date.now() + parseInt(commandArgs[3]) * 1000;
        }
      }

      connection.write(`+OK\r\n`);
    }
    if (command?.toUpperCase() === "GET") {
      const key = commandArgs[0];
      const item = map[key];

      if (!item) {
        connection.write(`$-1\r\n`);
        return;
      } else if (item.expiresAt && Date.now() > item.expiresAt) {
        delete map[key];
        connection.write(`$-1\r\n`);
        return;
      } else {
        connection.write(
          `$${map[commandArgs[0]].value.length}\r\n${
            map[commandArgs[0]].value
          }\r\n`
        );
      }
    }
  });
});

server.listen(6379, "127.0.0.1");
