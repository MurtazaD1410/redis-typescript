const data = "*2\r\n$4\r\nECHO\r\n$3\r\nhey\r\n";

export const parseRespArray = (data: string) => {
  const splitData = data.split("\r\n");
  let command;
  let argument;

  for (let i = 0; i < splitData.length; i++) {
    const element = splitData[i];

    if (element.startsWith("$")) {
      command = splitData[i + 1];
      argument = splitData[i + 3];
      break;
    }
  }

  return { command, argument };
};
