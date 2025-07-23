import type { Connection } from "../types";

export const ping = (connection: Connection) => {
  connection.write(`+PONG\r\n`);
};
