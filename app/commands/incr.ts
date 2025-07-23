import type { Connection, MapType } from "../types";

export const incr = (
  connection: Connection,
  commandArgs: string[],
  map: MapType
) => {
  const key = commandArgs[0];
  const item = map[key];

  if (!item) {
    map[key] = { value: "1" };
    connection.write(`:${map[key].value}\r\n`);
    return;
  } else if (item.expiresAt && Date.now() > item.expiresAt) {
    delete map[key];
    connection.write(`$-1\r\n`);
    return;
  } else {
    const val = (parseInt(map[key].value) + 1).toString();
    if (val === "NaN") {
      connection.write(`-ERR value is not an integer or out of range\r\n`);
      return;
    }
    map[key].value = val;
    connection.write(`:${map[commandArgs[0]].value}\r\n`);
  }
};
