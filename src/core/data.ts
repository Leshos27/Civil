// Игровые данные. Всё правила-как-данные: в продакшене эти таблицы уезжают в JSON
// и становятся основой моддинга (Steam Workshop) и live-балансировки без обновления клиента.

export const ERA_NAMES = ['Древность', 'Античность', 'Средневековье', 'Возрождение', 'Индустриальная эра', 'Новое время'];
export const ERA_COST = [25, 90, 200, 360, 560, 820];

// ───────────── Рельеф ─────────────
export interface TerrainDef { name: string; f: number; p: number; g: number; move: number; def: number; water?: boolean; pass: boolean }
export const TERRAIN: Record<string, TerrainDef> = {
  ocean: { name: 'Океан', f: 1, p: 0, g: 1, move: 99, def: 0, water: true, pass: false },
  coast: { name: 'Мелководье', f: 1, p: 0, g: 1, move: 99, def: 0, water: true, pass: false },
  grass: { name: 'Луга', f: 2, p: 0, g: 0, move: 1, def: 0, pass: true },
  plains: { name: 'Равнина', f: 1, p: 1, g: 0, move: 1, def: 0, pass: true },
  desert: { name: 'Пустыня', f: 0, p: 0, g: 0, move: 1, def: 0, pass: true },
  tundra: { name: 'Тундра', f: 1, p: 0, g: 0, move: 1, def: 0, pass: true },
  snow: { name: 'Снега', f: 0, p: 0, g: 0, move: 2, def: 0, pass: true },
  hills: { name: 'Холмы', f: 1, p: 2, g: 0, move: 2, def: 25, pass: true },
  mountain: { name: 'Горы', f: 0, p: 0, g: 0, move: 99, def: 0, pass: false },
};

export const FEATURES: Record<string, { name: string; f: number; p: number; g: number; move: number; def: number }> = {
  forest: { name: 'Лес', f: 1, p: 2, g: 0, move: 2, def: 25 },
  jungle: { name: 'Джунгли', f: 1, p: 1, g: 0, move: 2, def: 15 },
};

export interface ResourceDef { name: string; f: number; p: number; g: number; icon: string; color: string }
export const RESOURCES: Record<string, ResourceDef> = {
  wheat: { name: 'Пшеница', f: 1, p: 0, g: 0, icon: 'wheat', color: '#d8b13a' },
  cattle: { name: 'Скот', f: 1, p: 0, g: 0, icon: 'cattle', color: '#a8714a' },
  horses: { name: 'Лошади', f: 0, p: 1, g: 0, icon: 'horseshoe', color: '#8b5e3c' },
  fish: { name: 'Рыба', f: 2, p: 0, g: 0, icon: 'fish', color: '#3f8fc9' },
  deer: { name: 'Олени', f: 1, p: 0, g: 0, icon: 'deer', color: '#9a6a3a' },
  stone: { name: 'Камень', f: 0, p: 1, g: 0, icon: 'stone', color: '#7d8590' },
  iron: { name: 'Железо', f: 0, p: 2, g: 0, icon: 'ingot', color: '#5d6672' },
  gold: { name: 'Золото', f: 0, p: 0, g: 3, icon: 'coin', color: '#e0b030' },
  gems: { name: 'Самоцветы', f: 0, p: 0, g: 3, icon: 'gem', color: '#9b59b6' },
  spices: { name: 'Пряности', f: 0, p: 0, g: 2, icon: 'leaf', color: '#c0392b' },
  furs: { name: 'Меха', f: 0, p: 0, g: 2, icon: 'paw', color: '#7b5a44' },
  oasis: { name: 'Оазис', f: 3, p: 0, g: 1, icon: 'drop', color: '#2e9e8f' },
};

export const IMPROVEMENTS: Record<string, { name: string; f: number; p: number; g: number; tech: string; icon: string }> = {
  farm: { name: 'Ферма', f: 1, p: 0, g: 0, tech: 'agriculture', icon: 'farm' },
  mine: { name: 'Шахта', f: 0, p: 1, g: 0, tech: 'mining', icon: 'pick' },
  pasture: { name: 'Пастбище', f: 0, p: 1, g: 0, tech: 'husbandry', icon: 'fence' },
  lumber: { name: 'Лесопилка', f: 0, p: 1, g: 0, tech: 'construction', icon: 'log' },
  plantation: { name: 'Плантация', f: 0, p: 0, g: 1, tech: 'currency', icon: 'leaf' },
  boats: { name: 'Рыбацкие лодки', f: 1, p: 0, g: 0, tech: 'sailing', icon: 'boat' },
};

