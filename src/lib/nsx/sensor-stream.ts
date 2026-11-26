import { useEffect, useState } from "react";
import type { SensorId } from "./types";
import { useNsx } from "./store";

export const SENSOR_TIMEOUT_MS = 3000;
export function sensorStreamStatus(connected: boolean, last: number | undefined, now: number) {
  if (!connected) return "disconnected";
  if (last === undefined) return "no data";
  return now - last < SENSOR_TIMEOUT_MS ? "receiving" : "stale";
}
/** Updates status even when no further serial bytes arrive. Does not alter device timestamps. */
export function useSensorStreams() {
  const { serial } = useNsx();
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    if (!serial.connected) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [serial.connected]);
  return (id: SensorId) => sensorStreamStatus(serial.connected, serial.lastSampleAt[id], now);
}