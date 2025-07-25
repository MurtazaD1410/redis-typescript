import type { Connection, MapType } from "../types";

export const set = (
  connection: Connection,
  commandArgs: string[],
  map: MapType,
  slaves: Connection[]
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

  const setCommand = `*3\r\n$3\r\nSET\r\n$${key.length}\r\n${key}\r\n$${value.length}\r\n${value}\r\n`;
  slaves.forEach((slave) => {
    console.log("in slave");
    if (slave.writable) {
      console.log("in slave write", setCommand);

      slave.write(setCommand);
    }
  });
};
