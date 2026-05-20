import { useState } from 'react';

interface Props {
  onAsk: (query: string) => void;
  suggestions: string[];
}

export default function AskMapsBar({ onAsk, suggestions }: Props) {
  const [value, setValue] = useState('');

  const submit = (q: string) => {
    const text = q.trim();
    if (!text) return;
    onAsk(text);
    setValue('');
  };

  return (
    <div className="ask">
      <form
        className="ask-row"
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
      >
        <span className="ask-spark" aria-hidden>✦</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask Maps — fly to London Eye, orbit Tower Bridge, route to Big Ben…"
          aria-label="Ask Maps"
          spellCheck={false}
          autoComplete="off"
        />
        <button type="submit" className="ask-send">Ask</button>
      </form>
      <div className="ask-suggest">
        {suggestions.map((s) => (
          <button key={s} type="button" onClick={() => submit(s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
