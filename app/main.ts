import * as net from "net";
import { parseRespArray } from "./parser";

const map: Record<string, { value: string; expiresAt?: number }> = {};
const listMap: Record<string, string[]> = {};

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
    if (command?.toUpperCase() === "RPUSH") {
      const listName = commandArgs[0];

      if (!listMap[listName]) {
        listMap[listName] = [...commandArgs.slice(1)];
        connection.write(`:${listMap[listName].length}\r\n`);
      } else {
        listMap[listName].push(...commandArgs.slice(1));
        connection.write(`:${listMap[listName].length}\r\n`);
      }
    }
    if (command.toUpperCase() === "LRANGE") {
      const listName = commandArgs[0];
      const startIndex = parseInt(commandArgs[1]);
      const endIndex = parseInt(commandArgs[2]);

      const list = listMap[listName];
      if (!list) {
        connection.write(`*0\r\n`);
        return;
      }
      const normalizeIndex = (index: number) => {
        if (index < 0) {
          return Math.max(list.length + index, 0);
        }
        return Math.min(index, list.length - 1);
      };

      const actualStart = normalizeIndex(startIndex);
      const actualEnd = normalizeIndex(endIndex);

      let itemCount = 0;
      let outputStr = "";
      if (!list || list.length === 0 || actualEnd < actualStart) outputStr = "";
      else {
        const result = list.slice(actualStart, actualEnd + 1);
        result.forEach((item) => {
          itemCount++;
          outputStr += `$${item.length}\r\n${item}\r\n`;
        });
      }

      connection.write(`*${itemCount}\r\n${outputStr}`);
    }
    if (command?.toUpperCase() === "LPUSH") {
      const listName = commandArgs[0];
      const items = [...commandArgs.slice(1).reverse()];

      if (!listMap[listName]) {
        listMap[listName] = items;
        connection.write(`:${listMap[listName].length}\r\n`);
      } else {
        listMap[listName].unshift(...items);
        connection.write(`:${listMap[listName].length}\r\n`);
      }
    }
  });
});

server.listen(6379, "127.0.0.1");
