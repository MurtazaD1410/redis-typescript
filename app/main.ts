import * as net from "net";
import { parseRespArray } from "./parser";
import { executeXreadForWaitingClient } from "./utils";

const map: Record<string, { value: string; expiresAt?: number }> = {};
const listMap: Record<string, string[]> = {};
const streamsMap: Record<string, Array<Record<string, string>>> = {};
let waitingClientsForList: Array<{
  connection: net.Socket;
  lists: string[];
  timeout: number;
  timeoutId: Timer | null;
}> = [];
let waitingClientsForStreams: Array<{
  connection: net.Socket;
  streams: string[];
  idsArray: string[];
  timeout: number;
  timeoutId: Timer | null;
}> = [];

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

const server: net.Server = net.createServer((connection: net.Socket) => {
  // Handle connection
  connection.on("data", (data) => {
    const { command, commandArgs } = parseRespArray(data.toString());
    if (command?.toUpperCase() === "PING") {
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

      for (let i = waitingClientsForList.length - 1; i >= 0; i--) {
        const client = waitingClientsForList[i];
        if (Date.now() > Date.now() + client.timeout && client.timeout !== 0) {
          client.connection.write("$-1\r\n");
          waitingClientsForList.splice(i, 1);
          break;
        }
        if (client.lists.includes(listName)) {
          const poppedElement = listMap[listName].shift();
          client.connection.write(
            `*2\r\n$${listName.length}\r\n${listName}\r\n$${poppedElement?.length}\r\n${poppedElement}\r\n`
          );
          waitingClientsForList.splice(i, 1);
          break;
        }
      }
    }
    if (command?.toUpperCase() === "LRANGE") {
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

      for (let i = waitingClientsForList.length - 1; i >= 0; i--) {
        const client = waitingClientsForList[i];
        if (Date.now() > Date.now() + client.timeout && client.timeout !== 0) {
          client.connection.write("$-1\r\n");
          waitingClientsForList.splice(i, 1);
          break;
        }
        if (client.lists.includes(listName)) {
          const poppedElement = listMap[listName].shift();
          client.connection.write(
            `*2\r\n$${listName.length}\r\n${listName}\r\n$${poppedElement?.length}\r\n${poppedElement}\r\n`
          );
          waitingClientsForList.splice(i, 1); // Remove from waiting list
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

        waitingClientsForList.push(client); // Add to waiting list FIRST

        if (timer !== "0") {
          // Then set timeout for non-zero timeouts
          const timeoutId = setTimeout(() => {
            // Find and remove this specific client
            const clientIndex = waitingClientsForList.findIndex(
              (c) => c.connection === connection
            );
            if (clientIndex !== -1) {
              connection.write("*-1\r\n");
              waitingClientsForList.splice(clientIndex, 1);
            }
          }, parseFloat(timer) * 1000);

          client.timeoutId = timeoutId; // Store the timeout ID
        }
      }
    }
    if (command?.toUpperCase() === "TYPE") {
      const name = commandArgs[0];

      if (map[name]) {
        connection.write(`+string\r\n`);
      } else if (listMap[name]) {
        connection.write(`+list\r\n`);
      } else if (streamsMap[name]) {
        connection.write(`+stream\r\n`);
      } else {
        connection.write(`+none\r\n`);
      }
    }
    if (command?.toUpperCase() === "XADD") {
      const streamName = commandArgs[0];
      if (!streamsMap[streamName]) {
        streamsMap[streamName] = [];
      }
      let id = commandArgs[1];
      if (id === "*") {
        id = `${Date.now()}-0`;
      }

      const entry: Record<string, string> = { id: id };
      for (let i = 2; i < commandArgs.length; i += 2) {
        const key = commandArgs[i];
        const value = commandArgs[i + 1];
        entry[key] = value;
      }
      const oldId =
        streamsMap[streamName][streamsMap[streamName]?.length - 1]?.id;
      if (id === "0-0") {
        connection.write(
          `-ERR The ID specified in XADD must be greater than 0-0\r\n`
        );
        return;
      }

      if (oldId) {
        const [oldTimestamp, oldSequence] = oldId.split("-").map(Number);
        // const [newTimestamp, newSequence] = entry.id.split("-").map(Number);
        const [newTimestampStr, newSequenceStr] = entry.id.split("-");
        const newTimestamp = Number(newTimestampStr);
        let newSequence;

        if (newSequenceStr === "*") {
          if (oldTimestamp === newTimestamp) newSequence = oldSequence + 1;
          else newSequence = 0;
        } else {
          newSequence = Number(newSequenceStr);
        }

        if (
          newTimestamp < oldTimestamp ||
          (newTimestamp === oldTimestamp && newSequence <= oldSequence)
        ) {
          connection.write(
            `-ERR The ID specified in XADD is equal or smaller than the target stream top item\r\n`
          );
          return;
        }

        entry.id = `${newTimestamp}-${newSequence}`;
      } else {
        if (entry.id.split("-")[1] === "*") {
          entry.id = `${entry.id.split("-")[0]}-${1}`;
        }
      }

      streamsMap[streamName].push(entry);
      connection.write(`$${entry?.id?.length}\r\n${entry?.id}\r\n`);

      const waitingClientsToNotify = waitingClientsForStreams.filter((client) =>
        client.streams.includes(streamName)
      );

      if (waitingClientsToNotify.length > 0) {
        waitingClientsToNotify.forEach((client) => {
          // Clear their timeout if they have one
          if (client.timeoutId) {
            clearTimeout(client.timeoutId);
          }

          // Remove them from waiting list
          const clientIndex = waitingClientsForStreams.findIndex(
            (c) => c === client
          );
          if (clientIndex !== -1) {
            waitingClientsForStreams.splice(clientIndex, 1);
          }

          // Execute XREAD for this client
          // You can call your existing XREAD logic or create a helper function
          executeXreadForWaitingClient(client, streamsMap);
        });
      }
    }
    if (command?.toUpperCase() === "XRANGE") {
      const streamName = commandArgs[0];
      const start = commandArgs[1];
      const end = commandArgs[2];

      const startIndex =
        start === "-"
          ? 0
          : streamsMap[streamName].findIndex(
              (item) =>
                item.id === (!start.split("-")[1] ? `${start}-0` : start)
            );
      const endIndex =
        end === "+"
          ? streamsMap[streamName].length - 1
          : streamsMap[streamName].findIndex(
              (item) => item.id === (!end.split("-")[1] ? `${end}-0` : end)
            );

      const outputData = streamsMap[streamName]
        .slice(startIndex, endIndex + 1)
        .map((entry) => {
          const { id, ...fields } = entry; // Extract id and remaining fields
          const fieldArray = Object.entries(fields).flat(); // Convert fields to flat array
          return [id, fieldArray];
        });

      let outputStr = "";

      outputData.forEach((item) => {
        outputStr += `*${item.length}\r\n$${item[0].length}\r\n${item[0]}\r\n*${item[1].length}\r\n`;
        (item[1] as string[]).forEach((field) => {
          outputStr += `$${field.length}\r\n${field}\r\n`;
        });
      });

      connection.write(`*${outputData.length}\r\n${outputStr}`);
    }
    if (command?.toUpperCase() === "XREAD") {
      let found = false;
      const timer =
        commandArgs[
          commandArgs.findIndex((item) => item.toUpperCase() === "BLOCK") + 1
        ];
      const streamsAndIds: string[] = commandArgs.slice(
        commandArgs.findIndex((item) => item.toUpperCase() === "STREAMS") + 1
      );

      const streamArray = streamsAndIds.slice(0, streamsAndIds.length / 2);

      const idsArray = streamsAndIds.slice(streamsAndIds.length / 2);

      let outputStr = `*${streamArray.length}\r\n`;

      const processedIds = idsArray.map((item, index) => {
        if (item === "$") {
          const latestId =
            streamsMap?.[streamArray[index]]?.[
              streamsMap[streamArray[index]]?.length - 1
            ]?.id;

          if (!latestId) {
            return "0-0";
          } else {
            return latestId;
          }
        } else {
          return item;
        }
      });

      streamArray.forEach((streamName, index) => {
        outputStr += `*2\r\n$${streamName.length}\r\n${streamName}\r\n`;
        const startIndex = streamsMap[streamName]?.findIndex(
          (item) =>
            item.id >
            (!processedIds[index].split("-")[1]
              ? `${processedIds[index]}-0`
              : processedIds[index])
        );

        if (startIndex !== undefined && startIndex >= 0) {
          const outputData = streamsMap[streamName]
            .slice(startIndex)
            .map((entry) => {
              const { id, ...fields } = entry; // Extract id and remaining fields
              const fieldArray = Object.entries(fields).flat(); // Convert fields to flat array
              return [id, fieldArray];
            });

          if (outputData.length > 0) {
            found = true;
          }

          if (found) {
            outputStr += `*${outputData.length}\r\n`;
            outputData.forEach((item) => {
              outputStr += `*${item.length}\r\n$${item[0].length}\r\n${item[0]}\r\n*${item[1].length}\r\n`;
              (item[1] as string[]).forEach((field) => {
                outputStr += `$${field.length}\r\n${field}\r\n`;
              });
            });
          }
        }
      });

      if (found) {
        connection.write(`${outputStr}`);
      }

      if (!found) {
        const client: {
          connection: net.Socket;
          streams: string[];
          timeout: number;
          idsArray: string[];
          timeoutId: Timer | null;
        } = {
          connection: connection,
          streams: streamArray,
          idsArray: processedIds,
          timeout: parseFloat(timer),
          timeoutId: null,
        };

        waitingClientsForStreams.push(client); // Add to waiting list FIRST
        if (timer !== "0") {
          // Then set timeout for non-zero timeouts
          const timeoutId = setTimeout(() => {
            // Find and remove this specific client
            const clientIndex = waitingClientsForStreams.findIndex(
              (c) => c.connection === connection
            );
            if (clientIndex !== -1) {
              connection.write("*-1\r\n");
              waitingClientsForStreams.splice(clientIndex, 1);
            }
          }, parseFloat(timer));

          client.timeoutId = timeoutId; // Store the timeout ID
        }
      }
    }
  });
});

server.listen(6379, "127.0.0.1");
