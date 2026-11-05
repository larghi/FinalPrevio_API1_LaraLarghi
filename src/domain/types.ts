export type Equipment = {
  id: string;
  name: string;
  area: string;
  enabled: number;
  temperature: number;
  maxTemp: number;
  updatedAt: string;
};

export type Reading = {
  id: number;
  equipmentId: string;
  temperature: number;
  source: string;
  createdAt: string;
};

export type AmbientResult = {
  temperature: number;
  humidity: number | null;
  timestamp: string;
};

export type SyncMode = 'sincronizado' | 'simulado' | 'inicial';
