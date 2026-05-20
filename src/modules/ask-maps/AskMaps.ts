import type { SmartMapsEngine } from '../../engine/SmartMapsEngine';
import { CommandParser } from './CommandParser';

export interface AskHistoryEntry {
  input: string;
  response: string;
  at: number;
}

/**
 * Ask Maps — the AI command layer. Takes free-form natural language, resolves it
 * against the command registry, executes the matched action against the engine,
 * and surfaces a human-friendly response through the engine event bus.
 *
 * Today the resolver is rule-based for determinism and offline use. To upgrade to
 * an LLM, replace `parser.parse()` with a function-calling planner that returns
 * the same `{ command, match }` shape — every downstream stage stays the same.
 */
export class AskMaps {
  private parser = new CommandParser();
  private history: AskHistoryEntry[] = [];

  constructor(private engine: SmartMapsEngine) {}

  async run(query: string): Promise<string> {
    const result = this.parser.parse(query);
    if (!result) {
      const msg = `I didn't understand "${query}". Try "help" for examples.`;
      this.engine.bus.emit('engine:toast', msg);
      this.history.push({ input: query, response: msg, at: Date.now() });
      return msg;
    }
    const out =
      (await result.command.run({
        engine: this.engine,
        navigationService: this.engine.navigationService,
        query,
        match: result.match
      })) ?? '';
    if (out) this.engine.bus.emit('engine:toast', out);
    this.history.push({ input: query, response: out, at: Date.now() });
    return out;
  }

  getHistory(): AskHistoryEntry[] {
    return this.history.slice();
  }

  listCommands() {
    return this.parser.listCommands();
  }
}