// ───────────── Юниты ─────────────
export type UnitClass = 'civ' | 'recon' | 'melee' | 'ranged' | 'mounted' | 'siege' | 'gun' | 'armor';
export const CLASS_NAMES: Record<UnitClass, string> = {
  civ: 'Гражданский', recon: 'Разведка', melee: 'Пехота', ranged: 'Стрелки', mounted: 'Конница',
  siege: 'Осадные', gun: 'Огнестрельная пехота', armor: 'Бронетехника',
};

export interface UnitDef {
  id: string; name: string; cls: UnitClass; cost: number; s: number; rs?: number; range?: number; mv: number;
  tech?: string; obs?: string; icon: string; anti?: boolean; sight?: number; unique?: string; replaces?: string;
}

const BASE_UNITS: UnitDef[] = [
  { id: 'settler', name: 'Поселенцы', cls: 'civ', cost: 30, s: 0, mv: 2, icon: 'flag' },
  { id: 'scout', name: 'Разведчик', cls: 'recon', cost: 15, s: 4, mv: 3, sight: 3, icon: 'eye' },
  { id: 'warrior', name: 'Воин', cls: 'melee', cost: 20, s: 8, mv: 2, obs: 'iron', icon: 'club' },
  { id: 'archer', name: 'Лучник', cls: 'ranged', cost: 28, s: 5, rs: 9, range: 2, mv: 2, tech: 'archery', obs: 'machinery', icon: 'bow' },
  { id: 'spearman', name: 'Копейщик', cls: 'melee', cost: 30, s: 11, mv: 2, anti: true, tech: 'bronze', obs: 'feudalism', icon: 'spear' },
  { id: 'horseman', name: 'Всадник', cls: 'mounted', cost: 35, s: 12, mv: 4, tech: 'riding', obs: 'chivalry', icon: 'horseshoe' },
  { id: 'swordsman', name: 'Мечник', cls: 'melee', cost: 45, s: 15, mv: 2, tech: 'iron', obs: 'gunpowder', icon: 'sword' },
  { id: 'catapult', name: 'Катапульта', cls: 'siege', cost: 50, s: 5, rs: 14, range: 2, mv: 2, tech: 'math', obs: 'metallurgy', icon: 'catapult' },
  { id: 'pikeman', name: 'Пикинёр', cls: 'melee', cost: 60, s: 18, mv: 2, anti: true, tech: 'feudalism', obs: 'gunpowder', icon: 'pike' },
  { id: 'knight', name: 'Рыцарь', cls: 'mounted', cost: 70, s: 22, mv: 4, tech: 'chivalry', obs: 'rifling', icon: 'helmet' },
  { id: 'crossbow', name: 'Арбалетчик', cls: 'ranged', cost: 65, s: 10, rs: 19, range: 2, mv: 2, tech: 'machinery', obs: 'rifling', icon: 'crossbow' },
  { id: 'musketman', name: 'Мушкетёр', cls: 'gun', cost: 90, s: 28, mv: 2, tech: 'gunpowder', obs: 'rifling', icon: 'rifle' },
  { id: 'cannon', name: 'Пушка', cls: 'siege', cost: 95, s: 10, rs: 30, range: 2, mv: 2, tech: 'metallurgy', obs: 'ballistics', icon: 'cannon' },
  { id: 'rifleman', name: 'Стрелок', cls: 'gun', cost: 120, s: 38, mv: 2, tech: 'rifling', obs: 'replaceable', icon: 'rifle' },
  { id: 'cavalry', name: 'Кавалерия', cls: 'mounted', cost: 120, s: 34, mv: 4, tech: 'rifling', obs: 'combustion', icon: 'horseshoe' },
  { id: 'artillery', name: 'Артиллерия', cls: 'siege', cost: 140, s: 12, rs: 44, range: 3, mv: 2, tech: 'ballistics', icon: 'cannon' },
  { id: 'infantry', name: 'Пехота', cls: 'gun', cost: 170, s: 52, mv: 2, tech: 'replaceable', icon: 'helmet2' },
  { id: 'tank', name: 'Танк', cls: 'armor', cost: 190, s: 62, mv: 4, tech: 'combustion', icon: 'tank' },
];

