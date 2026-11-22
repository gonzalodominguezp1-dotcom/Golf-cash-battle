---
author: la-chaqueta-bionica
branch: huevo-mio
status: in-progress
---
# Skin «El Huevo Mío» por código RDR

## Intent
Skin de bola de carne con arrugas y pelos negros rizados, que solo se consigue canjeando el código `RDR`.

## Scope
- `src/progress/codes.js` (catálogo de códigos), `Progress.redeemCode`, requisito `unlock: { code: true }`.
- Shader `patterns/huevo_mio.js` + textura 2D `flesh` (calidad baja y miniaturas).
- Campo «Canjear» en la pantalla Skins. Fuera: validación de códigos en servidor.

## Checklist
- [x] Código RDR (sin mayúsculas/espacios) da la skin; inválidos no — `tests/codes.test.js`
- [x] Sin canjear sigue bloqueada aunque haya nivel de sobra — idem
- [x] El canje se guarda en la cuenta (inventario) y sobrevive a recargar — idem
- [x] `pnpm test` 768 pass, `pnpm build` ok
- [x] Canje también en el visor 3D de la skin (`skinInspect.js`) — `tests/screen-skin-inspect.test.js`
- [x] Rediseño: piel suave sin bordes, surco superior, venas marcadas, ~50 pelos visibles
- [ ] Aspecto del shader en alta/media/baja (lo comprueba la persona, en navegador)

## Evidence
`pnpm test`: 768 pass / 0 fail. `pnpm build`: ok. El GLSL no se ha compilado en GPU.

## Next
Ver la bola en Skins → inspector y ajustar `bump`, `wfreq`, `HE_DENS`.
