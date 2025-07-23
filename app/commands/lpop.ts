import type { Connection, ListMapType } from "../types";

export const lpop = (
  connection: Connection,
  commandArgs: string[],
  listMap: ListMapType
) => {
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
};
