// Полноэкранные экраны: главное меню, новая игра, магазин, помощь, итоги партии.
import { ERA_NAMES, NATIONS, NATION_IDS, UNITS } from '../core/data';
import { DIFF, MAPS, SPEED_INFO, playerCities, score } from '../core/rules';
import type { Settings } from '../core/types';
import type { App } from './app';
import { svg } from './icons';
import { esc } from './panels';
import { THEMES } from './render';

export function mainMenu(app: App, save: { turn: number; nation: string } | null): string {
  return `<div class="scr"><div class="menu">
    <div class="logo"><h1>ЭПОХИ</h1><div class="tag">Летопись империй</div><div class="rule"></div></div>
    <div class="menu-btns">
      ${save ? `<button class="mbtn primary" data-act="continue">${svg('play')}<div><b>Продолжить</b><span>${esc(NATIONS[save.nation]?.name || '')} · ход ${save.turn}</span></div></button>` : ''}
      <button class="mbtn ${save ? '' : 'primary'}" data-act="setup">${svg('flag')}<div><b>Новая игра</b><span>Выберите державу и карту</span></div></button>
      <button class="mbtn" data-act="daily">${svg('calendar')}<div><b>Испытание дня</b><span>Одна карта для всех · 60 ходов на рекорд</span></div></button>
      <button class="mbtn" data-act="store">${svg('cart')}<div><b>Лавка</b><span>Наборы наций и облик карты</span></div></button>
      <button class="mbtn" data-act="help">${svg('book')}<div><b>Как играть</b><span>Жесты, клавиши, цели</span></div></button>
    </div>
    <div class="foot">Прототип 0.1 · пошаговая стратегия для телефона и ПК</div>
  </div></div>`;
}

const seg = (name: string, cur: string, opts: [string, string][]) =>
  `<div class="seg">${opts.map(([v, l]) => `<button class="${cur === v ? 'on' : ''}" data-act="set" data-k="${name}" data-v="${v}">${l}</button>`).join('')}</div>`;

export function setupScreen(app: App, s: Settings): string {
  const nations = NATION_IDS.map((id) => {
    const n = NATIONS[id];
    const uu = UNITS[n.uu.id];
    return `<button class="nat ${s.nation === id ? 'on' : ''}" data-act="set" data-k="nation" data-v="${id}">
      ${n.pack === 'conquerors' ? '<span class="pack">Набор</span>' : ''}
      <div class="nh"><span class="sw" style="--c:${n.color}"></span><b>${esc(n.name)}</b></div>
      <div class="ab">${esc(n.ability)}</div><div class="ds">${esc(n.desc)}</div>
      <div class="uu">${svg(uu.icon)} ${esc(uu.name)} — вместо «${esc(UNITS[n.uu.replaces].name)}»</div>
    </button>`;
  }).join('');
  const max = MAPS[s.size].max - 1;
  return `<div class="scr solid"><div class="page">
    <div class="page-head"><button class="back" data-act="toMenu" aria-label="Назад">${svg('boot')}</button><h2>Новая игра</h2></div>
    <div class="opt"><label>Держава</label><div class="nations">${nations}</div>
      <div class="hint">Наборы «Завоеватели» в релизе продаются отдельно — в прототипе открыты все.</div></div>
    <div class="opts">
      <div class="opt"><label>Карта</label>${seg('size', s.size, [['small', 'Малая'], ['standard', 'Средняя'], ['large', 'Большая']])}<div class="hint">До ${MAPS[s.size].max} держав</div></div>
      <div class="opt"><label>Соперники</label><div class="stepper"><button data-act="opp" data-d="-1" aria-label="Меньше">${svg('minus')}</button><b>${Math.min(s.players - 1, max)}</b><button data-act="opp" data-d="1" aria-label="Больше">${svg('plus')}</button></div></div>
      <div class="opt"><label>Сложность</label>${seg('difficulty', s.difficulty, (Object.keys(DIFF) as (keyof typeof DIFF)[]).map((k) => [k, DIFF[k].name]))}<div class="hint">${s.difficulty === 'easy' ? 'ИИ получает −25% к доходам' : s.difficulty === 'normal' ? 'Равные условия' : s.difficulty === 'hard' ? 'ИИ: +25% к доходам и лишний воин' : 'ИИ: +50% к доходам, лишние воины и поселенцы'}</div></div>
      <div class="opt"><label>Темп партии</label>${seg('speed', s.speed, (Object.keys(SPEED_INFO) as (keyof typeof SPEED_INFO)[]).map((k) => [k, SPEED_INFO[k].name]))}<div class="hint">${SPEED_INFO[s.speed].limit} ходов · ${SPEED_INFO[s.speed].hint}</div></div>
      <div class="opt"><label for="seed">Сид карты</label><input class="txt" id="seed" inputmode="numeric" value="${s.seed}" data-change="seed"><div class="hint">Одинаковый сид — одинаковая карта. Можно делиться с друзьями.</div></div>
    </div>
    <div class="start-row"><button class="btn primary" data-act="start">${svg('play')}Начать партию</button></div>
  </div></div>`;
}

