import type { Connection, ListMapType } from "../types";

export const lrange = (
  connection: Connection,
  commandArgs: string[],
  listMap: ListMapType
) => {
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
};