// ───────────── Нации ─────────────
export interface Mods {
  foodFlat: number; prodPct: number; goldPct: number; goldFlat: number; sciPct: number; sciFlat: number;
  cultPct: number; cultFlat: number; unitPct: number; settlerPct: number; devBonus: number; cityPct: number;
  heal: number; bldCostPct: number; bldProdPct: number; wonderProdPct: number; freeLvl: number; mountedMv: number;
  goldOnKill: number; healOnKill: number; tundraProd: number;
}
export const ZERO_MODS: Mods = {
  foodFlat: 0, prodPct: 0, goldPct: 0, goldFlat: 0, sciPct: 0, sciFlat: 0, cultPct: 0, cultFlat: 0, unitPct: 0,
  settlerPct: 0, devBonus: 0, cityPct: 0, heal: 0, bldCostPct: 0, bldProdPct: 0, wonderProdPct: 0, freeLvl: 0,
  mountedMv: 0, goldOnKill: 0, healOnKill: 0, tundraProd: 0,
};

export interface NationDef {
  id: string; name: string; color: string; ability: string; desc: string; mods: Partial<Mods>;
  uu: Partial<UnitDef> & { id: string; replaces: string; name: string };
  pack: 'base' | 'conquerors'; cities: string[];
}

export const NATIONS: Record<string, NationDef> = {
  rus: {
    id: 'rus', name: 'Русь', color: '#c8423b', ability: 'Бескрайние земли', pack: 'base',
    desc: '+50% культуры (границы растут быстрее), +1 производство на тундре',
    mods: { cultPct: 50, tundraProd: 1 },
    uu: { id: 'druzhina', replaces: 'swordsman', name: 'Дружина', s: 17 },
    cities: ['Новгород', 'Владимир', 'Суздаль', 'Ростов', 'Псков', 'Смоленск', 'Тверь', 'Рязань', 'Муром', 'Ладога', 'Москва', 'Ярославль', 'Галич', 'Вологда'],
  },
  rome: {
    id: 'rome', name: 'Рим', color: '#8d4fb8', ability: 'Все дороги ведут в Рим', pack: 'base',
    desc: '+20% производства при строительстве зданий',
    mods: { bldProdPct: 20 },
    uu: { id: 'legion', replaces: 'swordsman', name: 'Легион', s: 17 },
    cities: ['Рим', 'Антиум', 'Кумы', 'Неаполь', 'Равенна', 'Аквилея', 'Медиолан', 'Арреций', 'Капуя', 'Остия', 'Помпеи', 'Тарент', 'Верона', 'Генуя'],
  },
  egypt: {
    id: 'egypt', name: 'Египет', color: '#d9a521', ability: 'Дар Нила', pack: 'base',
    desc: '+25% производства чудес света',
    mods: { wonderProdPct: 25 },
    uu: { id: 'chariot', replaces: 'horseman', name: 'Боевая колесница', s: 14, cost: 32 },
    cities: ['Фивы', 'Мемфис', 'Гелиополь', 'Элефантина', 'Александрия', 'Абидос', 'Пи-Рамсес', 'Гиза', 'Бубастис', 'Саис', 'Ахетатон', 'Танис', 'Эдфу', 'Асьют'],
  },
  china: {
    id: 'china', name: 'Китай', color: '#1f9e89', ability: 'Мандаринат', pack: 'base',
    desc: '+15% науки',
    mods: { sciPct: 15 },
    uu: { id: 'chukonu', replaces: 'crossbow', name: 'Чжугэ-ну', rs: 23 },
    cities: ['Чанъань', 'Лоян', 'Нанкин', 'Пекин', 'Кайфэн', 'Ханчжоу', 'Чэнду', 'Гуанчжоу', 'Сучжоу', 'Ухань', 'Датун', 'Цюаньчжоу', 'Цзинань', 'Тайюань'],
  },
  norse: {
    id: 'norse', name: 'Скандинавия', color: '#3b78c4', ability: 'Добыча викингов', pack: 'conquerors',
    desc: '+15 золота за каждую победу в бою, юниты лечатся на 5 больше',
    mods: { goldOnKill: 15, heal: 5 },
    uu: { id: 'huscarl', replaces: 'spearman', name: 'Хускарл', s: 13 },
    cities: ['Тронхейм', 'Уппсала', 'Роскилле', 'Берген', 'Хедебю', 'Бирка', 'Каупанг', 'Сигтуна', 'Орхус', 'Ставангер', 'Лунд', 'Оденсе', 'Висбю', 'Рибе'],
  },
  mongols: {
    id: 'mongols', name: 'Монголия', color: '#e0702a', ability: 'Степная орда', pack: 'conquerors',
    desc: 'Конные юниты получают +1 очко хода',
    mods: { mountedMv: 1 },
    uu: { id: 'keshig', replaces: 'knight', name: 'Кешиг', s: 24 },
    cities: ['Каракорум', 'Аварга', 'Сарай', 'Хара-Хото', 'Алмалык', 'Бишбалык', 'Кобдо', 'Улясутай', 'Хайлар', 'Кондуй', 'Олон-Сумэ', 'Бэрх', 'Дзун-Хара', 'Ундэр'],
  },
  aztec: {
    id: 'aztec', name: 'Ацтеки', color: '#3fa34d', ability: 'Цветочные войны', pack: 'conquerors',
    desc: 'Победа в бою лечит юнит на 25',
    mods: { healOnKill: 25 },
    uu: { id: 'jaguar', replaces: 'warrior', name: 'Воин-ягуар', s: 10 },
    cities: ['Теночтитлан', 'Тескоко', 'Тлакопан', 'Тлателолко', 'Шочимилько', 'Койоакан', 'Чапультепек', 'Куаунауак', 'Атотонилько', 'Тула', 'Тепейак', 'Иштапалапа', 'Чалько', 'Толука'],
  },
  greece: {
    id: 'greece', name: 'Греция', color: '#d6539a', ability: 'Полисы', pack: 'conquerors',
    desc: '+1 наука и +1 культура в каждом городе',
    mods: { sciFlat: 1, cultFlat: 1 },
    uu: { id: 'hoplite', replaces: 'spearman', name: 'Гоплит', s: 14 },
    cities: ['Афины', 'Спарта', 'Коринф', 'Аргос', 'Милет', 'Эфес', 'Дельфы', 'Олимпия', 'Пирей', 'Мегара', 'Родос', 'Сиракузы', 'Эретрия', 'Халкида'],
  },
};
export const NATION_IDS = Object.keys(NATIONS);

