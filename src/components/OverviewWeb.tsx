import React, { useMemo } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { Equipment } from '../domain/types';

function createHtml(items: Equipment[]): string {
  const input = items.map(({ id, temperature, maxTemp, enabled }) => ({ id, temperature, maxTemp, enabled }));
  return `<!DOCTYPE html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
  <style>
  * { box-sizing:border-box; } body { margin:0; font-family:system-ui,-apple-system,sans-serif; background:#15213B; color:#eaf3ff; }
  main { padding:15px 16px; } h3 { margin:0 0 4px; font-size:14px; letter-spacing:.04em; }
  .sub { color:#9eafca; font-size:11px; margin-bottom:14px; }
  .line { display:flex; align-items:center; gap:9px; margin:8px 0; }
  .code { width:48px; flex:none; font-size:11px; color:#bcd0ef; }
  .rail { height:9px; background:#344461; border-radius:20px; flex:1; overflow:hidden; }
  .fill { height:100%; border-radius:20px; background:#68cbd2; }
  .hot { background:#f5aa75; } .value { width:42px; text-align:right; font-size:11px; }
  .footer { display:flex; justify-content:space-between; align-items:center; margin-top:12px; }
  .footnote { font-size:10px; color:#9eafca; }
  button { border:1px solid #5d8fca; border-radius:7px; background:#214873; color:#f6fbff; padding:6px 12px; font-size:12px; }
  </style></head><body><main><h3>RESUMEN DE TEMPERATURAS</h3><div class="sub">Panel HTML integrado · WebView</div>
  <div id="chart"></div><div class="footer"><span class="footnote">Escala respecto del límite guardado</span><button id="refresh">Actualizar</button></div>
  </main><script>
  const rows = ${JSON.stringify(input)};
  const target = document.getElementById('chart');
  for (const row of rows) {
    const line = document.createElement('div'); line.className='line';
    const code=document.createElement('span');code.className='code';code.textContent=row.id;
    const rail=document.createElement('div');rail.className='rail';
    const fill=document.createElement('div');fill.className='fill'+(row.enabled===1 && row.temperature>=row.maxTemp?' hot':'');
    fill.style.width=Math.max(0,Math.min(100,(row.temperature/Math.max(1,row.maxTemp))*100))+'%';
    rail.appendChild(fill);
    const value=document.createElement('span');value.className='value';value.textContent=row.temperature.toFixed(1)+'°';
    line.append(code,rail,value);target.appendChild(line);
  }
  document.getElementById('refresh').addEventListener('click',()=>{
    window.ReactNativeWebView.postMessage('refresh');
  });
  </script></body></html>`;
}

export function OverviewWeb({ items, onRefresh }: { items: Equipment[]; onRefresh: () => void }) {
  const html = useMemo(() => createHtml(items), [items]);
  return (
    <View style={{ height: 218, borderRadius: 15, overflow: 'hidden', backgroundColor: '#15213B' }}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        scrollEnabled={false}
        javaScriptEnabled
        onMessage={(event) => {
          if (event.nativeEvent.data === 'refresh') onRefresh();
        }}
        style={{ backgroundColor: '#15213B' }}
      />
    </View>
  );
}
