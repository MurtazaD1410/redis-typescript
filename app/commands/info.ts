import type { Connection } from "../types";

export const info = (
  connection: Connection,
  commandArgs: string[],
  role: string
) => {
  switch (commandArgs[0]?.toUpperCase()) {
    case "REPLICATION":
      console.log(role);
      connection.write(`$${5 + role.length}\r\nrole:${role}\r\n`);
      break;
    default:
      connection.write(`$0\r\n`);
      break;
  }
};
