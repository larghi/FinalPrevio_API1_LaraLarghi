import * as SQLite from 'expo-sqlite';
import type { Equipment, Reading } from '../domain/types';

type EquipmentRow = {
  id: string;
  name: string;
  area: string;
  enabled: number;
  temperature: number;
  max_temp: number;
  updated_at: string;
};

type ReadingRow = {
  id: number;
  equipment_id: string;
  temperature: number;
  source: string;
  created_at: string;
};

let connection: Promise<SQLite.SQLiteDatabase> | null = null;

export function openPlantDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (connection) return connection;
  connection = (async () => {
    const db = await SQLite.openDatabaseAsync('planta_iiot.db');
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS equipment (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        area TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        temperature REAL NOT NULL DEFAULT 0,
        max_temp REAL NOT NULL DEFAULT 60,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        equipment_id TEXT NOT NULL,
        temperature REAL NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    const initial = [
      ['P-101', 'Bomba de recirculación', 'Línea hidráulica', 1, 46.8, 65],
      ['M-204', 'Motor transportador', 'Línea de montaje', 1, 58.4, 70],
      ['A-003', 'Nodo ambiental', 'Área de control', 1, 24.3, 36],
    ] as const;
    for (const row of initial) {
      await db.runAsync(
        `INSERT OR IGNORE INTO equipment (id, name, area, enabled, temperature, max_temp, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [...row, new Date().toISOString()]
      );
    }
    return db;
  })().catch((error: unknown) => {
    connection = null;
    throw error;
  });
  return connection;
}

function toEquipment(row: EquipmentRow): Equipment {
  return {
    id: row.id,
    name: row.name,
    area: row.area,
    enabled: row.enabled,
    temperature: row.temperature,
    maxTemp: row.max_temp,
    updatedAt: row.updated_at,
  };
}

export async function findEquipment(filter: string): Promise<Equipment[]> {
  const db = await openPlantDatabase();
  const text = filter.trim();
  const clause = text ? 'WHERE name LIKE ? OR id LIKE ?' : '';
  const rows = await db.getAllAsync<EquipmentRow>(
    `SELECT * FROM equipment ${clause} ORDER BY id ASC`,
    text ? [`%${text}%`, `%${text}%`] : []
  );
  return rows.map(toEquipment);
}

export async function saveEquipmentState(id: string, enabled: boolean): Promise<void> {
  const db = await openPlantDatabase();
  const result = await db.runAsync('UPDATE equipment SET enabled = ? WHERE id = ?', enabled ? 1 : 0, id);
  if (result.changes !== 1) throw new Error('No se encontró el equipo para guardar su estado.');
}

export async function saveEquipmentThreshold(id: string, maxTemp: number): Promise<void> {
  if (!Number.isFinite(maxTemp) || maxTemp <= 0 || maxTemp > 150) {
    throw new Error('El límite debe ser mayor que 0 y menor o igual a 150 °C.');
  }
  const db = await openPlantDatabase();
  const result = await db.runAsync('UPDATE equipment SET max_temp = ? WHERE id = ?', maxTemp, id);
  if (result.changes !== 1) throw new Error('No se encontró el equipo para guardar su límite.');
}

export async function findRecentReadings(equipmentId: string): Promise<Reading[]> {
  const db = await openPlantDatabase();
  const rows = await db.getAllAsync<ReadingRow>(
    `SELECT id, equipment_id, temperature, source, created_at FROM readings
     WHERE equipment_id = ? ORDER BY created_at DESC, id DESC LIMIT 10`,
    equipmentId
  );
  return rows.map((row) => ({
    id: row.id,
    equipmentId: row.equipment_id,
    temperature: row.temperature,
    source: row.source,
    createdAt: row.created_at,
  }));
}

export async function recordReading(
  id: string,
  temperature: number,
  source: string
): Promise<void> {
  const db = await openPlantDatabase();
  const stamp = new Date().toISOString();
  await db.runAsync(
    'UPDATE equipment SET temperature = ?, updated_at = ? WHERE id = ?',
    temperature,
    stamp,
    id
  );
  await db.runAsync(
    'INSERT INTO readings (equipment_id, temperature, source, created_at) VALUES (?, ?, ?, ?)',
    id,
    temperature,
    source,
    stamp
  );
}
