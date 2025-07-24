import * as net from "net";
import { parseRespArray } from "./parser";
import { executeXreadForWaitingClient } from "./utils";
import { ping } from "./commands/ping";
import { echo } from "./commands/echo";
import { set } from "./commands/set";
import type {
  ListMapType,
  MapType,
  RoleConfig,
  StreamsMapType,
  WaitingClientsForListType,
  WaitingClientsForStreamsType,
} from "./types";
import { get } from "./commands/get";
import { rpush } from "./commands/rpush";
import { lrange } from "./commands/lrange";
import { lpush } from "./commands/lpush";
import { llen } from "./commands/llen";
import { lpop } from "./commands/lpop";
import { blpop } from "./commands/blpop";
import { type } from "./commands/type";
import { xadd } from "./commands/xadd";
import { xread } from "./commands/xread";
import { xrange } from "./commands/xrange";
import { incr } from "./commands/incr";
import { multi } from "./commands/multi";
import { exec } from "./commands/exec";
import { info } from "./commands/info";

const map: MapType = {};
const listMap: ListMapType = {};
const streamsMap: StreamsMapType = {};
let waitingClientsForList: WaitingClientsForListType = [];
let waitingClientsForStreams: WaitingClientsForStreamsType = [];

const clientTransactions: Map<
  net.Socket,
  { inTransaction: boolean; queue: string[] }
> = new Map();

export function executeCommand(
  command: string,
  commandArgs: string[],
  connection: net.Socket,
  map: MapType,
  listMap: ListMapType,
  streamsMap: StreamsMapType,
  waitingClientsForStreams: WaitingClientsForStreamsType,
  waitingClientsForList: WaitingClientsForListType
) {
  if (command?.toUpperCase() === "PING") {
    ping(connection);
  }
  if (command?.toUpperCase() === "ECHO") {
    echo(connection, commandArgs);
  }
  if (command?.toUpperCase() === "SET") {
    set(connection, commandArgs, map);
  }
  if (command?.toUpperCase() === "GET") {
    get(connection, commandArgs, map);
  }
  if (command?.toUpperCase() === "RPUSH") {
    rpush(connection, commandArgs, listMap, waitingClientsForList);
  }
  if (command?.toUpperCase() === "LRANGE") {
    lrange(connection, commandArgs, listMap);
  }
  if (command?.toUpperCase() === "LPUSH") {
    lpush(connection, commandArgs, listMap, waitingClientsForList);
  }
  if (command?.toUpperCase() === "LLEN") {
    llen(connection, commandArgs, listMap);
  }
  if (command?.toUpperCase() === "LPOP") {
    lpop(connection, commandArgs, listMap);
  }
  if (command?.toUpperCase() === "BLPOP") {
    blpop(connection, commandArgs, listMap, waitingClientsForList);
  }
  if (command?.toUpperCase() === "TYPE") {
    type(connection, commandArgs, map, listMap, streamsMap);
  }
  if (command?.toUpperCase() === "XADD") {
    xadd(connection, commandArgs, streamsMap, waitingClientsForStreams);
  }
  if (command?.toUpperCase() === "XRANGE") {
    xrange(connection, commandArgs, streamsMap);
  }
  if (command?.toUpperCase() === "XREAD") {
    xread(connection, commandArgs, streamsMap, waitingClientsForStreams);
  }
  if (command?.toUpperCase() === "INCR") {
    incr(connection, commandArgs, map);
  }
  if (command?.toUpperCase() === "MULTI") {
    multi(connection, clientTransactions);
  }
  if (command?.toUpperCase() === "EXEC") {
    exec(
      connection,
      clientTransactions,
      map,
      listMap,
      streamsMap,
      waitingClientsForStreams,
      waitingClientsForList
    );
  }
  if (command?.toUpperCase() === "INFO") {
    info(connection, commandArgs, roleConfig);
  }
}

console.log("Logs from your program will appear here!");