// Уникальные юниты строятся из базовых
export const UNITS: Record<string, UnitDef> = {};
for (const u of BASE_UNITS) UNITS[u.id] = u;
for (const n of Object.values(NATIONS)) {
  const base = UNITS[n.uu.replaces];
  UNITS[n.uu.id] = { ...base, ...n.uu, unique: n.id } as UnitDef;
}

// ───────────── Здания и чудеса ─────────────
export interface Flat { f?: number; p?: number; g?: number; s?: number; c?: number }
export interface BuildingDef extends Flat {
  id: string; name: string; cost: number; maint: number; tech?: string; icon: string; desc: string;
  pPct?: number; gPct?: number; sPct?: number; defPct?: number; hp?: number; xp?: number;
  water?: number; coastal?: boolean; wonder?: boolean; project?: boolean; global?: Flat;
}

const BLD: BuildingDef[] = [
  { id: 'monument', name: 'Монумент', cost: 30, maint: 0, icon: 'star', desc: '+2 культуры', c: 2 },
  { id: 'granary', name: 'Амбар', cost: 45, maint: 1, tech: 'pottery', icon: 'wheat', desc: '+2 еды', f: 2 },
  { id: 'barracks', name: 'Казармы', cost: 40, maint: 1, tech: 'bronze', icon: 'sword', desc: 'Новые юниты получают 15 опыта (1 уровень)', xp: 15 },
  { id: 'walls', name: 'Стены', cost: 55, maint: 1, tech: 'masonry', icon: 'shield', desc: '+50% к обороне города, +100 прочности', defPct: 50, hp: 100 },
  { id: 'library', name: 'Библиотека', cost: 60, maint: 1, tech: 'writing', icon: 'flask', desc: '+2 науки, +15% науки', s: 2, sPct: 15 },
  { id: 'harbor', name: 'Гавань', cost: 60, maint: 1, tech: 'sailing', icon: 'anchor', desc: '+1 еда с водных клеток, +1 золото', water: 1, g: 1, coastal: true },
  { id: 'market', name: 'Рынок', cost: 70, maint: 0, tech: 'currency', icon: 'coin', desc: '+2 золота, +25% золота', g: 2, gPct: 25 },
  { id: 'temple', name: 'Храм', cost: 60, maint: 1, tech: 'philosophy', icon: 'star', desc: '+3 культуры', c: 3 },
  { id: 'workshop', name: 'Мастерская', cost: 75, maint: 1, tech: 'construction', icon: 'hammer', desc: '+2 производства, +10% производства', p: 2, pPct: 10 },
  { id: 'university', name: 'Университет', cost: 120, maint: 2, tech: 'education', icon: 'flask', desc: '+3 науки, +35% науки', s: 3, sPct: 35 },
  { id: 'bank', name: 'Банк', cost: 130, maint: 0, tech: 'banking', icon: 'coin', desc: '+3 золота, +25% золота', g: 3, gPct: 25 },
  { id: 'factory', name: 'Фабрика', cost: 200, maint: 3, tech: 'steam', icon: 'hammer', desc: '+4 производства, +25% производства', p: 4, pPct: 25 },
  { id: 'powerplant', name: 'Электростанция', cost: 220, maint: 3, tech: 'electricity', icon: 'bolt', desc: '+25% производства', pPct: 25 },
  { id: 'lab', name: 'Научный центр', cost: 260, maint: 3, tech: 'computers', icon: 'flask', desc: '+5 науки, +50% науки', s: 5, sPct: 50 },
  // Чудеса света (одно на мир)
  { id: 'gardens', name: 'Висячие сады', cost: 130, maint: 0, tech: 'pottery', icon: 'wonder', wonder: true, desc: '+2 еды здесь, +1 еда во всех городах', f: 2, global: { f: 1 } },
  { id: 'pyramids', name: 'Пирамиды', cost: 150, maint: 0, tech: 'masonry', icon: 'wonder', wonder: true, desc: '+25% производства здесь, +1 производство во всех городах', pPct: 25, global: { p: 1 } },
  { id: 'greatlib', name: 'Великая библиотека', cost: 180, maint: 0, tech: 'philosophy', icon: 'wonder', wonder: true, desc: '+3 науки и бесплатная технология', s: 3 },
  { id: 'terracotta', name: 'Терракотовая армия', cost: 220, maint: 0, tech: 'feudalism', icon: 'wonder', wonder: true, desc: 'Все военные юниты получают +1 уровень' },
  { id: 'cathedral', name: 'Великий собор', cost: 260, maint: 0, tech: 'theology', icon: 'wonder', wonder: true, desc: '+5 культуры здесь, +1 культура во всех городах', c: 5, global: { c: 1 } },
  { id: 'observatory', name: 'Великая обсерватория', cost: 300, maint: 0, tech: 'astronomy', icon: 'wonder', wonder: true, desc: '+4 науки, +50% науки в городе', s: 4, sPct: 50 },
  { id: 'expo', name: 'Всемирная выставка', cost: 450, maint: 0, tech: 'electricity', icon: 'wonder', wonder: true, desc: '+5 золота здесь, +2 золота во всех городах', g: 5, global: { g: 2 } },
  { id: 'horizon', name: 'Проект «Горизонт»', cost: 1100, maint: 0, tech: 'rocketry', icon: 'rocket', project: true, desc: 'Первая межзвёздная экспедиция. Научная победа' },
];
export const BUILDINGS: Record<string, BuildingDef> = {};
for (const b of BLD) BUILDINGS[b.id] = b;
export const BUILDING_IDS = BLD.map((b) => b.id);

