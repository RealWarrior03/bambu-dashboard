import { describe, expect, it } from 'vitest';
import { deriveStatus, mergeReport } from '../src/printer/state';

describe('mergeReport', () => {
  it('keeps fields that a partial update does not mention', () => {
    const raw: Record<string, any> = {};
    mergeReport(raw, { print: { nozzle_temper: 25, bed_temper: 24, gcode_state: 'IDLE' } });
    mergeReport(raw, { print: { nozzle_temper: 180.5 } });
    expect(raw.print).toEqual({ nozzle_temper: 180.5, bed_temper: 24, gcode_state: 'IDLE' });
  });

  it('merges AMS trays by id', () => {
    const raw: Record<string, any> = {};
    mergeReport(raw, {
      print: {
        ams: {
          ams: [
            {
              id: '0',
              tray: [
                { id: '0', tray_type: 'PLA', remain: 80 },
                { id: '1', tray_type: 'PETG' },
              ],
            },
          ],
        },
      },
    });
    mergeReport(raw, { print: { ams: { ams: [{ id: '0', tray: [{ id: '0', remain: 79 }] }] } } });
    const tray = raw.print.ams.ams[0].tray;
    expect(tray).toEqual([{ id: '0', tray_type: 'PLA', remain: 79 }]);
  });

  it('replaces plain arrays', () => {
    const raw: Record<string, any> = { print: { hms: [{ attr: 1, code: 2 }] } };
    mergeReport(raw, { print: { hms: [] } });
    expect(raw.print.hms).toEqual([]);
  });
});

describe('deriveStatus', () => {
  const report = {
    print: {
      gcode_state: 'RUNNING',
      mc_percent: 42,
      mc_remaining_time: 63,
      layer_num: 100,
      total_layer_num: 240,
      subtask_name: 'Benchy',
      nozzle_temper: 219.6,
      nozzle_target_temper: 220,
      bed_temper: '59.94',
      bed_target_temper: 60,
      chamber_temper: 35,
      cooling_fan_speed: '15',
      big_fan1_speed: '0',
      big_fan2_speed: '10',
      spd_lvl: 2,
      wifi_signal: '-60dBm',
      lights_report: [{ node: 'chamber_light', mode: 'on' }],
      hms: [{ attr: 0x03000100, code: 0x00010007 }],
      vt_tray: {
        id: '254',
        tray_type: 'PETG',
        tray_color: 'ff0000ff',
        nozzle_temp_min: '220',
        nozzle_temp_max: '260',
        remain: -1,
      },
      ams: {
        tray_now: '5',
        ams: [
          {
            id: '0',
            humidity: '4',
            temp: '25.2',
            tray: [{ id: '0', tray_type: 'PLA', tray_color: 'FFFFFFFF', remain: 90 }],
          },
          { id: '1', humidity_raw: '23', tray: [{ id: '1', tray_type: '' }] },
        ],
      },
    },
  };

  it('parses an A1 report', () => {
    const s = deriveStatus(report, 'A1', 'online');
    expect(s).toMatchObject({
      connection: 'online',
      job: 'RUNNING',
      progress: 42,
      remainingMinutes: 63,
      layer: 100,
      totalLayers: 240,
      fileName: 'Benchy',
      nozzleTemp: 219.6,
      bedTemp: 59.9,
      chamberTemp: null, // A1 has no chamber sensor
      fans: { part: 100, aux: 0, chamber: 67 },
      speedLevel: 2,
      light: true,
      wifiSignal: '-60dBm',
      activeTray: '1:1',
    });
    expect(s.hms[0].code).toBe('0300_0100_0001_0007');
    expect(s.externalTrays).toEqual([
      expect.objectContaining({
        key: '255:254',
        type: 'PETG',
        color: 'FF0000FF',
        remain: null,
        nozzleMin: 220,
        nozzleMax: 260,
      }),
    ]);
    expect(s.ams[0]).toMatchObject({
      id: 0,
      kind: 'ams_lite',
      humidityLevel: 4,
      temperature: 25.2,
    });
    expect(s.ams[1]).toMatchObject({ humidityPercent: 23 });
    expect(s.ams[1].trays[0].empty).toBe(true);
  });

  it('reports chamber temperature on X1', () => {
    expect(deriveStatus(report, 'X1C', 'online').chamberTemp).toBe(35);
  });

  it('handles the H2D virtual slots and AMS HT', () => {
    const s = deriveStatus(
      {
        print: {
          vir_slot: [
            { id: '254', tray_type: 'PLA' },
            { id: '255', tray_type: 'ABS' },
          ],
          ams: { tray_now: '128', ams: [{ id: '128', tray: [{ id: '0', tray_type: 'PA' }] }] },
        },
      },
      'H2D',
      'online',
    );
    expect(s.externalTrays.map((t) => t.key)).toEqual(['255:254', '255:255']);
    expect(s.ams[0].kind).toBe('ams_ht');
    expect(s.activeTray).toBe('128:0');
  });

  it('copes with an empty report', () => {
    const s = deriveStatus({}, 'P1S', 'connecting');
    expect(s.job).toBe('UNKNOWN');
    expect(s.nozzleTemp).toBeNull();
    expect(s.ams).toEqual([]);
    expect(s.activeTray).toBeNull();
  });
});
