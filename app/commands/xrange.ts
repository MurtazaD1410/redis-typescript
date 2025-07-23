import type { Connection, StreamsMapType } from "../types";

export const xrange = (
  connection: Connection,
  commandArgs: string[],
  streamsMap: StreamsMapType
) => {
  const streamName = commandArgs[0];
  const start = commandArgs[1];
  const end = commandArgs[2];

  const startIndex =
    start === "-"
      ? 0
      : streamsMap[streamName].findIndex(
          (item) => item.id === (!start.split("-")[1] ? `${start}-0` : start)
        );
  const endIndex =
    end === "+"
      ? streamsMap[streamName].length - 1
      : streamsMap[streamName].findIndex(
          (item) => item.id === (!end.split("-")[1] ? `${end}-0` : end)
        );

  const outputData = streamsMap[streamName]
    .slice(startIndex, endIndex + 1)
    .map((entry) => {
      const { id, ...fields } = entry; // Extract id and remaining fields
      const fieldArray = Object.entries(fields).flat(); // Convert fields to flat array
      return [id, fieldArray];
    });

  let outputStr = "";

  outputData.forEach((item) => {
    outputStr += `*${item.length}\r\n$${item[0].length}\r\n${item[0]}\r\n*${item[1].length}\r\n`;
    (item[1] as string[]).forEach((field) => {
      outputStr += `$${field.length}\r\n${field}\r\n`;
    });
  });

  connection.write(`*${outputData.length}\r\n${outputStr}`);
};
