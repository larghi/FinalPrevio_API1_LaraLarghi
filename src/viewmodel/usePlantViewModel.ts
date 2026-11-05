import { useCallback, useEffect, useRef, useState } from 'react';
import { Accelerometer } from 'expo-sensors';
import type { Equipment, Reading, SyncMode } from '../domain/types';
import { findEquipment, findRecentReadings, saveEquipmentState, saveEquipmentThreshold } from '../data/localDb';
import { simulateCycle, syncReference } from '../data/plantRepository';

export function parseThreshold(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 && value <= 150 ? value : null;
}

type HistoryState = {
  equipment: Equipment | null;
  readings: Reading[];
  loading: boolean;
  error: string | null;
};

export function usePlantViewModel() {
  const [items, setItems] = useState<Equipment[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('Cargando equipos locales…');
  const [mode, setMode] = useState<SyncMode>('inicial');
  const [humidity, setHumidity] = useState<number | null>(null);
  const [vibration, setVibration] = useState<number | null>(null);
  const [savingEnabledIds, setSavingEnabledIds] = useState<ReadonlySet<string>>(new Set());
  const enabledLocks = useRef(new Set<string>());
  const [thresholdEquipment, setThresholdEquipment] = useState<Equipment | null>(null);
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const thresholdLock = useRef(false);
  const [history, setHistory] = useState<HistoryState>({ equipment: null, readings: [], loading: false, error: null });
  const historyRequest = useRef(0);
  const listRequest = useRef(0);
  const dataRevision = useRef(0);
  const currentFilter = useRef('');
  const cycleLock = useRef(false);

  const reload = useCallback(async (text: string) => {
    const request = ++listRequest.current;
    // Una consulta anterior a un guardado no debe sobrescribir su confirmación.
    while (request === listRequest.current) {
      const revision = dataRevision.current;
      const rows = await findEquipment(text);
      if (request !== listRequest.current) return;
      if (revision !== dataRevision.current) continue;
      setItems(() => rows);
      return;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    reload('')
      .then(() => {
        if (alive) {
          setNotice('Equipos locales listos.');
        }
      })
      .catch((error: unknown) => {
        if (alive) setNotice(`No se pudieron cargar equipos: ${String(error)}`);
      });
    return () => {
      alive = false;
      ++listRequest.current;
      ++historyRequest.current;
    };
  }, [reload]);

  useEffect(() => {
    let active = true;
    let subscription: { remove(): void } | undefined;
    Accelerometer.isAvailableAsync()
      .then((available) => {
        if (available && active) {
          Accelerometer.setUpdateInterval(1000);
          subscription = Accelerometer.addListener(({ x, y, z }) => {
            const magnitude = Math.sqrt(x * x + y * y + z * z);
            setVibration(Math.round(Math.abs(magnitude - 1) * 100) / 100);
          });
        }
      })
      .catch(() => setVibration(null));
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  const search = async (text: string) => {
    currentFilter.current = text;
    setFilter(text);
    try {
      await reload(text);
      setNotice('Listado actualizado.');
    } catch (error) {
      setNotice(`Error al filtrar: ${String(error)}`);
    }
  };

  const changeEnabled = async (id: string, enabled: boolean) => {
    if (enabledLocks.current.has(id)) return;
    enabledLocks.current.add(id);
    setSavingEnabledIds(new Set(enabledLocks.current));
    try {
      await saveEquipmentState(id, enabled);
      ++dataRevision.current;
      setItems((current) => current.map((item) =>
        item.id === id ? { ...item, enabled: enabled ? 1 : 0 } : item
      ));
      setNotice(`Comando local aplicado a ${id}.`);
    } catch (error) {
      setNotice(`Error al guardar el estado: ${String(error)}`);
    } finally {
      enabledLocks.current.delete(id);
      setSavingEnabledIds(new Set(enabledLocks.current));
    }
  };

  const openThreshold = (item: Equipment) => {
    if (thresholdLock.current) return;
    setThresholdError(null);
    setThresholdEquipment(item);
  };

  const closeThreshold = () => {
    if (thresholdLock.current) return;
    setThresholdEquipment(null);
    setThresholdError(null);
  };

  const saveThreshold = async (text: string) => {
    if (!thresholdEquipment || thresholdLock.current) return;
    const maxTemp = parseThreshold(text);
    if (maxTemp === null) {
      setThresholdError('Ingresá un número mayor que 0 y menor o igual a 150 °C. Podés usar punto o coma decimal.');
      return;
    }
    const id = thresholdEquipment.id;
    thresholdLock.current = true;
    setThresholdSaving(true);
    setThresholdError(null);
    try {
      await saveEquipmentThreshold(id, maxTemp);
      ++dataRevision.current;
      setItems((current) => current.map((item) => item.id === id ? { ...item, maxTemp } : item));
      setNotice(`Límite de ${id} guardado: ${maxTemp} °C.`);
      setThresholdEquipment(null);
    } catch (error) {
      setThresholdError(`No se pudo guardar el límite. Podés reintentar. ${String(error)}`);
    } finally {
      thresholdLock.current = false;
      setThresholdSaving(false);
    }
  };

  const openHistory = async (equipment: Equipment) => {
    const request = ++historyRequest.current;
    setHistory({ equipment, readings: [], loading: true, error: null });
    try {
      const readings = await findRecentReadings(equipment.id);
      if (request === historyRequest.current) {
        setHistory({ equipment, readings, loading: false, error: null });
      }
    } catch (error) {
      if (request === historyRequest.current) {
        setHistory({ equipment, readings: [], loading: false, error: `No se pudo cargar el historial: ${String(error)}` });
      }
    }
  };

  const closeHistory = () => {
    ++historyRequest.current;
    setHistory({ equipment: null, readings: [], loading: false, error: null });
  };

  const simulate = async () => {
    if (cycleLock.current) return;
    cycleLock.current = true;
    setLoading(true);
    try {
      const all = await findEquipment('');
      await simulateCycle(all);
      ++dataRevision.current;
      await reload(currentFilter.current);
      setMode('simulado');
      setNotice('Lecturas simuladas registradas en SQLite.');
    } catch (error) {
      setNotice(`No se pudo simular: ${String(error)}`);
    } finally {
      cycleLock.current = false;
      setLoading(false);
    }
  };

  const sync = async () => {
    if (cycleLock.current) return;
    cycleLock.current = true;
    setLoading(true);
    let simulated = false;
    try {
      const all = await findEquipment('');
      await simulateCycle(all);
      simulated = true;
      const result = await syncReference();
      setHumidity(result.humidity);
      setMode('sincronizado');
      setNotice('Referencia ambiental recibida por HTTP y guardada.');
    } catch (error) {
      setMode('simulado');
      setNotice(simulated
        ? `Se registró la simulación, pero no se pudo sincronizar la referencia: ${String(error)}`
        : `No se pudo completar la simulación: ${String(error)}`);
    } finally {
      ++dataRevision.current;
      try {
        await reload(currentFilter.current);
      } catch (error) {
        setNotice(`No se pudo actualizar la vista: ${String(error)}`);
      }
      cycleLock.current = false;
      setLoading(false);
    }
  };

  return {
    items, filter, loading, notice, mode, humidity, vibration,
    search, changeEnabled, simulate, sync,
    savingEnabledIds, thresholdEquipment, thresholdSaving, thresholdError,
    openThreshold, closeThreshold, saveThreshold, history, openHistory, closeHistory,
  };
}