// ───────────── Технологии ─────────────
export interface TechDef { id: string; name: string; era: number; req: string[]; desc?: string }
const T = (id: string, name: string, era: number, req: string[], desc?: string): TechDef => ({ id, name, era, req, desc });
export const TECH_LIST: TechDef[] = [
  T('agriculture', 'Земледелие', 0, [], 'Фермы на равнинах и лугах'),
  T('pottery', 'Гончарство', 0, ['agriculture']),
  T('husbandry', 'Скотоводство', 0, ['agriculture'], 'Пастбища на скоте и лошадях'),
  T('archery', 'Стрельба из лука', 0, ['agriculture']),
  T('mining', 'Горное дело', 0, ['agriculture'], 'Шахты на холмах'),
  T('sailing', 'Мореходство', 0, ['pottery'], 'Рыбацкие лодки'),
  T('masonry', 'Каменная кладка', 0, ['mining']),
  T('bronze', 'Бронзовое литьё', 0, ['mining']),
  T('writing', 'Письменность', 0, ['pottery']),
  T('riding', 'Верховая езда', 0, ['husbandry']),
  T('iron', 'Обработка железа', 1, ['bronze']),
  T('math', 'Математика', 1, ['writing', 'archery']),
  T('currency', 'Деньги', 1, ['writing'], 'Плантации на пряностях и самоцветах'),
  T('philosophy', 'Философия', 1, ['writing']),
  T('construction', 'Строительство', 1, ['masonry'], 'Лесопилки в лесах'),
  T('feudalism', 'Феодализм', 2, ['iron', 'construction']),
  T('chivalry', 'Рыцарство', 2, ['riding', 'feudalism']),
  T('machinery', 'Механика', 2, ['math', 'iron']),
  T('theology', 'Богословие', 2, ['philosophy']),
  T('education', 'Образование', 2, ['theology', 'currency']),
  T('gunpowder', 'Порох', 3, ['machinery', 'feudalism']),
  T('banking', 'Банковское дело', 3, ['education']),
  T('astronomy', 'Астрономия', 3, ['education', 'math']),
  T('metallurgy', 'Металлургия', 3, ['gunpowder']),
  T('steam', 'Паровой двигатель', 4, ['banking', 'metallurgy'], '+1 производство шахт и лесопилок'),
  T('rifling', 'Нарезное оружие', 4, ['metallurgy']),
  T('electricity', 'Электричество', 4, ['astronomy', 'steam'], '+1 еда с ферм'),
  T('ballistics', 'Баллистика', 4, ['rifling']),
  T('replaceable', 'Массовое производство', 5, ['electricity', 'ballistics']),
  T('combustion', 'Двигатель внутреннего сгорания', 5, ['steam', 'ballistics']),
  T('computers', 'Компьютеры', 5, ['electricity']),
  T('rocketry', 'Ракетостроение', 5, ['computers', 'combustion']),
];
export const TECHS: Record<string, TechDef> = {};
for (const t of TECH_LIST) TECHS[t.id] = t;

