import type { Connection, ListMapType } from "../types";

export const llen = (
  connection: Connection,
  commandArgs: string[],
  listMap: ListMapType
) => {
  const listName = commandArgs[0];
  const list = listMap[listName];
  if (!list) {
    connection.write(`:0\r\n`);
  } else {
    connection.write(`:${list.length}\r\n`);
  }
};
