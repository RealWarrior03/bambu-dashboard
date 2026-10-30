import { useState, type CSSProperties, type FormEvent } from 'react';
import type { SpeedLevel } from '@bambu/shared';
import { useTranslation } from 'react-i18next';
import { formatTemp } from '../lib/format';
import { usePending } from '../lib/usePending';

const near = (a: number | null, b: number | null) =>
  a !== null && b !== null && Math.abs(a - b) < 1;

interface TempProps {
  label: string;
  current: number | null;
  target: number | null;
  max: number;
  presets: number[];
  disabled?: boolean;
  onSet: (value: number) => Promise<boolean>;
}

export function TempControl({ label, current, target, max, presets, disabled, onSet }: TempProps) {
  const { t } = useTranslation();
  const pending = usePending(target, near);
  // null while the user is not typing, so the field follows the printer's target.
  const [draft, setDraft] = useState<string | null>(null);
  const shownTarget = pending.value ? String(Math.round(pending.value)) : '';
  const fieldValue = draft ?? shownTarget;

  const apply = async (value: number) => {
    setDraft(null);
    const v = Math.max(0, Math.min(max, Math.round(value)));
    pending.set(v);
    if (!(await onSet(v))) pending.clear();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = Number(fieldValue);
    if (fieldValue !== '' && Number.isFinite(v)) apply(v);
  };

  const heating = pending.value !== null && pending.value > 0;

  return (
    <div className={`temp ${heating ? 'heating' : ''}`}>
      <div className="temp-head">
        <span className="label">{label}</span>
        <span className="temp-now">{formatTemp(current)}</span>
      </div>
      <form className="temp-set" onSubmit={submit}>
        <label className="sr-only" htmlFor={`t-${label}`}>
          {t('temp.target')}
        </label>
        <span className={`temp-target ${pending.isPending ? 'pending' : ''}`}>
          {t('temp.target')}
        </span>
        <input
          id={`t-${label}`}
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          value={fieldValue}
          placeholder={t('temp.off')}
          disabled={disabled}
          // Delay so a click on "Set" still submits the typed value.
          onBlur={() => window.setTimeout(() => setDraft(null), 200)}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="small" disabled={disabled || fieldValue === ''}>
          {t('temp.set')}
        </button>
      </form>
      <div className="chips">
        <button className="chip" disabled={disabled} onClick={() => apply(0)}>
          {t('temp.off')}
        </button>
        {presets.map((p) => (
          <button key={p} className="chip" disabled={disabled} onClick={() => apply(p)}>
            {p}°
          </button>
        ))}
      </div>
    </div>
  );
}

interface FanProps {
  label: string;
  value: number | null;
  disabled?: boolean;
  onSet: (percent: number) => Promise<boolean>;
}

export function FanControl({ label, value, disabled, onSet }: FanProps) {
  const pending = usePending(value, (a, b) => a !== null && b !== null && Math.abs(a - b) <= 7);
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? pending.value ?? 0;

  const commit = async () => {
    if (drag === null) return;
    const v = drag;
    setDrag(null);
    pending.set(v);
    if (!(await onSet(v))) pending.clear();
  };

  return (
    <label className="fan">
      <span className="fan-head">
        <span className="label">{label}</span>
        <span className={`value ${pending.isPending ? 'pending' : ''}`}>{shown}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={10}
        value={shown}
        disabled={disabled}
        style={{ '--fill': `${shown}%` } as CSSProperties}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </label>
  );
}

interface SpeedProps {
  value: number | null;
  disabled?: boolean;
  onSet: (level: SpeedLevel) => Promise<boolean>;
}

export function SpeedControl({ value, disabled, onSet }: SpeedProps) {
  const { t } = useTranslation();
  const pending = usePending(value);
  const levels: SpeedLevel[] = [1, 2, 3, 4];
  return (
    <div className="segmented" role="radiogroup" aria-label={t('speed.title')}>
      {levels.map((level) => (
        <button
          key={level}
          role="radio"
          aria-checked={pending.value === level}
          className={pending.value === level ? (pending.isPending ? 'on pending' : 'on') : ''}
          disabled={disabled}
          onClick={async () => {
            pending.set(level);
            if (!(await onSet(level))) pending.clear();
          }}
        >
          {t(`speed.${level}`)}
        </button>
      ))}
    </div>
  );
}

interface SwitchProps {
  label: string;
  checked: boolean | null;
  disabled?: boolean;
  onSet: (on: boolean) => Promise<boolean>;
}

export function Switch({ label, checked, disabled, onSet }: SwitchProps) {
  const pending = usePending(checked);
  const on = pending.value === true;
  return (
    <button
      role="switch"
      aria-checked={on}
      className={`switch ${on ? 'on' : ''} ${pending.isPending ? 'pending' : ''}`}
      disabled={disabled || checked === null}
      onClick={async () => {
        pending.set(!on);
        if (!(await onSet(!on))) pending.clear();
      }}
    >
      <span className="switch-track">
        <span className="switch-thumb" />
      </span>
      <span>{label}</span>
    </button>
  );
}
