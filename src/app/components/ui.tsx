import type { ComponentChildren } from 'preact';
import { languageName, sortedLanguages } from '../../lib/langs';

export function Header(props: { title: string; back?: string; children?: ComponentChildren }) {
  return (
    <header class="header">
      {props.back !== undefined ? (
        <a class="header-back" href={props.back} aria-label="Back">
          ‹
        </a>
      ) : (
        <span class="header-back" />
      )}
      <h1>{props.title}</h1>
      <div class="header-actions">{props.children}</div>
    </header>
  );
}

export function Toggle(props: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="row toggle">
      <span>
        {props.label}
        {props.hint && <small>{props.hint}</small>}
      </span>
      <input type="checkbox" role="switch" checked={props.checked} onChange={(e) => props.onChange(e.currentTarget.checked)} />
    </label>
  );
}

export function LangSelect(props: { label: string; value: string; onChange: (v: string) => void }) {
  const options = sortedLanguages();
  if (props.value && !options.includes(props.value)) options.unshift(props.value);
  return (
    <label class="field">
      <span>{props.label}</span>
      <select value={props.value} onChange={(e) => props.onChange(e.currentTarget.value)}>
        {!props.value && <option value="">Choose…</option>}
        {options.map((code) => (
          <option key={code} value={code}>
            {languageName(code)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Empty(props: { children: ComponentChildren }) {
  return <div class="empty">{props.children}</div>;
}
