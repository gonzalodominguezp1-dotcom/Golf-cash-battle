// Reglas puras de los grupos: textos de error y cuándo abrir el torneo del grupo.

const MESSAGES = {
  not_friends: 'Solo puedes invitar a tus amigos.',
  user_not_found: 'No existe ningún jugador con ese nombre.',
  cannot_invite_self: 'Ese eres tú.',
  already_in_party: 'Ya está en tu grupo.',
  party_full: 'El grupo está completo.',
  invite_not_found: 'Esa invitación ya no existe.',
  no_party: 'Ya no estás en ese grupo.',
  not_leader: 'La mesa la elige el líder del grupo.',
  party_paid_only: 'En grupo solo se juegan torneos: la práctica es contra rivales simulados.',
  no_tier: 'El líder tiene que elegir antes una mesa.',
};

export const partyMessage = (code) => MESSAGES[code] ?? 'No se ha podido completar. Prueba otra vez.';

/** Por qué no se pudo buscar partida ('busy:Ana', 'blocked:Ana', 'funds:Ana') en texto. */
export function partyErrorText(lastError) {
  if (!lastError) return '';
  const i = lastError.indexOf(':');
  const kind = i < 0 ? lastError : lastError.slice(0, i);
  const name = i < 0 ? 'Alguien' : lastError.slice(i + 1);
  if (kind === 'busy') return `${name} tiene un torneo a medias. Cuando lo acabe, volved a darle a «Listo».`;
  if (kind === 'blocked') return `${name} aún no puede jugar mesas con entrada (cuenta sin verificar).`;
  if (kind === 'funds') return `${name} no tiene saldo suficiente para esta mesa.`;
  return 'No se ha podido buscar partida. Volved a darle a «Listo».';
}

/** Torneo del grupo que este dispositivo todavía no ha abierto (o null). */
export function newPartyMatch(party, seen) {
  const id = party?.tournament_id ?? null;
  return id && id !== seen ? id : null;
}

/** Texto del botón principal del grupo para mí. */
export function readyLabel(party) {
  const me = party.members.find((m) => m.me);
  if (!party.tier_id) return party.leader ? 'Elige una mesa abajo' : 'El líder elige la mesa';
  if (me?.ready) return 'Cancelar «Listo»';
  return party.leader ? 'Buscar partida' : 'Estoy listo';
}
