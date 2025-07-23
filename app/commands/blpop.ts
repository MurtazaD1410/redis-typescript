import type {
  Connection,
  ListMapType,
  WaitingClientForListType,
  WaitingClientsForListType,
} from "../types";

export const blpop = (
  connection: Connection,
  commandArgs: string[],
  listMap: ListMapType,
  waitingClientsForList: WaitingClientsForListType
) => {
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
    const client: WaitingClientForListType = {
      connection: connection,
      lists: listNames,
      timeout: parseFloat(timer),
      timeoutId: null,
      startTime: Date.now(),
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
};
