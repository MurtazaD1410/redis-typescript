import type {
  Connection,
  ListMapType,
  MapType,
  StreamsMapType,
} from "../types";

export const type = (
  connection: Connection,
  commandArgs: string[],
  map: MapType,
  listMap: ListMapType,
  streamsMap: StreamsMapType
) => {
  const name = commandArgs[0];

  if (map[name]) {
    connection.write(`+string\r\n`);
  } else if (listMap[name]) {
    connection.write(`+list\r\n`);
  } else if (streamsMap[name]) {
    connection.write(`+stream\r\n`);
  } else {
    connection.write(`+none\r\n`);
  }
};
