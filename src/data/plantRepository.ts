import { getOutdoorReference } from '../network/ambientApi';
import { recordReading } from './localDb';

const round1 = (v: number) => Math.round(v * 10) / 10;

export async function simulateCycle(
  equipment: { id: string; temperature: number }[]
): Promise<void> {
  for (const item of equipment) {
    if (item.id === 'A-003') continue;
    const delta = (Math.random() - 0.5) * 5;
    await recordReading(item.id, round1(item.temperature + delta), 'simulación');
  }
}

export async function syncReference(): Promise<{ temperature: number; humidity: number | null }> {
  const reference = await getOutdoorReference();
  await recordReading('A-003', reference.temperature, 'API ambiental');
  return { temperature: reference.temperature, humidity: reference.humidity };
}
