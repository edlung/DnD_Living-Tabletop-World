import { t, type Text } from './text.ts';

/**
 * The DM's library of The Bells of Hollowmere (docs/adr/0058-campaign-content.md §3–5): handouts
 * kept until the DM gives them, and random tables the DM rolls for the road, the marsh and the
 * village's talk. A new campaign of the adventure starts with them in its DM's library.
 */
export interface KeptHandout {
  readonly title: Text;
  readonly text: Text;
}

export const HANDOUTS: readonly KeptHandout[] = [
  {
    title: t('A letter of hire', 'Письмо о найме'),
    text: t(
      'To whoever takes my wagon north. Deliver forty jars of lamp-oil and twelve sacks of salt to Reeve Hobb Fenwick at Hollowmere, and bring me back his mark and his news. He has not written in a month, and he always writes. Half your fee now, half on your return. — Agna Brisk, North Gate, Ravenford',
      'Тому, кто повезёт мою повозку на север. Доставьте сорок кувшинов лампадного масла и двенадцать мешков соли старосте Холлоумира; староста: Хобб Фенвик. Привезите мне его подпись и его новости. Он не писал уже месяц, а пишет он всегда. Половина платы сейчас, половина по возвращении. Подпись: Агна Бриск, Северные ворота, Равенфорд.',
    ),
  },
  {
    title: t('The legend of Saint Odran', 'Предание: святой Одран'),
    text: t(
      'When the waters rose, the knight Odran stood in the breach of the dyke with his shield and his bell, and rang it until the flood turned. The water took him, and the bell with him. We sank both beneath his chapel, that he might keep the marsh in death as in life. Let no hand ring his bell again, lest he answer.',
      'Когда поднялась вода, рыцарь Одран встал в проломе плотины со щитом и колоколом и звонил, пока потоп не отступил. Вода забрала его, а с ним и колокол. Мы погребли обоих под его часовней, чтобы и в смерти он стерёг топь, как при жизни. Пусть ничья рука больше не звонит в его колокол — иначе он ответит.',
    ),
  },
  {
    title: t('A page from a tarred ledger', 'Страница из просмолённой книги'),
    text: t(
      'Third of the month: from the Lantern, 20 silver. Two cargoes to the stair under the saint, by night, no lights. Fifth: one more — alive, old, deaf, kicks. The Lantern says he is wanted for the ringing. Seventh: 20 silver. K.',
      'Третье число: от Фонаря — 20 серебра. Два груза к лестнице под святым, ночью, без огней. Пятое: ещё один — живой, старый, глухой, лягается. Фонарь говорит, он нужен для звона. Седьмое: 20 серебра. К.',
    ),
  },
  {
    title: t('A warning from Sister Ilse', 'Предупреждение сестры Ильзе'),
    text: t(
      'If you go to the chapel, go by day and carry the holy water I gave you. The dead there were our neighbours; do not hate them. And if you hear a bell beneath your feet, do not wait for the second stroke.',
      'Если пойдёте к часовне — идите днём и возьмите святую воду, что я вам дала. Мертвецы там были нашими соседями, не держите на них зла. И если услышите колокол под ногами, не ждите второго удара.',
    ),
  },
];

export interface Table {
  readonly name: Text;
  readonly die: 4 | 6 | 8 | 10 | 12 | 20 | 100;
  readonly results: readonly { readonly from: number; readonly to: number; readonly text: Text }[];
}

