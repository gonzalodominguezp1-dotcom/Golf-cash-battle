// Editor de avatar de Cuenta (T034): elegir icono o subir imagen propia (máx. 2,5 MB); se guarda en este dispositivo.
// Movido de main.js (avatarEditor). Su overlay y sus listeners cuelgan del scope: al liberarlo desaparece todo.
import { AVATAR_ICONS, checkAvatarFile, imageToAvatar } from '../progress/avatar.js';
import { avatarIcon } from '../ui/icons.js';
import { avatarHtml, esc } from './shared.js';
import { t } from './texts/index.js';
import './texts/account.js';

export function openAvatarEditor(ctx, { scope, frame, initial, done }) {
  const { avatar } = ctx;
  const toAvatar = ctx.imageToAvatar ?? imageToAvatar; // ctx.imageToAvatar: solo para pruebas (en Node no hay canvas)
  const doc = scope.doc;
  const sc = scope.child();
  const icon = (n, o = {}) => ctx.icon(n, o);
  const overlay = doc.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
      <div class="card avatar-editor">
        <h2>${esc(t('account.avTitle'))}</h2>
        <div class="ae-preview"></div>
        <div class="ae-icons">${AVATAR_ICONS.map((i) => `<button type="button" data-icon="${esc(i.id)}" title="${esc(i.name)}" aria-label="${esc(i.name)}">${avatarIcon(i.id)}</button>`).join('')}</div>
        <div class="row">
          <button type="button" class="secondary ae-upload">${icon('upload')}${esc(t('account.avUpload'))}</button>
          <button type="button" class="secondary ae-clear">${icon('trash')}${esc(t('account.avClear'))}</button>
        </div>
        <input type="file" class="ae-file" accept="image/png,image/jpeg,image/webp" hidden>
        <p class="ae-msg legal" role="status"></p>
        <button type="button" class="primary ae-done">${icon('check')}${esc(t('account.avDone'))}</button>
      </div>`;
  const msg = overlay.querySelector('.ae-msg');
  msg.textContent = t('account.avLegal');
  const paint = () => {
    const av = avatar.get();
    overlay.querySelector('.ae-preview').innerHTML = avatarHtml({ size: 'lg', frame, av, initial });
    overlay.querySelectorAll('[data-icon]').forEach((b) => b.classList.toggle('on', b.dataset.icon === av.icon));
  };
  let closed = false;
  const close = () => { if (closed) return; closed = true; overlay.remove(); sc.dispose(); };
  scope.sub(close); // al salir de la pantalla con el editor abierto, se retira
  overlay.querySelectorAll('[data-icon]').forEach((b) => sc.on(b, 'click', () => { avatar.setIcon(b.dataset.icon); paint(); }));
  sc.on(overlay.querySelector('.ae-clear'), 'click', () => { avatar.clear(); paint(); });
  const file = overlay.querySelector('.ae-file');
  sc.on(overlay.querySelector('.ae-upload'), 'click', () => file.click());
  sc.on(file, 'change', async () => {
    const f = file.files[0];
    file.value = '';
    if (!f) return;
    const bad = checkAvatarFile(f);
    if (bad) { msg.textContent = bad === 'size' ? t('account.avSize') : t('account.avType'); msg.classList.add('err'); return; }
    try {
      const img = await toAvatar(f);
      if (closed) return;
      avatar.setImage(img);
      msg.classList.remove('err');
      paint();
    } catch {
      if (closed) return;
      msg.textContent = t('account.avRead');
      msg.classList.add('err');
    }
  });
  sc.on(overlay.querySelector('.ae-done'), 'click', () => { close(); done(); });
  paint();
  doc.body.append(overlay);
  return { close };
}
