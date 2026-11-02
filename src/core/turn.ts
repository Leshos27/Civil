// Оркестрация хода: ИИ → обработка всех держав → проверка победы → начало нового хода.
import { runAI } from './ai';
import { maybeTriggerEvent } from './events';
import { cityById, playerCities, score } from './rules';
import type { Game, Player } from './types';
import { checkElimination, moveAlong, notify, processPlayer, refreshVisibility } from './world';

export function endTurn(g: Game) {
  if (g.winner) return;
  for (const p of g.players) if (p.alive && !p.human) runAI(g, p);
  for (const p of g.players) if (p.alive) processPlayer(g, p);
  g.turn++;
  for (const p of g.players) checkElimination(g, p.id);
  checkVictory(g);
  if (g.winner) return;
  for (const p of g.players) if (p.alive) startTurn(g, p);
}

function startTurn(g: Game, p: Player) {
  if (p.human) {
    for (const u of g.units) {
      if (u.owner !== p.id || !u.path) continue;
      const path = u.path;
      u.path = null;
      moveAlong(g, u, path);
    }
    refreshVisibility(g, p.id);
    if (!p.cur && !p.rq.length) notify(g, p.id, 'Выберите новое исследование', 'tech');
  }
  maybeTriggerEvent(g, p);
}

export function checkVictory(g: Game) {
  const alive = g.players.filter((p) => p.alive);
  const human = g.players.find((p) => p.human);
  if (g.winner) return;
  // доминирование: все изначальные столицы под контролем одной державы
  const caps = g.cities.filter((c) => c.origCap >= 0);
  for (const p of alive) {
    const ownsAll = caps.length > 1 && caps.every((c) => c.owner === p.id);
    if (ownsAll || alive.length === 1) { g.winner = { pid: p.id, type: 'domination' }; return; }
  }
  if (human && !human.alive) {
    const best = alive.sort((a, b) => score(g, b.id) - score(g, a.id))[0];
    g.winner = { pid: best ? best.id : -1, type: 'domination' };
    return;
  }
  if (g.turn > g.settings.turnLimit) {
    const best = alive.sort((a, b) => score(g, b.id) - score(g, a.id))[0];
    g.winner = { pid: best.id, type: 'score' };
  }
}

export { cityById, playerCities };
