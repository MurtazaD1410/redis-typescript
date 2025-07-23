import type { Connection, RoleConfig } from "../types";

export const info = (
  connection: Connection,
  commandArgs: string[],
  roleConfig: RoleConfig
) => {
  switch (commandArgs[0]?.toUpperCase()) {
    case "REPLICATION":
      const outputStr = `role:${roleConfig.role}\r\nmaster_replid:8371b4fb1155b71f4a04d3e1bc3e18c4a990aeeb\r\nmaster_repl_offset:0`;
      connection.write(`$${outputStr.length}\r\n${outputStr}\r\n`);
      break;
    default:
      connection.write(`$0\r\n`);
      break;
  }
};
