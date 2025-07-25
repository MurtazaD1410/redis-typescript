import { executeCommand } from "../main";
import { parseRespArray } from "../parser";
import type {
  ClientTransactionsType,
  Connection,
  ListMapType,
  MapType,
  RoleConfig,
  StreamsMapType,
  WaitingClientsForListType,
  WaitingClientsForStreamsType,
} from "../types";

export const exec = (
  stringCommand: string,
  connection: Connection,
  clientTransactions: ClientTransactionsType,
  map: MapType,
  listMap: ListMapType,
  streamsMap: StreamsMapType,
  waitingClientsForStreams: WaitingClientsForStreamsType,
  waitingClientsForList: WaitingClientsForListType,
  roleConfig: RoleConfig
) => {
  const clientState = clientTransactions.get(connection);
  if (!clientState?.inTransaction) {
    connection.write("-ERR EXEC without MULTI\r\n");
    return;
  }
  const results: string[] = [];
  for (const queuedData of clientState.queue) {
    const { command: queuedCommand, commandArgs: queuedArgs } =
      parseRespArray(queuedData);
    let capturedResponse = "";
    const originalWrite = connection.write;
    connection.write = (data: string) => {
      capturedResponse = data;
      return true;
    };
    executeCommand(
      stringCommand,
      queuedCommand,
      queuedArgs,
      connection,
      map,
      listMap,
      streamsMap,
      waitingClientsForStreams,
      waitingClientsForList,
      roleConfig
    );
    connection.write = originalWrite;
    results.push(capturedResponse);
  }
  let response = `*${results.length}\r\n`;
  results.forEach((result) => {
    response += result;
  });
  connection.write(response);
  clientTransactions.set(connection, { inTransaction: false, queue: [] });
};