export function storeScreen(app: App): string {
  const themes = Object.values(THEMES).map((t) => `<button class="theme-sw ${app.prefs.theme === t.id ? 'on' : ''}" data-act="setTheme" data-id="${t.id}"><span class="pv" style="background:linear-gradient(90deg,${t.t.ocean} 0 22%,${t.t.grass} 22% 48%,${t.t.plains} 48% 70%,${t.t.desert} 70% 86%,${t.t.mountain} 86%)"></span>${t.name}</button>`).join('');
  return `<div class="scr solid"><div class="page">
    <div class="page-head"><button class="back" data-act="toMenu" aria-label="Назад">${svg('boot')}</button><h2>Лавка</h2></div>
    <div class="notice">Это макет витрины для прототипа: покупки отключены, всё уже открыто. Цены — ориентир из плана монетизации (docs/03-monetization.md).</div>
    <div class="shop">
      <div class="offer hero"><div class="k">Разовая покупка</div><h3>Полное издание</h3>
        <ul><li>Все карты и размеры до 8 держав</li><li>Темп «Эпический» и редактор сценариев</li><li>Асинхронный мультиплеер без ограничений</li><li>Кросс-сохранения: начните на телефоне, продолжите на ПК</li></ul>
        <div class="price"><b>749 ₽</b><span>≈ $7,99 · пробная версия бесплатна до 100-го хода</span></div></div>
      <div class="offer"><div class="k">Набор наций</div><h3>Завоеватели</h3>
        <ul><li>Скандинавия, Монголия, Ацтеки, Греция</li><li>4 уникальных юнита и способности</li><li>Сценарий «Степная буря»</li></ul>
        <div class="price"><b>299 ₽</b><span>≈ $2,99</span></div></div>
      <div class="offer"><div class="k">Сезон</div><h3>Пропуск Летописи</h3>
        <ul><li>Еженедельные сценарии и испытания</li><li>Только косметика: гербы, рамки, скины юнитов</li><li>Бесплатная ветка наград для всех</li></ul>
        <div class="price"><b>399 ₽</b><span>≈ $3,99 за сезон (8 недель)</span></div></div>
      <div class="offer"><div class="k">Облик карты</div><h3>Темы оформления</h3>
        <div class="themes">${themes}</div>
        <div class="price"><b>149 ₽</b><span>за тему · «Классика» бесплатно</span></div></div>
    </div>
    <div class="hint">Принцип: никакой продажи силы. Покупки не дают преимущества в бою, науке или экономике — только контент, удобство и красоту.</div>
  </div></div>`;
}

