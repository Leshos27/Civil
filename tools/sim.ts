// Headless-симуляция: все державы под управлением ИИ. Проверяет, что правила не падают,
// и печатает статистику для балансировки. Запуск: npm run sim -- [партий] [ходов]
import { createGame, defaultSettings } from '../src/core/setup';
import { endTurn } from '../src/core/turn';
import { ERA_NAMES, UNITS } from '../src/core/data';
import { playerCities, score } from '../src/core/rules';
import type { Game } from '../src/core/types';

declare const process: { argv: string[]; exit(code: number): void };

function invariants(g: Game) {
  const seen = new Map<string, number>();
  for (const u of g.units) {
    const key = `${u.at}:${UNITS[u.type].cls === 'civ' ? 'c' : 'm'}`;
    if (seen.has(key)) throw new Error(`Два юнита одного слоя на клетке ${u.at} (ход ${g.turn})`);
    seen.set(key, u.owner);
    if (u.hp <= 0) throw new Error(`Мёртвый юнит в списке (ход ${g.turn})`);
    if (!g.players[u.owner].alive) throw new Error('Юнит павшей державы');
  }
  for (const c of g.cities) {
    if (g.tiles[c.at].owner !== c.owner) throw new Error(`Город ${c.name} стоит на чужой клетке`);
    if (c.pop < 1) throw new Error(`Город ${c.name} без населения`);
  }
  const owners = new Set(g.units.map((u) => u.at + ':' + u.owner));
  for (const u of g.units) for (const o of g.units) if (u.at === o.at && u.owner !== o.owner) throw new Error(`Юниты разных держав на клетке ${u.at}`);
  void owners;
}

const games = Number(process.argv[2] || 3);
const turns = Number(process.argv[3] || 200);
const sizes = ['small', 'standard', 'large'] as const;
let totalMs = 0, totalTurns = 0;
for (let k = 0; k < games; k++) {
  const s = { ...defaultSettings(), seed: 1000 + k * 77, size: sizes[k % 3], players: [4, 6, 8][k % 3], speed: 'standard' as const, turnLimit: turns };
  const g = createGame(s);
  for (const p of g.players) p.human = false;
  const t0 = Date.now();
  let t = 0;
  for (; t < turns && !g.winner; t++) {
    endTurn(g);
    g.notes = [];
    g.fx = [];
    invariants(g);
    if (g.turn % 50 === 0 || g.winner) {
      const line = g.players.map((p) => `${p.name.slice(0, 6)}:${p.alive ? `${playerCities(g, p.id).length}г/${p.techs.length}т/${ERA_NAMES[p.era].slice(0, 4)}/${score(g, p.id)}` : '✝'}`).join('  ');
      console.log(`  ход ${g.turn}: ${line}`);
    }
  }
  const ms = Date.now() - t0;
  totalMs += ms; totalTurns += t;
  const wars = g.players.reduce((s, p) => s + p.rel.filter((r) => r.war).length, 0) / 2;
  const kills = g.players.reduce((s, p) => s + p.kills, 0);
  console.log(`Партия ${k + 1} (${s.size}, ${g.players.length} держав): ${t} ходов за ${ms} мс, ${(ms / t).toFixed(1)} мс/ход; ` +
    `городов ${g.cities.length}, юнитов ${g.units.length}, войн сейчас ${wars}, убито ${kills}, чудес ${Object.keys(g.wonders).length}; ` +
    `победа: ${g.winner ? `${g.players[g.winner.pid]?.name} (${g.winner.type})` : 'нет'}`);
}
console.log(`Итого: ${(totalMs / Math.max(1, totalTurns)).toFixed(1)} мс на ход в среднем`);
