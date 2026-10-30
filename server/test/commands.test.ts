import { describe, expect, it } from 'vitest';
import { detectModel, profileFor } from '@bambu/shared';
import { buildPayloads, CommandError, withSequence } from '../src/printer/commands';

const a1 = profileFor('A1');
const x1 = profileFor('X1C');

describe('buildPayloads', () => {
  it('switches the light', () => {
    const [p] = buildPayloads({ type: 'light', on: false }, a1);
    expect(p.system).toMatchObject({
      command: 'ledctrl',
      led_node: 'chamber_light',
      led_mode: 'off',
    });
  });

  it('clamps temperatures to the model limits', () => {
    expect(buildPayloads({ type: 'nozzleTemp', value: 215.4 }, a1)).toEqual([
      { print: { command: 'gcode_line', param: 'M104 S215\n' } },
    ]);
    expect(buildPayloads({ type: 'bedTemp', value: 130 }, a1)[0].print.param).toBe('M140 S100\n');
  });

  it('converts fan percent to 0-255', () => {
    expect(buildPayloads({ type: 'fan', fan: 'part', percent: 50 }, a1)[0].print.param).toBe(
      'M106 P1 S128\n',
    );
    expect(buildPayloads({ type: 'fan', fan: 'chamber', percent: 100 }, x1)[0].print.param).toBe(
      'M106 P3 S255\n',
    );
  });

  it('rejects fans the model does not have', () => {
    expect(() => buildPayloads({ type: 'fan', fan: 'chamber', percent: 50 }, a1)).toThrow(
      CommandError,
    );
  });

  it('sets the speed level', () => {
    expect(buildPayloads({ type: 'speed', level: 3 }, a1)).toEqual([
      { print: { command: 'print_speed', param: '3' } },
    ]);
  });

  it('builds the filament setting for the external spool', () => {
    const [p] = buildPayloads(
      {
        type: 'filament',
        amsId: 255,
        trayId: 254,
        trayType: 'PETG',
        color: '#00ae42',
        nozzleMin: 220,
        nozzleMax: 260,
        infoIdx: 'GFG99',
      },
      a1,
    );
    expect(p.print).toEqual({
      command: 'ams_filament_setting',
      ams_id: 255,
      tray_id: 254,
      slot_id: 254,
      tray_info_idx: 'GFG99',
      tray_color: '00AE42FF',
      nozzle_temp_min: 220,
      nozzle_temp_max: 260,
      tray_type: 'PETG',
    });
  });

  it('adds the sequence id inside the command object', () => {
    expect(withSequence({ print: { command: 'pause', param: '' } }, 7)).toEqual({
      print: { sequence_id: '7', command: 'pause', param: '' },
    });
  });
});

describe('detectModel', () => {
  it.each([
    ['03919C123456789', 'A1'],
    ['0309DA123456789', 'A1M'],
    ['01P00A123456789', 'P1S'],
    ['00M09A123456789', 'X1C'],
    ['ABC', null],
  ])('%s -> %s', (serial, model) => {
    expect(detectModel(serial)).toBe(model);
  });
});
