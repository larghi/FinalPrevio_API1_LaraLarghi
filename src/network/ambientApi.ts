import axios from 'axios';
import type { AmbientResult } from '../domain/types';

type OpenMeteoResponse = {
  current?: {
    temperature_2m?: number;
    relative_humidity_2m?: number;
    time?: string;
  };
};

const api = axios.create({
  baseURL: 'https://api.open-meteo.com',
  timeout: 6000,
});

// Referencia de ambiente externa, no lectura real de una fábrica.
export async function getOutdoorReference(): Promise<AmbientResult> {
  const response = await api.get<OpenMeteoResponse>('/v1/forecast', {
    params: {
      latitude: -34.6037,
      longitude: -58.3816,
      current: 'temperature_2m,relative_humidity_2m',
      timezone: 'America/Argentina/Buenos_Aires',
    },
  });
  const current = response.data.current;
  if (!current || typeof current.temperature_2m !== 'number') {
    throw new Error('Respuesta ambiental incompleta');
  }
  return {
    temperature: current.temperature_2m,
    humidity: typeof current.relative_humidity_2m === 'number' ? current.relative_humidity_2m : null,
    timestamp: current.time ?? '',
  };
}
