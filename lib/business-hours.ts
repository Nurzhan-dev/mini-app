const businessTimeZone = "Asia/Almaty";

export function isBusinessOpen(now = new Date()): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: businessTimeZone,
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .find((part) => part.type === "hour")?.value,
  );

  return hour >= 9 && hour < 23;
}
