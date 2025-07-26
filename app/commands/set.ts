import type { Connection, MapType, RoleConfig } from "../types";

export const set = (
  connection: Connection,
  commandArgs: string[],
  map: MapType,
  slaves: Connection[],
  roleConfig: RoleConfig
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

  if (!roleConfig || roleConfig.role === "master") {
    connection.write(`+OK\r\n`);

    // Propagate to slaves (only if we're the master)
    const setCommand = `*3\r\n$3\r\nSET\r\n$${key.length}\r\n${key}\r\n$${value.length}\r\n${value}\r\n`;
    slaves.forEach((slave) => {
      console.log("Propagating to slave");
      if (slave.writable) {
        console.log("Writing to slave:", setCommand.replace(/\r\n/g, "\\r\\n"));
        slave.write(setCommand);
      }
    });
  } else {
    // This is a slave executing a propagated command - don't send response
    console.log(`Slave stored: ${key} = ${value}`);
  }
};
