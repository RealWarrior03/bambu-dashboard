import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  COLOR_SWATCHES,
  FILAMENT_PRESETS,
  type AmsUnit,
  type ModelProfile,
  type PrinterStatus,
  type Tray,
} from '@bambu/shared';
import { useTranslation } from 'react-i18next';
import { cssColor, textOn } from '../lib/format';

function Slot({ tray, active, onClick }: { tray: Tray; active: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  const color = tray.empty ? 'transparent' : cssColor(tray.color);
  return (
    <button
      className={`slot ${active ? 'active' : ''} ${tray.empty ? 'empty' : ''}`}
      onClick={onClick}
      title={t('filament.edit')}
    >
      <span className="spool" style={{ background: color, color: textOn(tray.color) }}>
        {tray.empty ? '' : tray.type}
      </span>
      <span className="slot-meta">
        <span className="slot-name">
          {tray.empty ? t('filament.empty') : (tray.name ?? tray.type)}
        </span>
        {tray.remain !== null && (
          <span className="remain">
            <span style={{ width: `${tray.remain}%` }} />
          </span>
        )}
        {active && <span className="active-tag">{t('filament.active')}</span>}
      </span>
    </button>
  );
}

function UnitHeader({ unit, index }: { unit: AmsUnit; index: number }) {
  const { t } = useTranslation();
  const humidity =
    unit.humidityPercent !== null
      ? `${unit.humidityPercent}%`
      : unit.humidityLevel !== null
        ? `${unit.humidityLevel}/5`
        : null;
  return (
    <div className="unit-head">
      <span>
        {t(`filament.${unit.kind}`)} {index + 1}
      </span>
      <span className="muted">
        {humidity && `${t('filament.humidity')} ${humidity}`}
        {unit.temperature !== null && ` · ${Math.round(unit.temperature)}°`}
      </span>
    </div>
  );
}

interface PanelProps {
  status: PrinterStatus;
  onEdit: (tray: Tray) => void;
}

export function FilamentPanel({ status, onEdit }: PanelProps) {
  const { t } = useTranslation();
  const many = status.externalTrays.length > 1;
  return (
    <div className="filament">
      {status.externalTrays.length > 0 && (
        <div className="unit">
          <div className="unit-head">
            <span>{t('filament.external')}</span>
          </div>
          <div className="slots">
            {status.externalTrays.map((tray, i) => (
              <div key={tray.key} className="slot-wrap">
                {many && (
                  <span className="muted small">{t('filament.externalN', { n: i + 1 })}</span>
                )}
                <Slot
                  tray={tray}
                  active={status.activeTray === tray.key}
                  onClick={() => onEdit(tray)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
      {status.ams.map((unit, index) => (
        <div key={unit.id} className="unit">
          <UnitHeader unit={unit} index={index} />
          <div className="slots">
            {unit.trays.map((tray) => (
              <Slot
                key={tray.key}
                tray={tray}
                active={status.activeTray === tray.key}
                onClick={() => onEdit(tray)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export interface FilamentValues {
  trayType: string;
  color: string;
  nozzleMin: number;
  nozzleMax: number;
  infoIdx?: string;
}

interface DialogProps {
  tray: Tray;
  profile: ModelProfile;
  onSave: (values: FilamentValues) => Promise<boolean>;
  onClose: () => void;
}

export function FilamentDialog({ tray, profile, onSave, onClose }: DialogProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const initialPreset = FILAMENT_PRESETS.find((p) => p.type === tray.type) ?? FILAMENT_PRESETS[0];
  const [type, setType] = useState(tray.empty ? initialPreset.type : tray.type);
  const [color, setColor] = useState(
    tray.empty || tray.color.length < 6 ? '00AE42' : tray.color.slice(0, 6),
  );
  const [nozzleMin, setNozzleMin] = useState(tray.nozzleMin ?? initialPreset.nozzleMin);
  const [nozzleMax, setNozzleMax] = useState(tray.nozzleMax ?? initialPreset.nozzleMax);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const pickType = (value: string) => {
    setType(value);
    const preset = FILAMENT_PRESETS.find((p) => p.type === value);
    if (preset) {
      setNozzleMin(preset.nozzleMin);
      setNozzleMax(preset.nozzleMax);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const preset = FILAMENT_PRESETS.find((p) => p.type === type);
    // Keep the original profile id if the material did not change (e.g. Bambu PLA Basic).
    const infoIdx = type === tray.type && tray.infoIdx ? tray.infoIdx : preset?.infoIdx;
    const ok = await onSave({ trayType: type, color, nozzleMin, nozzleMax, infoIdx });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit}>
        <h2>{t('filament.edit')}</h2>
        <label className="field">
          <span>{t('filament.type')}</span>
          <select value={type} onChange={(e) => pickType(e.target.value)}>
            {!FILAMENT_PRESETS.some((p) => p.type === type) && <option value={type}>{type}</option>}
            {FILAMENT_PRESETS.map((p) => (
              <option key={p.type} value={p.type}>
                {p.type}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>{t('filament.color')}</span>
          <div className="swatches">
            {COLOR_SWATCHES.map((c) => (
              <button
                type="button"
                key={c}
                className={`swatch ${c === color.toUpperCase() ? 'on' : ''}`}
                style={{ background: `#${c}` }}
                aria-label={`#${c}`}
                onClick={() => setColor(c)}
              />
            ))}
            <input
              type="color"
              value={`#${color}`}
              aria-label={t('filament.color')}
              onChange={(e) => setColor(e.target.value.slice(1).toUpperCase())}
            />
          </div>
        </div>
        <div className="row">
          <label className="field">
            <span>{t('filament.nozzleMin')}</span>
            <input
              type="number"
              min={150}
              max={profile.maxNozzle}
              value={nozzleMin}
              onChange={(e) => setNozzleMin(Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span>{t('filament.nozzleMax')}</span>
            <input
              type="number"
              min={150}
              max={profile.maxNozzle}
              value={nozzleMax}
              onChange={(e) => setNozzleMax(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="actions">
          <button type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="primary" disabled={busy || nozzleMin > nozzleMax}>
            {t('common.save')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
