import type {
  Connection,
  ListMapType,
  WaitingClientsForListType,
} from "../types";

export const rpush = (
  connection: Connection,
  commandArgs: string[],
  listMap: ListMapType,
  waitingClientsForList: WaitingClientsForListType
) => {
  const listName = commandArgs[0];

  if (!listMap[listName]) {
    listMap[listName] = [...commandArgs.slice(1)];
  } else {
    listMap[listName].push(...commandArgs.slice(1));
  }
  connection.write(`:${listMap[listName].length}\r\n`);

  for (let i = 0; i < waitingClientsForList.length; i++) {
    const client = waitingClientsForList[i];

    if (client.lists.includes(listName)) {
      const poppedElement = listMap[listName].shift();

      const response = `*2\r\n$${listName.length}\r\n${listName}\r\n$${poppedElement?.length}\r\n${poppedElement}\r\n`;

      client.connection.write(response);

      if (client.timeoutId) {
        clearTimeout(client.timeoutId);
      }

      waitingClientsForList.splice(i, 1);

      break;
    } else {
    }
  }
};