// ───────────── Хартии эпох (уникальная механика) ─────────────
export interface CharterDef { id: string; name: string; desc: string; mods: Partial<Mods>; ai: 'war' | 'sci' | 'exp' | 'eco' }
export const CHARTERS: Record<string, CharterDef> = {
  agrarian: { id: 'agrarian', name: 'Хлебные законы', desc: '+1 еда в каждом городе', mods: { foodFlat: 1 }, ai: 'exp' },
  academy: { id: 'academy', name: 'Академия', desc: '+15% науки во всех городах', mods: { sciPct: 15 }, ai: 'sci' },
  doctrine: { id: 'doctrine', name: 'Военная доктрина', desc: '+15% к силе всех юнитов', mods: { unitPct: 15 }, ai: 'war' },
  trade: { id: 'trade', name: 'Торговые пути', desc: '+20% золота и +1 золото в каждом городе', mods: { goldPct: 20, goldFlat: 1 }, ai: 'eco' },
  guilds: { id: 'guilds', name: 'Гильдии мастеров', desc: '+10% производства во всех городах', mods: { prodPct: 10 }, ai: 'eco' },
  colonial: { id: 'colonial', name: 'Колонизация', desc: 'Поселенцы на 35% дешевле, клетки осваиваются вдвое быстрее', mods: { settlerPct: 35, devBonus: 1 }, ai: 'exp' },
  militia: { id: 'militia', name: 'Народное ополчение', desc: '+40% к обороне городов, юниты лечатся на 10 больше', mods: { cityPct: 40, heal: 10 }, ai: 'war' },
  enlight: { id: 'enlight', name: 'Просвещение', desc: 'Здания на 20% дешевле', mods: { bldCostPct: 20 }, ai: 'sci' },
  heritage: { id: 'heritage', name: 'Наследие предков', desc: '+50% культуры и +1 культура в каждом городе', mods: { cultPct: 50, cultFlat: 1 }, ai: 'exp' },
  veterans: { id: 'veterans', name: 'Школа ветеранов', desc: 'Новые юниты получают +1 уровень', mods: { freeLvl: 1 }, ai: 'war' },
};
export const CHARTER_IDS = Object.keys(CHARTERS);
