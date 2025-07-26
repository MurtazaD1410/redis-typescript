import * as net from "net";
import { parseRespArray } from "./parser";
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

const slaves: Array<net.Socket> = [];
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
  stringCommand: string,
  command: string,
  commandArgs: string[],
  connection: net.Socket,
  map: MapType,
  listMap: ListMapType,
  streamsMap: StreamsMapType,
  waitingClientsForStreams: WaitingClientsForStreamsType,
  waitingClientsForList: WaitingClientsForListType,
  roleConfig: RoleConfig
) {
  if (command?.toUpperCase() === "PING") {
    ping(connection);
  }
  if (command?.toUpperCase() === "ECHO") {
    echo(connection, commandArgs);
  }
  if (command?.toUpperCase() === "SET") {
    set(connection, commandArgs, map, slaves, roleConfig);
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
      stringCommand,
      connection,
      clientTransactions,
      map,
      listMap,
      streamsMap,
      waitingClientsForStreams,
      waitingClientsForList,
      roleConfig
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
    const { command, commandArgs } = parseRespArray(data.toString());

    if (roleConfig.role === "master") {
      const response = data.toString();
      if (response === "*1\r\n$4\r\nPING\r\n") {
        console.log("Received PONG from master");
        // Optionally proceed to next steps or close the socket for this stage
      }
    }
    if (roleConfig.role === "master") {
      if (command?.toUpperCase() === "REPLCONF") {
        connection.write("+OK\r\n");
        return;
      }

      if (command?.toUpperCase() === "PSYNC") {
        const emptyRdb = Buffer.from(
          "524544495330303131fa0972656469732d76657205372e322e30fa0a72656469732d62697473c040fa056374696d65c26d08bc65fa08757365642d6d656dc2b0c41000fa08616f662d62617365c000fff06e3bfec0ff5aa2",
          "hex"
        );
        connection.write(
          "+FULLRESYNC 8371b4fb1155b71f4a04d3e1bc3e18c4a990aeeb 0\r\n"
        );

        connection.write(`$${emptyRdb.length}\r\n`);
        connection.write(emptyRdb as unknown as Uint8Array);
        slaves.push(connection);

        // Clean up when slave disconnects
        connection.on("close", () => {
          const index = slaves.indexOf(connection);
          if (index > -1) {
            slaves.splice(index, 1);
          }
        });

        return;
      }
    }

    const clientState = clientTransactions.get(connection);
    if (
      command?.toUpperCase() === "EXEC" &&
      !clientTransactions.get(connection)?.inTransaction
    ) {
      connection.write("-ERR EXEC without MULTI\r\n");
      return;
    }
    if (
      command?.toUpperCase() === "DISCARD" &&
      clientTransactions.get(connection)?.inTransaction
    ) {
      clientTransactions.set(connection, { inTransaction: false, queue: [] });
      connection.write("+OK\r\n");
      return;
    }
    if (
      command?.toUpperCase() === "DISCARD" &&
      !clientTransactions.get(connection)?.inTransaction
    ) {
      connection.write("-ERR DISCARD without MULTI\r\n");
      return;
    }

    if (clientState?.inTransaction && command?.toUpperCase() !== "EXEC") {
      clientState.queue.push(data.toString());
      connection.write(`+QUEUED\r\n`);
      return;
    }

    executeCommand(
      data.toString(),
      command,
      commandArgs,
      connection,
      map,
      listMap,
      streamsMap,
      waitingClientsForStreams,
      waitingClientsForList,
      roleConfig
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
  // if (
  //   roleConfig.role === "slave" &&
  //   roleConfig.masterHost &&
  //   roleConfig.masterPort
  // ) {
  //   const masterClient = net.createConnection({
  //     host: roleConfig.masterHost,
  //     port: roleConfig.masterPort,
  //   });

  //   let handshakeStep = 0;

  //   masterClient.on("connect", () => {
  //     // Step 1: Send PING
  //     masterClient.write("*1\r\n$4\r\nPING\r\n");
  //     handshakeStep = 1;
  //   });

  //   masterClient.on("data", (data) => {
  //     if (handshakeStep === 1) {
  //       // Should receive PONG
  //       if (data.toString().includes("PONG")) {
  //         // Step 2: Send REPLCONF listening-port
  //         masterClient.write(
  //           `*3\r\n$8\r\nREPLCONF\r\n$14\r\nlistening-port\r\n$4\r\n${PORT}\r\n`
  //         );
  //         handshakeStep = 2;
  //       }
  //     } else if (handshakeStep === 2) {
  //       // Should receive OK
  //       if (data.toString().includes("OK")) {
  //         // Step 3: Send REPLCONF capa (capabilities)
  //         masterClient.write(
  //           "*3\r\n$8\r\nREPLCONF\r\n$4\r\ncapa\r\n$6\r\npsync2\r\n"
  //         );
  //         handshakeStep = 3;
  //       }
  //     } else if (handshakeStep === 3) {
  //       // Should receive OK
  //       if (data.toString().includes("OK")) {
  //         // Step 4: Send PSYNC (partial sync)
  //         masterClient.write("*3\r\n$5\r\nPSYNC\r\n$1\r\n?\r\n$2\r\n-1\r\n");
  //         handshakeStep = 4;
  //       }
  //     }
  //   });
  // }
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
    let handshakeComplete = false;
    let rdbReceived = false;

    masterClient.on("connect", () => {
      console.log("Connected to master");
      // Step 1: Send PING
      masterClient.write("*1\r\n$4\r\nPING\r\n");
      handshakeStep = 1;
    });

    masterClient.on("data", (data) => {
      if (!handshakeComplete) {
        console.log(
          "Handshake data received:",
          data.toString().replace(/\r\n/g, "\\r\\n")
        );

        if (handshakeStep === 1) {
          // Should receive PONG
          if (data.toString().includes("PONG")) {
            console.log("✅ Received PONG, sending REPLCONF listening-port");
            masterClient.write(
              `*3\r\n$8\r\nREPLCONF\r\n$14\r\nlistening-port\r\n$4\r\n${PORT}\r\n`
            );
            handshakeStep = 2;
          }
        } else if (handshakeStep === 2) {
          // Should receive OK
          if (data.toString().includes("OK")) {
            console.log(
              "✅ Received OK for listening-port, sending REPLCONF capa"
            );
            masterClient.write(
              "*3\r\n$8\r\nREPLCONF\r\n$4\r\ncapa\r\n$6\r\npsync2\r\n"
            );
            handshakeStep = 3;
          }
        } else if (handshakeStep === 3) {
          // Should receive OK
          if (data.toString().includes("OK")) {
            console.log("✅ Received OK for capa, sending PSYNC");
            masterClient.write("*3\r\n$5\r\nPSYNC\r\n$1\r\n?\r\n$2\r\n-1\r\n");
            handshakeStep = 4;
          }
        } else if (handshakeStep === 4) {
          // Should receive FULLRESYNC and RDB data
          const dataStr = data.toString();
          if (dataStr.includes("FULLRESYNC")) {
            console.log("✅ Received FULLRESYNC");

            // Check if RDB data is in the same packet
            const lines = dataStr.split("\r\n");
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].startsWith("$")) {
                // This is the RDB size indicator
                console.log("✅ RDB data received, handshake complete!");
                handshakeComplete = true;
                rdbReceived = true;
                break;
              }
            }
          } else if (!rdbReceived) {
            // This might be just the RDB data
            console.log("✅ RDB data received, handshake complete!");
            handshakeComplete = true;
            rdbReceived = true;
          }
        }
      } else {
        // Handshake is complete, handle propagated commands
        console.log("🚀 PROPAGATED COMMAND RECEIVED 🚀");
        console.log("Raw data:", data.toString().replace(/\r\n/g, "\\r\\n"));

        try {
          const dataStr = data.toString();

          // Handle multiple commands in one packet
          const commands = dataStr
            .split("*")
            .filter((cmd) => cmd.trim() !== "");

          for (const cmdStr of commands) {
            const fullCommand = "*" + cmdStr;
            console.log(
              "Processing command:",
              fullCommand.replace(/\r\n/g, "\\r\\n")
            );

            try {
              const { command, commandArgs } = parseRespArray(fullCommand);

              if (command && command.trim() !== "") {
                console.log(
                  `⚡ Executing on slave: ${command} [${commandArgs.join(
                    ", "
                  )}]`
                );

                // Execute the command on slave's data structures
                executeCommand(
                  fullCommand,
                  command,
                  commandArgs,
                  masterClient, // Use masterClient as the connection (though it won't send responses)
                  map,
                  listMap,
                  streamsMap,
                  waitingClientsForStreams,
                  waitingClientsForList,
                  roleConfig
                );

                console.log(
                  `✅ Command ${command} executed successfully on slave`
                );
              }
            } catch (parseError) {
              console.error("Error parsing individual command:", parseError);
              console.error(
                "Command string was:",
                fullCommand.replace(/\r\n/g, "\\r\\n")
              );
            }
          }
        } catch (error) {
          console.error("Error processing propagated commands:", error);
          console.error(
            "Raw data was:",
            data.toString().replace(/\r\n/g, "\\r\\n")
          );
        }
      }
    });

    masterClient.on("error", (error) => {
      console.error("❌ Master connection error:", error);
    });

    masterClient.on("close", () => {
      console.log("❌ Master connection closed");
    });
  }
});
