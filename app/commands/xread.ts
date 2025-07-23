import type {
  Connection,
  StreamsMapType,
  WaitingClientForStreamsType,
  WaitingClientsForStreamsType,
} from "../types";

export const xread = (
  connection: Connection,
  commandArgs: string[],
  streamsMap: StreamsMapType,
  waitingClientsForStreams: WaitingClientsForStreamsType
) => {
  let found = false;
  const timer =
    commandArgs[
      commandArgs.findIndex((item) => item.toUpperCase() === "BLOCK") + 1
    ];
  const streamsAndIds: string[] = commandArgs.slice(
    commandArgs.findIndex((item) => item.toUpperCase() === "STREAMS") + 1
  );

  const streamArray = streamsAndIds.slice(0, streamsAndIds.length / 2);

  const idsArray = streamsAndIds.slice(streamsAndIds.length / 2);

  let outputStr = `*${streamArray.length}\r\n`;

  const processedIds = idsArray.map((item, index) => {
    if (item === "$") {
      const latestId =
        streamsMap?.[streamArray[index]]?.[
          streamsMap[streamArray[index]]?.length - 1
        ]?.id;

      if (!latestId) {
        return "0-0";
      } else {
        return latestId;
      }
    } else {
      return item;
    }
  });

  streamArray.forEach((streamName, index) => {
    outputStr += `*2\r\n$${streamName.length}\r\n${streamName}\r\n`;
    const startIndex = streamsMap[streamName]?.findIndex(
      (item) =>
        item.id >
        (!processedIds[index].split("-")[1]
          ? `${processedIds[index]}-0`
          : processedIds[index])
    );

    if (startIndex !== undefined && startIndex >= 0) {
      const outputData = streamsMap[streamName]
        .slice(startIndex)
        .map((entry) => {
          const { id, ...fields } = entry; // Extract id and remaining fields
          const fieldArray = Object.entries(fields).flat(); // Convert fields to flat array
          return [id, fieldArray];
        });

      if (outputData.length > 0) {
        found = true;
      }

      if (found) {
        outputStr += `*${outputData.length}\r\n`;
        outputData.forEach((item) => {
          outputStr += `*${item.length}\r\n$${item[0].length}\r\n${item[0]}\r\n*${item[1].length}\r\n`;
          (item[1] as string[]).forEach((field) => {
            outputStr += `$${field.length}\r\n${field}\r\n`;
          });
        });
      }
    }
  });

  if (found) {
    connection.write(`${outputStr}`);
  }

  if (!found) {
    const client: WaitingClientForStreamsType = {
      connection: connection,
      streams: streamArray,
      idsArray: processedIds,
      timeout: parseFloat(timer),
      timeoutId: null,
    };

    waitingClientsForStreams.push(client); // Add to waiting list FIRST
    if (timer !== "0") {
      // Then set timeout for non-zero timeouts
      const timeoutId = setTimeout(() => {
        // Find and remove this specific client
        const clientIndex = waitingClientsForStreams.findIndex(
          (c) => c.connection === connection
        );
        if (clientIndex !== -1) {
          connection.write("*-1\r\n");
          waitingClientsForStreams.splice(clientIndex, 1);
        }
      }, parseFloat(timer));

      client.timeoutId = timeoutId; // Store the timeout ID
    }
  }
};
