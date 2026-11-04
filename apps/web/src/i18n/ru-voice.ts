import { registerRussian } from '@ltw/ui';

/**
 * Russian for the table's voice (docs/adr/0060-voice.md, Stage 695): joining and leaving, the
 * microphone and holding to talk, a shared room, who is in the voice, and the DM's controls.
 */
registerRussian({
  Voice: 'Голос',
  'Join the voice': 'Войти в голос',
  'Joining the voice…': 'Входим в голос…',
  'Leave the voice': 'Выйти из голоса',
  'The voice opens while the session plays online.': 'Голос открыт, пока сессия идёт онлайн.',
  'The DM took you out of the voice.': 'Мастер убрал вас из голоса.',
  'You can join again the next time the table plays online.':
    'Войти снова можно, когда стол в следующий раз будет играть онлайн.',
  'Microphone on': 'Микрофон включён',
  'Microphone off': 'Микрофон выключен',
  'Hold to talk': 'Удерживайте, чтобы говорить',
  'The browser did not allow the microphone: you listen only. Allow it in the site’s settings in the browser, then join again.':
    'Браузер не разрешил микрофон: вы только слушаете. Разрешите его в настройках сайта в браузере и войдите снова.',
  'The DM muted you.': 'Мастер выключил вам микрофон.',
  'Voices go straight between the screens. If someone cannot be heard, they may be on another network: the DM can set up a relay.':
    'Голоса идут напрямую между экранами. Если кого-то не слышно, возможно, он в другой сети: мастер может включить ретранслятор.',
  Microphone: 'Микрофон',
  'As the device chooses': 'Как выберет устройство',
  'Microphone {number}': 'Микрофон {number}',
  'This screen shares a room with another: play no voices here':
    'Этот экран в одной комнате с другим: не воспроизводить здесь голоса',
  'In the voice': 'В голосе',
  'A player': 'Игрок',
  'muted by the DM': 'микрофон выключен мастером',
  talking: 'говорит',
  'connecting…': 'подключаемся…',
  'Let talk': 'Разрешить говорить',
  'Let talk: {name}': 'Разрешить говорить: {name}',
  'Mute for everyone': 'Выключить для всех',
  'Mute for everyone: {name}': 'Выключить для всех: {name}',
  'Remove from the voice': 'Убрать из голоса',
  'Remove from the voice: {name}': 'Убрать из голоса: {name}',
  'Take {name} out of the voice? They can join again only the next time the table plays online.':
    'Убрать из голоса: {name}? Вернуться можно будет, только когда стол в следующий раз будет играть онлайн.',
  'Yes, remove': 'Да, убрать',
  'Yes, remove: {name}': 'Да, убрать: {name}',
  'Keep in the voice': 'Оставить в голосе',
  'Keep in the voice: {name}': 'Оставить в голосе: {name}',
});
