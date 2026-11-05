// Verificaciones de lógica y SQL: no sustituyen una ejecución en Android/iOS.
// Sin dependencias adicionales; node:sqlite requiere Node >=22.13 (engines).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

function load(file, mocks) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  });
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', outputText)((name) => {
    if (!(name in mocks)) throw new Error(`Dependencia sin doble: ${name}`);
    return mocks[name];
  }, mod, mod.exports);
  return mod.exports;
}

const equipment = (id, enabled = 1) => ({
  id, enabled, name: `Equipo ${id}`, area: 'Planta', temperature: 50, maxTemp: 60, updatedAt: '2026-11-05T10:00:00Z',
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

// Doble mínimo de hooks para probar la coordinación asíncrona del ViewModel.
// No renderiza React Native ni simula la interfaz.
async function model(overrides = {}) {
  let slots = [], cursor = 0, effects = [];
  const cleanups = [];
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => {
        slots[index] = typeof value === 'function' ? value(slots[index]) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback(fn) { cursor++; return fn; },
    useEffect(fn) {
      const index = cursor++;
      if (!(index in slots)) { slots[index] = true; effects.push(fn); }
    },
  };
  const data = {
    findEquipment: async () => [equipment('P-101'), equipment('M-204')],
    saveEquipmentState: async () => {}, saveEquipmentThreshold: async () => {},
    findRecentReadings: async () => [], ...overrides,
  };
  const module = load('src/viewmodel/usePlantViewModel.ts', {
    react: hooks,
    'expo-sensors': { Accelerometer: { isAvailableAsync: async () => false } },
    '../data/localDb': data,
    '../data/plantRepository': { simulateCycle: async () => {}, syncReference: async () => ({ humidity: 40 }) },
  });
  const render = () => { cursor = 0; return module.usePlantViewModel(); };
  render();
  effects.forEach((fn) => cleanups.push(fn()));
  effects = [];
  await tick();
  return { render, parse: module.parseThreshold, dispose: () => cleanups.forEach((fn) => fn?.()) };
}

test('umbral: valida todo el texto, rango, decimales y valores no finitos', async () => {
  const h = await model();
  for (const text of ['', ' ', '0', '-1', '150.01', 'NaN', 'Infinity', '1e999', '12abc', '1,2,3', '0x10', '1 2']) {
    assert.equal(h.parse(text), null, text);
  }
  for (const [text, value] of [['150', 150], [' 12,5 ', 12.5], ['12.5', 12.5], ['.5', .5], ['1e2', 100]]) {
    assert.equal(h.parse(text), value, text);
  }
  h.dispose();
});

test('SQLite real: parámetros, orden, límite, orígenes y persistencia sin reinicializar', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'iiot-verify-'));
  const filename = path.join(directory, 'test.db');
  let database;
  const sqlite = { openDatabaseAsync: async () => {
    database = new DatabaseSync(filename);
    const args = (values) => Array.isArray(values[0]) ? values[0] : values;
    return {
      execAsync: async (sql) => database.exec(sql),
      runAsync: async (sql, ...values) => database.prepare(sql).run(...args(values)),
      getAllAsync: async (sql, ...values) => database.prepare(sql).all(...args(values)),
    };
  } };
  try {
    let db = load('src/data/localDb.ts', { 'expo-sqlite': sqlite });
    assert.equal((await db.findEquipment('')).length, 3);
    database.prepare('UPDATE equipment SET name = ? WHERE id = ?').run("Bomba d'agua", 'P-101');
    assert.equal((await db.findEquipment("  d'agua "))[0].id, 'P-101');
    assert.deepEqual(await db.findEquipment("' OR 1=1 --"), []);
    assert.equal((await db.findEquipment('  P-1  '))[0].id, 'P-101');
    assert.deepEqual(await db.findRecentReadings('P-101'), []);
    await db.saveEquipmentThreshold('P-101', 42.5);
    await db.saveEquipmentState('P-101', false);
    for (let i = 0; i < 12; i++) await db.recordReading('P-101', 40 + i, 'simulación');
    database.prepare('UPDATE readings SET created_at = ?').run('2026-11-05T10:00:00.000Z');
    database.prepare('UPDATE readings SET created_at = ? WHERE id = 1').run('2026-11-06T10:00:00.000Z');
    const before = database.prepare('SELECT COUNT(*) total FROM readings').get().total;
    const history = await db.findRecentReadings('P-101');
    assert.equal(history.length, 10);
    assert.deepEqual(history.map((row) => row.id), [1, 12, 11, 10, 9, 8, 7, 6, 5, 4]);
    assert.equal(history[0].equipmentId, 'P-101');
    assert.equal(history[0].source, 'simulación');
    assert.equal(history[0].temperature, 40);
    assert.equal(new Date(history[0].createdAt).getUTCDate(), 6);
    assert.deepEqual(await db.findRecentReadings('A-003'), []);
    assert.equal(database.prepare('SELECT COUNT(*) total FROM readings').get().total, before);
    const ambient = load('src/network/ambientApi.ts', {
      axios: { create: () => ({ get: async () => ({ data: { current: { temperature_2m: 23.4, relative_humidity_2m: 55 } } }) }) },
    });
    const repository = load('src/data/plantRepository.ts', {
      '../network/ambientApi': ambient, './localDb': db,
    });
    await repository.simulateCycle(await db.findEquipment(''));
    assert.deepEqual(await db.findRecentReadings('A-003'), []);
    assert.equal((await db.findRecentReadings('M-204'))[0].source, 'simulación');
    await repository.syncReference();
    assert.equal((await db.findRecentReadings('A-003'))[0].source, 'API ambiental');
    assert.equal((await db.findRecentReadings('A-003'))[0].temperature, 23.4);
    await assert.rejects(db.saveEquipmentThreshold('P-101', Infinity));
    await assert.rejects(db.saveEquipmentThreshold('P-101', 0));
    await assert.rejects(db.saveEquipmentThreshold('inexistente', 10));
    database.close();
    db = load('src/data/localDb.ts', { 'expo-sqlite': sqlite });
    const persisted = (await db.findEquipment('P-101'))[0];
    assert.equal(persisted.maxTemp, 42.5);
    assert.equal(persisted.enabled, 0);
    assert.equal(persisted.name, "Bomba d'agua");
    assert.equal((await db.findRecentReadings('P-101')).length, 10);
    assert.equal((await db.findRecentReadings('A-003'))[0].source, 'API ambiental');
  } finally {
    database?.close();
    for (const suffix of ['', '-wal', '-shm']) if (fs.existsSync(filename + suffix)) fs.unlinkSync(filename + suffix);
    fs.rmdirSync(directory);
  }
});

