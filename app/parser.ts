const data = "*2\r\n$4\r\nECHO\r\n$3\r\nhey\r\n";

export const parseRespArray = (data: string) => {
  const splitData = data.split("\r\n");
  const elements = [];

  for (let i = 1; i < splitData.length; i++) {
    if (splitData[i].startsWith("$")) {
      elements.push(splitData[i + 1]);
      i++;
    }
  }

  return { command: elements[0], commandArgs: elements.slice(1) ?? [] };
};
