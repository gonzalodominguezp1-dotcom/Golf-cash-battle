// Panel de medición (solo con ?perf=1): «Copiar informe» y «Reiniciar». CSS inline mínimo, sin tocar estilos globales.
// El informe no se envía a ningún servidor: solo va al portapapeles (o a un cuadro de texto para copiarlo a mano).

const BTN = 'font:600 12px system-ui,sans-serif;padding:8px 10px;border-radius:8px;border:1px solid #fff6;background:#000c;color:#fff;touch-action:manipulation';

export function mountPerfPanel(probe, doc = document) {
  if (!probe || doc.getElementById('gcb-perf-panel')) return null;
  const box = doc.createElement('div');
  box.id = 'gcb-perf-panel';
  box.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:2147483647;display:flex;gap:6px;align-items:center;opacity:.85';
  const copy = doc.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copiar informe';
  copy.style.cssText = BTN;
  const reset = doc.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Reiniciar';
  reset.style.cssText = BTN;
  const msg = doc.createElement('span');
  msg.style.cssText = 'font:12px system-ui,sans-serif;color:#fff;background:#000c;padding:4px 6px;border-radius:6px;display:none';
  const flash = (t) => {
    msg.textContent = t;
    msg.style.display = 'inline';
    setTimeout(() => { msg.style.display = 'none'; }, 2500);
  };

  copy.addEventListener('click', async () => {
    probe.persist();
    const text = JSON.stringify(probe.report(), null, 1);
    try {
      await navigator.clipboard.writeText(text);
      return flash('Informe copiado');
    } catch { /* sin permiso: se prueba el método antiguo */ }
    const ta = doc.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;inset:10% 5%;width:90%;height:70%;z-index:2147483647;font:11px monospace';
    doc.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = doc.execCommand('copy'); } catch { /* nada */ }
    if (ok) {
      ta.remove();
      flash('Informe copiado');
    } else {
      ta.addEventListener('blur', () => ta.remove());
      flash('Copia el texto a mano');
    }
  });
  reset.addEventListener('click', () => {
    probe.reset();
    flash('Reiniciado');
  });

  box.append(copy, reset, msg);
  doc.body.append(box);
  return box;
}