test('activación: bloqueo inmediato por ID, fallo sin confirmación y reintento', async () => {
  let pending = deferred();
  let calls = 0;
  const h = await model({ saveEquipmentState: () => { calls++; return pending.promise; } });
  const vm = h.render();
  const first = vm.changeEnabled('P-101', false);
  await vm.changeEnabled('P-101', false);
  assert.equal(calls, 1);
  assert.equal(h.render().items[0].enabled, 1);
  assert.ok(h.render().savingEnabledIds.has('P-101'));
  pending.reject(new Error('Disco lleno'));
  await first;
  assert.equal(h.render().items[0].enabled, 1);
  assert.match(h.render().notice, /Error al guardar/);
  assert.equal(h.render().savingEnabledIds.size, 0);
  pending = deferred();
  const retry = h.render().changeEnabled('P-101', false);
  pending.resolve();
  await retry;
  assert.equal(calls, 2);
  assert.equal(h.render().items[0].enabled, 0);
  h.dispose();
});

test('umbral: cancelar/invalidar no escribe; falla, reintenta y confirma una sola vez', async () => {
  let pending = deferred(), calls = 0;
  const h = await model({ saveEquipmentThreshold: () => { calls++; return pending.promise; } });
  h.render().openThreshold(h.render().items[0]);
  h.render().closeThreshold();
  assert.equal(calls, 0);
  h.render().openThreshold(h.render().items[0]);
  await h.render().saveThreshold('32abc');
  assert.equal(calls, 0);
  assert.ok(h.render().thresholdError);
  const first = h.render().saveThreshold('32,5');
  await h.render().saveThreshold('20');
  assert.equal(calls, 1);
  assert.equal(h.render().items[0].maxTemp, 60);
  pending.reject(new Error('Disco lleno'));
  await first;
  assert.equal(h.render().items[0].maxTemp, 60);
  assert.ok(h.render().thresholdEquipment);
  assert.match(h.render().thresholdError, /reintentar/);
  pending = deferred();
  const retry = h.render().saveThreshold('32,5');
  await h.render().changeEnabled('P-101', false);
  pending.resolve();
  await retry;
  assert.equal(h.render().items[0].maxTemp, 32.5);
  assert.equal(h.render().items[0].enabled, 0);
  assert.equal(h.render().thresholdEquipment, null);
  assert.equal(h.render().thresholdSaving, false);
  h.dispose();
});

