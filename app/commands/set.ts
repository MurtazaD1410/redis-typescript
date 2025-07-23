import type { Connection, MapType } from "../types";

export const set = (
  connection: Connection,
  commandArgs: string[],
  map: MapType
) => {
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
};
