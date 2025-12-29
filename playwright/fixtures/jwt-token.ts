export function createJTWToken(sub: string, room: string) {
  return [
    {}, // header
    {
      // payload
      sub,
      video: {
        room,
      },
    },
    {}, // signature
  ]
    .map((d) => global.btoa(JSON.stringify(d)))
    .join(".");
}
