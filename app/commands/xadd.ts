import type {
  Connection,
  StreamsMapType,
  WaitingClientsForStreamsType,
} from "../types";
import { executeXreadForWaitingClient } from "../utils";

export const xadd = (
  connection: Connection,
  commandArgs: string[],
  streamsMap: StreamsMapType,
  waitingClientsForStreams: WaitingClientsForStreamsType
) => {
  const streamName = commandArgs[0];
  if (!streamsMap[streamName]) {
    streamsMap[streamName] = [];
  }
  let id = commandArgs[1];
  if (id === "*") {
    id = `${Date.now()}-0`;
  }

  const entry: Record<string, string> = { id: id };
  for (let i = 2; i < commandArgs.length; i += 2) {
    const key = commandArgs[i];
    const value = commandArgs[i + 1];
    entry[key] = value;
  }
  const oldId = streamsMap[streamName][streamsMap[streamName]?.length - 1]?.id;
  if (id === "0-0") {
    connection.write(
      `-ERR The ID specified in XADD must be greater than 0-0\r\n`
    );
    return;
  }

  if (oldId) {
    const [oldTimestamp, oldSequence] = oldId.split("-").map(Number);
    // const [newTimestamp, newSequence] = entry.id.split("-").map(Number);
    const [newTimestampStr, newSequenceStr] = entry.id.split("-");
    const newTimestamp = Number(newTimestampStr);
    let newSequence;

    if (newSequenceStr === "*") {
      if (oldTimestamp === newTimestamp) newSequence = oldSequence + 1;
      else newSequence = 0;
    } else {
      newSequence = Number(newSequenceStr);
    }

    if (
      newTimestamp < oldTimestamp ||
      (newTimestamp === oldTimestamp && newSequence <= oldSequence)
    ) {
      connection.write(
        `-ERR The ID specified in XADD is equal or smaller than the target stream top item\r\n`
      );
      return;
    }

    entry.id = `${newTimestamp}-${newSequence}`;
  } else {
    if (entry.id.split("-")[1] === "*") {
      entry.id = `${entry.id.split("-")[0]}-${1}`;
    }
  }

  streamsMap[streamName].push(entry);
  connection.write(`$${entry?.id?.length}\r\n${entry?.id}\r\n`);

  const waitingClientsToNotify = waitingClientsForStreams.filter((client) =>
    client.streams.includes(streamName)
  );

  if (waitingClientsToNotify.length > 0) {
    waitingClientsToNotify.forEach((client) => {
      // Clear their timeout if they have one
      if (client.timeoutId) {
        clearTimeout(client.timeoutId);
      }

      // Remove them from waiting list
      const clientIndex = waitingClientsForStreams.findIndex(
        (c) => c === client
      );
      if (clientIndex !== -1) {
        waitingClientsForStreams.splice(clientIndex, 1);
      }

      // Execute XREAD for this client
      // You can call your existing XREAD logic or create a helper function
      executeXreadForWaitingClient(client, streamsMap);
    });
  }
};