export const TABLES: readonly Table[] = [
  {
    name: t('The Mill Road', 'Мельничная дорога'),
    die: 6,
    results: [
      {
        from: 1,
        to: 1,
        text: t(
          'Fresh goblin tracks cross the road toward the ford.',
          'Свежие гоблинские следы пересекают дорогу в сторону брода.',
        ),
      },
      {
        from: 2,
        to: 2,
        text: t(
          'A pedlar with a lame mule sells bootlaces and rumours of the bell.',
          'Торговец с хромым мулом продаёт шнурки и слухи о колоколе.',
        ),
      },
      {
        from: 3,
        to: 3,
        text: t(
          'Rain turns the ruts to mud: the wagon slows to a crawl for an hour.',
          'Дождь превращает колею в грязь: на час повозка едва ползёт.',
        ),
      },
      {
        from: 4,
        to: 4,
        text: t(
          'Two wolves shadow the wagon from the willows; they flee from a show of fire.',
          'Два волка крадутся за повозкой среди ив; от огня они убегают.',
        ),
      },
      {
        from: 5,
        to: 6,
        text: t(
          'The road is quiet; only the reeds whisper.',
          'На дороге тихо; шепчет лишь тростник.',
        ),
      },
    ],
  },
  {
    name: t('Fog on the marsh', 'Туман над топью'),
    die: 8,
    results: [
      {
        from: 1,
        to: 1,
        text: t(
          'A pale light drifts ahead, always just out of reach.',
          'Впереди плывёт бледный огонёк, всегда чуть дальше, чем дотянуться.',
        ),
      },
      {
        from: 2,
        to: 2,
        text: t(
          'A giant frog lunges from a pool at the last in line.',
          'Гигантская лягушка бросается из омута на того, кто идёт последним.',
        ),
      },
      {
        from: 3,
        to: 3,
        text: t(
          'A cold whisper calls one of the party by name from the reeds.',
          'Холодный шёпот из тростника зовёт одного из отряда по имени.',
        ),
      },
      {
        from: 4,
        to: 4,
        text: t(
          'A sunken boat holds a waterlogged purse of 2d6 silver pieces.',
          'В затонувшей лодке лежит размокший кошель: 2к6 серебряных монет.',
        ),
      },
      {
        from: 5,
        to: 5,
        text: t(
          'A drowned villager stands up out of the water, slowly.',
          'Из воды медленно поднимается утопленник.',
        ),
      },
      {
        from: 6,
        to: 6,
        text: t(
          'Far below the water, a bell tolls once, and every light goes out.',
          'Глубоко под водой колокол ударяет один раз, и гаснут все огни.',
        ),
      },
      {
        from: 7,
        to: 8,
        text: t('Only fog, and the smell of rot.', 'Только туман и запах гнили.'),
      },
    ],
  },
  {
    name: t('Talk in Hollowmere', 'Разговоры в Холлоумире'),
    die: 6,
    results: [
      {
        from: 1,
        to: 1,
        text: t(
          '“The reeve has more silver than an eel-fisher ought to.”',
          '«У старосты серебра больше, чем положено ловцу угрей».',
        ),
      },
      {
        from: 2,
        to: 2,
        text: t(
          '“Kerra’s boats go out at night with no lanterns. Not my business.”',
          '«Керра гоняет лодки ночью без фонарей. Не моё дело».',
        ),
      },
      {
        from: 3,
        to: 3,
        text: t(
          '“The bell rang before, the year of the flood. Ask Sister Ilse.”',
          '«Колокол уже звонил так — в год наводнения. Спросите сестру Ильзе».',
        ),
      },
      {
        from: 4,
        to: 4,
        text: t(
          '“Old Matthis took his cudgel. He meant to catch whoever it was.”',
          '«Старый Маттис взял дубинку. Хотел поймать того, кто звонит».',
        ),
      },
      {
        from: 5,
        to: 5,
        text: t(
          '“A man in a grey hood bought all the lamp-oil last spring. Paid in old coin.”',
          '«Человек в сером капюшоне весной скупил всё лампадное масло. Платил старой монетой».',
        ),
      },
      {
        from: 6,
        to: 6,
        text: t(
          '“My cousin saw the dead walking on the chapel islet. Drowned folk, every one.”',
          '«Мой кузен видел, как по островку у часовни ходят мертвецы. Все утопленники».',
        ),
      },
    ],
  },
];