const server: net.Server = net.createServer((connection: net.Socket) => {
  clientTransactions.set(connection, { inTransaction: false, queue: [] });
  connection.on("data", (data) => {
    if (roleConfig.role === "master") {
      const response = data.toString();
      if (response === "*1\r\n$4\r\nPING\r\n") {
        console.log("Received PONG from master");
        // Optionally proceed to next steps or close the socket for this stage
      }
    }
    const { command, commandArgs } = parseRespArray(data.toString());
    if (roleConfig.role === "master") {
      if (command.toUpperCase() === "REPLCONF") {
        connection.write("+OK\r\n");
        return;
      }

      if (command.toUpperCase() === "PSYNC") {
        const emptyRdb = Buffer.from(
          "524544495330303131fa0972656469732d76657205372e322e30fa0a72656469732d62697473c040fa056374696d65c26d08bc65fa08757365642d6d656dc2b0c41000fa08616f662d62617365c000fff06e3bfec0ff5aa2",
          "hex"
        );
        connection.write(
          "+FULLRESYNC 8371b4fb1155b71f4a04d3e1bc3e18c4a990aeeb 0\r\n"
        );

        connection.write(`$${emptyRdb.length}\r\n`);
        connection.write(emptyRdb as unknown as Uint8Array);

        return;
      }
    }

    const clientState = clientTransactions.get(connection);
    if (
      command.toUpperCase() === "EXEC" &&
      !clientTransactions.get(connection)?.inTransaction
    ) {
      connection.write("-ERR EXEC without MULTI\r\n");
      return;
    }
    if (
      command.toUpperCase() === "DISCARD" &&
      clientTransactions.get(connection)?.inTransaction
    ) {
      clientTransactions.set(connection, { inTransaction: false, queue: [] });
      connection.write("+OK\r\n");
      return;
    }
    if (
      command.toUpperCase() === "DISCARD" &&
      !clientTransactions.get(connection)?.inTransaction
    ) {
      connection.write("-ERR DISCARD without MULTI\r\n");
      return;
    }

    if (clientState?.inTransaction && command.toUpperCase() !== "EXEC") {
      clientState.queue.push(data.toString());
      connection.write(`+QUEUED\r\n`);
      return;
    }

    executeCommand(
      command,
      commandArgs,
      connection,
      map,
      listMap,
      streamsMap,
      waitingClientsForStreams,
      waitingClientsForList
    );
  });

  connection.on("close", () => {
    clientTransactions.delete(connection);
  });
});

// Get port from CLI argument like --port 6380
function getPortFromArgs(defaultPort = 6379): number {
  const portFlagIndex = process.argv.indexOf("--port");
  if (portFlagIndex !== -1 && process.argv[portFlagIndex + 1]) {
    const port = parseInt(process.argv[portFlagIndex + 1], 10);
    if (!isNaN(port)) {
      return port;
    }
  }
  return defaultPort;
}

function getRoleFromArgs(): RoleConfig {
  const roleFlagIndex = process.argv.indexOf("--replicaof");
  if (roleFlagIndex !== -1 && process.argv[roleFlagIndex + 1]) {
    const [host, portStr] = process.argv[roleFlagIndex + 1].split(" ");
    if (host && !isNaN(parseInt(portStr, 10))) {
      return {
        role: "slave",
        masterHost: host,
        masterPort: parseInt(portStr, 10),
      };
    }
  }
  return { role: "master" };
}

const roleConfig = getRoleFromArgs();
const PORT = getPortFromArgs();

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  if (
    roleConfig.role === "slave" &&
    roleConfig.masterHost &&
    roleConfig.masterPort
  ) {
    const masterClient = net.createConnection({
      host: roleConfig.masterHost,
      port: roleConfig.masterPort,
    });

    let handshakeStep = 0;

    masterClient.on("connect", () => {
      // Step 1: Send PING
      masterClient.write("*1\r\n$4\r\nPING\r\n");
      handshakeStep = 1;
    });

    masterClient.on("data", (data) => {
      if (handshakeStep === 1) {
        // Should receive PONG
        if (data.toString().includes("PONG")) {
          // Step 2: Send REPLCONF listening-port
          masterClient.write(
            `*3\r\n$8\r\nREPLCONF\r\n$14\r\nlistening-port\r\n$4\r\n${PORT}\r\n`
          );
          handshakeStep = 2;
        }
      } else if (handshakeStep === 2) {
        // Should receive OK
        if (data.toString().includes("OK")) {
          // Step 3: Send REPLCONF capa (capabilities)
          masterClient.write(
            "*3\r\n$8\r\nREPLCONF\r\n$4\r\ncapa\r\n$6\r\npsync2\r\n"
          );
          handshakeStep = 3;
        }
      } else if (handshakeStep === 3) {
        // Should receive OK
        if (data.toString().includes("OK")) {
          // Step 4: Send PSYNC (partial sync)
          masterClient.write("*3\r\n$5\r\nPSYNC\r\n$1\r\n?\r\n$2\r\n-1\r\n");
          handshakeStep = 4;
        }
      }
    });
  }
});
