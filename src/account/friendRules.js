// Reglas puras de amigos: validar el nombre y pasar los errores del servidor a texto.

const NAME = /^[A-Za-z0-9_]{3,16}$/;

/** Nombre limpio (sin @ ni espacios) o null si no puede ser un nombre de usuario. */
export function cleanFriendName(raw) {
  const name = String(raw ?? '').trim().replace(/^@/, '');
  return NAME.test(name) ? name : null;
}

const MESSAGES = {
  invalid_username: 'Escribe un nombre de usuario válido (3 a 16 letras, números o _).',
  user_not_found: 'No existe ningún jugador con ese nombre.',
  cannot_friend_self: 'Ese eres tú.',
  already_friends: 'Ya sois amigos.',
  request_pending: 'Ya le enviaste una petición. Espera a que la acepte.',
  username_required: 'Ponte primero un nombre de usuario.',
  not_found: 'Esa petición ya no existe.',
};

export const friendMessage = (code) => MESSAGES[code] ?? 'No se ha podido completar. Prueba otra vez.';

/** Texto tras añadir: 'pending' (enviada) o 'accepted' (la otra persona ya te había añadido). */
export const addedMessage = (status, name) =>
  status === 'accepted' ? `Ya eres amigo de ${name}.` : `Petición enviada a ${name}.`;
