import * as net from "net";
import { parseRespArray } from "./parser";

const map: Record<string, { value: string; expiresAt?: number }> = {};
const listMap: Record<string, string[]> = {};
let waitingClients: Array<{
  connection: net.Socket;
  lists: string[];
  timeout: number;
  timeoutId: Timer | null;
}> = [];

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

      for (let i = waitingClients.length - 1; i >= 0; i--) {
        const client = waitingClients[i];
        if (Date.now() > Date.now() + client.timeout && client.timeout !== 0) {
          client.connection.write("$-1\r\n");
          waitingClients.splice(i, 1);
          break;
        }
        if (client.lists.includes(listName)) {
          const poppedElement = listMap[listName].shift();
          client.connection.write(
            `*2\r\n$${listName.length}\r\n${listName}\r\n$${poppedElement?.length}\r\n${poppedElement}\r\n`
          );
          waitingClients.splice(i, 1);
          break;
        }
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

      for (let i = waitingClients.length - 1; i >= 0; i--) {
        const client = waitingClients[i];
        if (Date.now() > Date.now() + client.timeout && client.timeout !== 0) {
          client.connection.write("$-1\r\n");
          waitingClients.splice(i, 1);
          break;
        }
        if (client.lists.includes(listName)) {
          const poppedElement = listMap[listName].shift();
          client.connection.write(
            `*2\r\n$${listName.length}\r\n${listName}\r\n$${poppedElement?.length}\r\n${poppedElement}\r\n`
          );
          waitingClients.splice(i, 1); // Remove from waiting list
          break; // Only wake up one client!
        }
      }
    }

    if (command?.toUpperCase() === "LLEN") {
      const listName = commandArgs[0];
      const list = listMap[listName];
      if (!list) {
        connection.write(`:0\r\n`);
      } else {
        connection.write(`:${list.length}\r\n`);
      }
    }
    if (command?.toUpperCase() === "LPOP") {
      const listName = commandArgs[0];
      const list = listMap[listName];
      let itemCount = 0;
      let itemsToDel = 1;

      let outputStr = "";
      if (!list) {
        connection.write(`$-1\r\n`);
      } else {
        if (!commandArgs[1]) {
          outputStr += `$${list[0].length}\r\n${list[0]}\r\n`;
          list.shift();
          connection.write(outputStr);
          return;
        }
        if (commandArgs[1]) {
          itemsToDel = parseInt(commandArgs[1]);
        }
        for (let i = 0; i < itemsToDel; i++) {
          outputStr += `$${list[i].length}\r\n${list[i]}\r\n`;
          list.shift();
          i--;
          itemCount++;
          itemsToDel--;
        }
        connection.write(`*${itemCount}\r\n${outputStr}`);
      }
    }
    if (command?.toUpperCase() === "BLPOP") {
      let found = false;
      const timer = commandArgs[commandArgs.length - 1];
      const listNames = commandArgs.slice(0, -1);

      for (const listName of listNames) {
        const list = listMap[listName];
        if (list && list.length > 0) {
          found = true;
          const removedItem = list.shift();
          connection.write(
            `*2\r\n$${listName.length}\r\n${listName}\r\n$${removedItem?.length}\r\n${removedItem}\r\n`
          );
        }
      }
      // if (!found) {
      //   waitingClients.push({
      //     connection: connection,
      //     lists: listNames,
      //     timeout: timer === "0" ? 0 : Date.now() + parseInt(timer) * 1000,
      //   });
      // }
      if (!found) {
        const client: {
          connection: net.Socket;
          lists: string[];
          timeout: number;
          timeoutId: Timer | null;
        } = {
          connection: connection,
          lists: listNames,
          timeout: parseFloat(timer),
          timeoutId: null,
        };

        waitingClients.push(client); // Add to waiting list FIRST

        if (timer !== "0") {
          // Then set timeout for non-zero timeouts
          const timeoutId = setTimeout(() => {
            // Find and remove this specific client
            const clientIndex = waitingClients.findIndex(
              (c) => c.connection === connection
            );
            if (clientIndex !== -1) {
              connection.write("*-1\r\n");
              waitingClients.splice(clientIndex, 1);
            }
          }, parseFloat(timer) * 1000);

          client.timeoutId = timeoutId; // Store the timeout ID
        }
      }
    }
  });
});

server.listen(6379, "127.0.0.1");
