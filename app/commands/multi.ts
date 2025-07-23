import type { ClientTransactionsType, Connection } from "../types";

export const multi = (
  connection: Connection,
  clientTransactions: ClientTransactionsType
) => {
  clientTransactions.set(connection, { inTransaction: true, queue: [] });
  connection.write("+OK\r\n");
};
