import * as net from "net";

export type Connection = net.Socket;
export type MapType = Record<string, { value: string; expiresAt?: number }>;
export type ListMapType = Record<string, string[]>;
export type StreamsMapType = Record<string, Array<Record<string, string>>>;
export type WaitingClientForListType = {
  connection: net.Socket;
  lists: string[];
  timeout: number;
  timeoutId: Timer | null;
  startTime?: number;
};
export type WaitingClientsForListType = Array<WaitingClientForListType>;
export type WaitingClientForStreamsType = {
  connection: net.Socket;
  streams: string[];
  idsArray: string[];
  timeout: number;
  timeoutId: Timer | null;
};
export type WaitingClientsForStreamsType = Array<WaitingClientForStreamsType>;
export type ClientTransactionsType = Map<
  net.Socket,
  { inTransaction: boolean; queue: string[] }
>;
