import type { Connection, MapType } from "../types";

export const get = (
  connection: Connection,
  commandArgs: string[],
  map: MapType
) => {
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
      `$${map[commandArgs[0]].value.length}\r\n${map[commandArgs[0]].value}\r\n`
    );
  }
};