test('historial: carga, vacío, error, reabrir y respuestas fuera de orden', async () => {
  let requests = [];
  const h = await model({ findRecentReadings: () => {
    const pending = deferred(); requests.push(pending); return pending.promise;
  } });
  const a = h.render().openHistory(equipment('P-101'));
  assert.equal(h.render().history.loading, true);
  const b = h.render().openHistory(equipment('M-204'));
  requests[1].resolve([]); await b;
  requests[0].resolve([{ id: 1, equipmentId: 'P-101' }]); await a;
  assert.equal(h.render().history.equipment.id, 'M-204');
  assert.deepEqual(h.render().history.readings, []);
  const failed = h.render().openHistory(equipment('M-204'));
  requests[2].reject(new Error('No disponible')); await failed;
  assert.match(h.render().history.error, /No disponible/);
  const reopened = h.render().openHistory(equipment('M-204'));
  assert.equal(requests.length, 4);
  h.render().closeHistory();
  requests[3].resolve([]); await reopened;
  assert.equal(h.render().history.equipment, null);
  h.dispose();
});

test('filtro: ignora consultas antiguas y recarga si un guardado confirmó durante la lectura', async () => {
  let requests = [], manual = false;
  const h = await model({ findEquipment: async () => {
    if (!manual) return [equipment('P-101'), equipment('M-204')];
    const pending = deferred(); requests.push(pending); return pending.promise;
  } });
  manual = true;
  const first = h.render().search('P');
  const second = h.render().search('M');
  requests[1].resolve([equipment('M-204')]); await second;
  requests[0].resolve([equipment('P-101')]); await first;
  assert.equal(h.render().items[0].id, 'M-204');
  const stale = h.render().search('M');
  await h.render().changeEnabled('M-204', false);
  requests[2].resolve([equipment('M-204')]); await tick();
  requests[3].resolve([equipment('M-204', 0)]); await stale;
  assert.equal(h.render().items[0].enabled, 0);
  assert.equal(h.render().filter, 'M');
  h.dispose();
});

test('panel HTML: alarma desde igualdad solo activado y puente Actualizar conservado', () => {
  const module = load('src/components/OverviewWeb.tsx', {
    react: { createElement: (type, props, ...children) => ({ type, props, children }), useMemo: (fn) => fn() },
    'react-native': { View: 'View' }, 'react-native-webview': { WebView: 'WebView' },
  });
  let refresh = 0;
  for (const [temperature, enabled, hot] of [[60, 1, true], [61, 1, true], [59, 1, false], [60, 0, false], [61, 0, false]]) {
    const tree = module.OverviewWeb({ items: [{ ...equipment('P-101', enabled), temperature }], onRefresh: () => refresh++ });
    const webview = tree.children[0];
    const elements = [];
    let click;
    const document = {
      createElement: () => { const element = { style: {}, appendChild() {}, append() {} }; elements.push(element); return element; },
      getElementById: (id) => id === 'chart' ? { appendChild() {} } : { addEventListener: (_, fn) => { click = fn; } },
    };
    new Function('document', 'window', webview.props.source.html.match(/<script>([\s\S]*?)<\/script>/)[1])(
      document, { ReactNativeWebView: { postMessage: (data) => webview.props.onMessage({ nativeEvent: { data } }) } }
    );
    assert.equal(elements.find((element) => element.className.startsWith('fill')).className.includes('hot'), hot);
    click();
  }
  assert.equal(refresh, 5);
});
