import { COMMANDS, type CommandDef } from './commandRegistry';

export interface ParseResult {
  command: CommandDef;
  match: RegExpMatchArray;
}

/**
 * CommandParser is the lexical front-end of Ask Maps. It scans registered command
 * patterns and returns the first match. Deterministic and offline by design — an
 * LLM front-end can be slotted in later by replacing `parse()` while keeping the
 * registry as the executable backbone.
 */
export class CommandParser {
  parse(query: string): ParseResult | null {
    const trimmed = query.trim();
    if (!trimmed) return null;
    for (const cmd of COMMANDS) {
      for (const pattern of cmd.patterns) {
        const m = trimmed.match(pattern);
        if (m) return { command: cmd, match: m };
      }
    }
    return null;
  }

  listCommands(): CommandDef[] {
    return COMMANDS.slice();
  }
}