export function helpScreen(fromGame: boolean): string {
  return `<div class="scr solid"><div class="page help">
    <div class="page-head"><button class="back" data-act="${fromGame ? 'closeScreen' : 'toMenu'}" aria-label="Назад">${svg('boot')}</button><h2>Как играть</h2></div>
    <h3>Цель</h3>
    <p>Проведите свою державу через шесть эпох — от Древности до Нового времени. Побеждает тот, кто первым:</p>
    <ul><li><b>Доминирование</b> — захватит все изначальные столицы соперников;</li><li><b>Наука</b> — изучит Ракетостроение и построит «Проект «Горизонт»»;</li><li><b>Летопись</b> — наберёт больше всех очков к последнему ходу.</li></ul>
    <h3>Управление на телефоне</h3>
    <ul><li>Коснитесь отряда, чтобы выбрать. Коснитесь клетки — появится путь; коснитесь её ещё раз или нажмите «Идти».</li>
      <li>Долгое касание клетки — сразу идти или атаковать.</li><li>Два пальца — масштаб, один палец — сдвиг карты.</li>
      <li>Большая кнопка внизу справа всегда подскажет следующий шаг: отряд, город, исследование или конец хода.</li></ul>
    <h3>Управление на ПК</h3>
    <ul><li>Клик — выбор и движение, правая кнопка — сразу идти или атаковать, колесо — масштаб, перетаскивание — сдвиг.</li>
      <li><kbd>Enter</kbd> следующий шаг · <kbd>Shift</kbd>+<kbd>Enter</kbd> завершить ход · <kbd>Пробел</kbd> пропустить отряд · <kbd>F</kbd> укрепить · <kbd>B</kbd> основать город · <kbd>S</kbd> спать · <kbd>N</kbd> следующий отряд · <kbd>T</kbd> технологии · <kbd>D</kbd> дипломатия · <kbd>C</kbd> к столице · <kbd>+</kbd>/<kbd>−</kbd> масштаб · стрелки — сдвиг · <kbd>Esc</kbd> отмена.</li></ul>
    <h3>Что важно знать</h3>
    <ul><li><b>Освоение земель.</b> Рабочих нет: клетки, которые обрабатывают жители, сами со временем превращаются в фермы, шахты и лесопилки.</li>
      <li><b>Один отряд на клетке.</b> Никаких «стеков смерти»: на клетке — один военный отряд и один гражданский. Окружайте врага: каждый союзник рядом с целью даёт +10% к атаке.</li>
      <li><b>Прогноз боя.</b> Перед атакой видно, сколько урона получит каждая сторона и почему.</li>
      <li><b>Хартии эпох.</b> С каждой новой эпохой выбирайте одну из трёх хартий — постоянный бонус державы.</li>
      <li><b>Летопись.</b> Время от времени происходят события с выбором — решайте, как поступить.</li>
      <li><b>Города защищаются сами.</b> Город обстреливает врагов рядом, а с Каменной кладкой и стенами — на две клетки. Для штурма берите осадные орудия.</li></ul>
  </div></div>`;
}

export function gameOverScreen(app: App): string {
  const g = app.g!;
  const me = g.players[app.v.human];
  const w = g.winner!;
  const won = w.pid === me.id;
  const how = { domination: 'Доминирование', science: 'Научная победа', score: 'Победа по очкам' }[w.type];
  const title = g.settings.daily ? 'Испытание завершено' : won ? 'Победа!' : 'Поражение';
  const desc = g.settings.daily
    ? `Ваш счёт: ${score(g, me.id)}. В релизе здесь будет мировая таблица рекордов дня.`
    : won ? `${how}. Ваша держава вошла в историю.` : w.pid >= 0 ? `${g.players[w.pid].name}: ${how.toLowerCase()}.` : 'Ваша держава пала.';
  const rows = g.players.map((p) => ({ p, s: score(g, p.id) })).sort((a, b) => b.s - a.s).map(({ p, s }) =>
    `<div class="sb-row ${p.id === me.id ? 'me' : ''}"><span class="sw" style="--c:${p.color}"></span><span class="n">${esc(p.name)}${p.alive ? '' : ' ✝'}</span><span class="hint">${playerCities(g, p.id).length} гор. · ${p.techs.length} техн. · ${ERA_NAMES[p.era]}</span><b>${s}</b></div>`).join('');
  return `<div class="scr"><div class="result ${won || g.settings.daily ? '' : 'lose'}">
    <div class="eyebrow" style="color:var(--brass);letter-spacing:.16em;text-transform:uppercase;font-size:12px">Ход ${g.turn} · ${esc(me.name)}</div>
    <h1>${title}</h1><p>${esc(desc)}</p>
    <div class="scoreboard">${rows}</div>
    <div class="hint">Побед в бою: ${me.kills} · потерь: ${me.losses} · чудес: ${Object.values(g.wonders).filter((cid) => g.cities.find((c) => c.id === cid)?.owner === me.id).length}</div>
    <div class="row-btns"><button class="btn" data-act="viewMap">${svg('globe')}Осмотреть мир</button><button class="btn" data-act="toMenu">В главное меню</button><button class="btn primary" data-act="setup">${svg('play')}Новая партия</button></div>
  </div></div>`;
}
