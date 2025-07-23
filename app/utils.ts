import type { StreamsMapType, WaitingClientForStreamsType } from "./types";

export function executeXreadForWaitingClient(
  client: WaitingClientForStreamsType,
  streamsMap: StreamsMapType
) {
  const streamArray = client.streams;

  let outputStr = `*${streamArray.length}\r\n`;
  let found = false;

  streamArray.forEach((streamName, index) => {
    outputStr += `*2\r\n$${streamName.length}\r\n${streamName}\r\n`;
    const startIndex = streamsMap[streamName]?.findIndex(
      (item) =>
        item.id >
        (!client.idsArray[index].split("-")[1]
          ? `${client.idsArray[index]}-0`
          : client.idsArray[index])
    );

    if (startIndex !== undefined && startIndex >= 0) {
      const outputData = streamsMap[streamName]
        .slice(startIndex)
        .map((entry) => {
          const { id, ...fields } = entry;
          const fieldArray = Object.entries(fields).flat();
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
    client.connection.write(outputStr);
  }
}
