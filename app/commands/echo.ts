import type { Connection } from "../types";

export const echo = (connection: Connection, commandArgs: string[]) => {
  const response = `$${commandArgs[0]?.length}\r\n${commandArgs}\r\n`;
  connection.write(response);
};
