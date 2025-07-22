import * as net from "net";

export function executeXreadForWaitingClient(
  client: {
    connection: net.Socket;
    streams: string[];
    timeout: number;
    idsArray: string[];
    timeoutId: Timer | null;
  },
  streamsMap: Record<string, Array<Record<string, string>>>
) {
  const streamArray = client.streams;

  let outputStr = `*${streamArray.length}\r\n`;
  let found = false;

  // streamArray.forEach((streamName: string) => {
  //   outputStr += `*2\r\n$${streamName.length}\r\n${streamName}\r\n`;

  //   // Get the latest entry (since they were waiting)
  //   const latestEntry =
  //     streamsMap[streamName][streamsMap[streamName].length - 1];

  //   if (latestEntry) {
  //     found = true;
  //     const { id, ...fields } = latestEntry;
  //     const fieldArray = Object.entries(fields).flat();
  //     const outputData = [[id, fieldArray]];

  //     outputStr += `*${outputData.length}\r\n`;
  //     outputData.forEach((item) => {
  //       outputStr += `*${item.length}\r\n$${item[0].length}\r\n${item[0]}\r\n*${item[1].length}\r\n`;
  //       (item[1] as string[]).forEach((field) => {
  //         outputStr += `$${field.length}\r\n${field}\r\n`;
  //       });
  //     });
  //   } else {
  //     outputStr += `*0\r\n`; // Empty array for this stream
  //   }
  // });
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
    client.connection.write(outputStr);
  }
}
