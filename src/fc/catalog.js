/*
 * catalog.js: capability catalog for the flight-controller screen.
 *
 * Every Configurator field has one status. The renderer has one disabled
 * style. This file is the only place that decides LIVE versus grey. The UI
 * asks status(key). It does not know what a dyn notch is.
 *
 * Status rules:
 *   LIVE           writes a PG this build compiles, and that code runs
 *   GATED          writes the PG; this firmware then ignores it at 1 kHz
 *   APPLIED_INERT  writes a PG; nothing that flies reads it
 *   INERT          real 4.5 CLI key, subsystem not compiled
 *   ABSENT         Configurator chrome that is not a CLI key here
 *   SHELL          game / radio convenience, not on this screen
 *   PLANT          physics constants, not a Configurator tab
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { VALUE_TABLE } from './catalog-data.js';

export const STATUS = {
  LIVE: 'LIVE',
  GATED: 'GATED',
  APPLIED_INERT: 'APPLIED_INERT',
  INERT: 'INERT',
  ABSENT: 'ABSENT',
  SHELL: 'SHELL',
  PLANT: 'PLANT',
};

/*
 * GATED vs INERT is the honesty line. Grey means this simulator does not
 * have that machine. A noted GATED control means Betaflight has it, and at
 * 1 kHz it does what 1 kHz Betaflight does. Greying the dynamic notch would
 * teach the wrong lesson: a real 8 kHz gyro / 1 kHz PID board also has no
 * dyn notch.
 */
const GATED = {
  dyn_notch_count:
    'Betaflight SDFT will not arm below 2 kHz (DYN_NOTCH_UPDATE_MIN_HZ). This loop is 1 kHz, same as a 1 kHz board.',
  dyn_notch_q:
    'Betaflight SDFT will not arm below 2 kHz (DYN_NOTCH_UPDATE_MIN_HZ). This loop is 1 kHz, same as a 1 kHz board.',
  dyn_notch_min_hz:
    'Betaflight SDFT will not arm below 2 kHz (DYN_NOTCH_UPDATE_MIN_HZ). This loop is 1 kHz, same as a 1 kHz board.',
  dyn_notch_max_hz:
    'Betaflight SDFT will not arm below 2 kHz (DYN_NOTCH_UPDATE_MIN_HZ). This loop is 1 kHz, same as a 1 kHz board.',
  pid_process_denom:
    'Stored, then forced to 1. The plant step is 1 kHz.',
};

const APPLIED_INERT = {
  motor_kv:
    'Stored in motorConfig.kv. Plant ke is independent. The airframe is still the Stage 1 5 inch.',
  gyro_hardware_lpf:
    'No analog gyro chip. The digital gyro path does not read this.',
  min_throttle:
    'Stored in motorConfig.minthrottle. Glue motorInitEndpoints uses DShot constants, not this PWM field.',
  max_throttle:
    'Stored in motorConfig.maxthrottle. Glue motorInitEndpoints uses DShot constants, not this PWM field.',
  min_command:
    'Stored in motorConfig.mincommand. Glue motorInitEndpoints uses DShot constants, not this PWM field.',
  motor_poles:
    'Stored in motorConfig.motorPoleCount. Rotor Hz is injected from the plant; the RPM filter does not convert eRPM via poles.',
  crashflip_expo:
    'Stored. isFlipOverAfterCrashActive is stubbed false, so mixer crashflip never runs.',
  crashflip_motor_percent:
    'Stored. isFlipOverAfterCrashActive is stubbed false, so mixer crashflip never runs.',
  fpv_mix_degrees:
    'Stored in rxConfig.fpvCamAngleDegrees. BOXFPVANGLEMIX is never raised, so rc.c never mixes it.',
  runaway_takeoff_prevention:
    'Stored in the PID profile. Would need fc/core.c compiled; nothing in this 1 ms loop reads it.',
  gyro_filter_debug_axis:
    'Stored. Only DEBUG_SET reads it, and blackbox debug is not a flight control here.',
};

const INERT_REASONS = [
  [/^osd_/, 'No OSD pixels in the FPV view yet'],
  [/^vtx_/, 'No VTX in the sim'],
  [/^gps_/, 'No GPS sensor in the plant'],
  [/^led_/, 'No LED strip in the plant'],
  [/^blackbox_/, 'No blackbox device in this build'],
  [/^failsafe_/, 'Would need flight/failsafe.c compiled'],
  [/^mag_/, 'No magnetometer in the plant'],
  [/^baro_/, 'No barometer in the plant'],
  [/^acc_/, 'Simulated gyro needs no accelerometer hardware'],
  [/^serial/, 'No UART grid. The sim is not a radio link'],
  [/^telemetry_/, 'No telemetry radio link'],
  [/^beeper_/, 'No buzzer in the plant'],
  [/^sdcard_/, 'No SD card in this build'],
  [/^dashboard_/, 'No i2c display in this build'],
  [/^camera_/, 'No RunCam device in the sim'],
  [/^cam_/, 'No camera control device in the sim'],
  [/^esc_/, 'ESC protocol is not modelled; rotor Hz is injected through telemetry'],
  [/^dshot_/, 'DShot as a protocol is not modelled; idle is LIVE when it is dshot_idle_value'],
  [/^msp_/, 'No MSP link. Values travel as CLI text'],
  [/^rssi_/, 'No radio link, so no RSSI channel'],
  [/^sbus_/, 'No SBUS receiver. Sticks come from the Gamepad path'],
  [/^spektrum_/, 'No Spektrum receiver. Sticks come from the Gamepad path'],
  [/^srxl2_/, 'No SRXL2 receiver. Sticks come from the Gamepad path'],
  [/^crsf_/, 'No CRSF/ELRS link. Sticks come from the Gamepad path'],
  [/^rx_/, 'Receiver pulse limits are not a radio link here'],
  [/^gyro_calib/, 'The simulated gyro needs no calibration'],
  [/^gyro_overflow/, 'The simulated gyro needs no overflow hardware check'],
  [/^gyro_offset/, 'The simulated gyro needs no calibration offset'],
  [/^gyro_high_range/, 'No ICM-20649 high-range gyro chip'],
  [/^gyro_to_use/, 'One simulated gyro, not a dual-gyro board'],
  [/^gyro_hardware/, 'No analog gyro chip'],
  [/^vbat_/, 'Plant owns pack voltage; use Pack charge in Settings'],
  [/^ibat_/, 'Plant owns pack current; use Pack charge in Settings'],
  [/^bat_/, 'Plant owns the pack; use Pack charge in Settings'],
  [/^battery_/, 'Plant owns the pack; use Pack charge in Settings'],
  [/^current_meter/, 'Plant owns pack current; use Pack charge in Settings'],
  [/^use_vbat_alerts/, 'Plant owns pack voltage; use Pack charge in Settings'],
  [/^use_cbat_alerts/, 'Plant owns the pack; use Pack charge in Settings'],
  [/^cbat_/, 'Plant owns the pack; use Pack charge in Settings'],
  [/^force_battery/, 'Plant owns the pack; use Pack charge in Settings'],
  [/^motor_pwm_/, 'PWM protocol details are not modelled'],
  [/^motor_output_reordering/, 'Motor output reordering is not modelled'],
  [/^motor_pwm_inversion/, 'Motor output inversion is not modelled'],
  [/^small_angle/, 'An arming check; the craft is always armed'],
  [/^gyro_cal_on_first_arm/, 'The simulated gyro needs no calibration'],
  [/^pilot_name/, 'Pilot name lives in the game shell'],
  [/^craft_name/, 'Craft name lives in the game shell'],
  [/^profile_name/, 'One PID profile, profile 0'],
  [/^rateprofile_name/, 'One rate profile, profile 0'],
  [/^board_name/, 'Board identity is the WASM target, not a flashable name'],
  [/^manufacturer_id/, 'Board identity is the WASM target'],
  [/^acro_trainer_/, 'USE_ACRO_TRAINER is not built for this target'],
  [/^launch_/, 'Launch control needs an arming sequence this build does not have'],
  [/^auto_profile_cell_count/, 'One PID profile, profile 0'],
  [/^runaway_takeoff_deactivate/, 'Runaway takeoff is not driven without fc/core.c'],
  [/^rpm_limit/, 'The RPM limiter needs an ESC current loop this build does not have'],
  [/^max_aux_channels/, 'No AUX channels until they are fed from the gamepad'],
  [/^mixer_/, 'mixer_type is LIVE when it is in bf_settings.c; the rest is not compiled'],
  [/^3d_/, 'No 3D (reversible) motors on this airframe'],
  [/^deadband/, 'Stick deadband is a radio concern; calibration stays in Settings'],
  [/^yaw_deadband/, 'Stick deadband is a radio concern; calibration stays in Settings'],
  [/^yaw_control_reversed/, 'Yaw direction is yaw_motors_reversed on the mixer'],
  [/^align_/, 'Board alignment: the simulated gyro needs no cal'],
  [/^debug_/, 'Debug mode is a blackbox probe, not a flight control'],
  [/^displayport_/, 'No MSP displayport device'],
  [/^frsky_/, 'No FrSky telemetry device'],
  [/^ibata/, 'Plant owns pack current'],
  [/^ibatt/, 'Plant owns pack current'],
  [/^pinio/, 'No PINIO box in the plant'],
  [/^usb_/, 'No USB HID/CDC settings in this build'],
  [/^vtx/, 'No VTX in the sim'],
  [/^gps/, 'No GPS sensor in the plant'],
  [/^servo/, 'No servos on this airframe'],
  [/^ledstrip/, 'No LED strip in the plant'],
  [/^sdio_/, 'No SDIO device in this build'],
  [/^system_/, 'Target system settings are not a flight control here'],
  [/^scheduler_/, 'The 1 kHz step is fixed'],
  [/^cpu_overclock/, 'No overclock on a WASM target'],
  [/^stats_/, 'Onboard stats are not compiled'],
  [/^name$/, 'Craft name lives in the game shell'],
  [/^rcdevice_/, 'No RunCam device in the sim'],
  [/^rc_smoothing_debug/, 'Debug axis is a blackbox probe'],
  [/^rc_smoothing_active/, 'Read-only firmware diagnostic, not a flight control here'],
  [/^rpm_filter_weights$/, 'Array CLI form is not parsed. Harmonic weights are LIVE as rpm_filter_weights_1, _2, _3'],
];

function inertReason(key) {
  for (const [re, reason] of INERT_REASONS) {
    if (re.test(key)) {
      return reason;
    }
  }
  return 'Would need the matching Betaflight subsystem compiled';
}

const PG_TAB = {
  GYRO_CONFIG: 'pid',
  DYN_NOTCH_CONFIG: 'pid',
  RPM_FILTER_CONFIG: 'pid',
  PID: 'pid',
  PID_PROFILE: 'pid',
  PID_CONFIG: 'configuration',
  CONTROL_RATE_PROFILES: 'pid',
  RX_CONFIG: 'receiver',
  RX_SPI_CONFIG: 'receiver',
  PWM_CONFIG: 'receiver',
  MOTOR_CONFIG: 'motors',
  MIXER_CONFIG: 'motors',
  ACCELEROMETER_CONFIG: 'setup',
  COMPASS_CONFIG: 'setup',
  BAROMETER_CONFIG: 'setup',
  BOARD_CONFIG: 'setup',
  OSD: 'osd',
  OSD_CONFIG: 'osd',
  VTX_CONFIG: 'vtx',
  VTX_IO_CONFIG: 'vtx',
  VTX_TABLE_CONFIG: 'vtx',
  LED_STRIP_CONFIG: 'led',
  LEDSTRIP_CONFIG: 'led',
  GPS: 'gps',
  GPS_RESCUE: 'gps',
  FAILSAFE_CONFIG: 'failsafe',
  SERVO_CONFIG: 'servos',
  SERVO_MIXER: 'servos',
  BLACKBOX_CONFIG: 'blackbox',
  BATTERY_CONFIG: 'power',
  CURRENT_SENSOR_ADC_CONFIG: 'power',
  VOLTAGE_SENSOR_ADC_CONFIG: 'power',
  SERIAL_CONFIG: 'ports',
  TELEMETRY_CONFIG: 'ports',
  MSP_CONFIG: 'ports',
  BEEPER_CONFIG: 'configuration',
  MODE_ACTIVATION_PROFILE: 'modes',
  ADJUSTMENT_RANGES: 'adjustments',
};

function tabFor(row) {
  if (row.pg && PG_TAB[row.pg]) {
    return PG_TAB[row.pg];
  }
  const key = row.key;
  if (/^(p_|i_|d_|f_|d_min|tpa_|iterm_|anti_gravity|feedforward_|simplified_|gyro_|dterm_|dyn_notch|rpm_filter|yaw_lowpass|pid_|crash_|angle_|horizon_|level_|throttle_boost|thrust_linear|abs_control|vbat_sag|dyn_idle|ez_landing|transient_throttle|pidsum_|pid_at_min)/.test(key)) {
    return 'pid';
  }
  if (/^(roll_|pitch_|yaw_rc|yaw_srate|yaw_expo|yaw_rate_limit|rates_|thr_mid|thr_expo|throttle_limit|quickrates)/.test(key)) {
    return 'pid';
  }
  if (/^(rc_smoothing|mid_rc|min_check|max_check|airmode_start|serialrx|rssi|rx_|sbus_|crsf_|spektrum_|srxl2_|fpv_mix)/.test(key)) {
    return 'receiver';
  }
  if (/^osd_/.test(key)) {
    return 'osd';
  }
  if (/^vtx_/.test(key)) {
    return 'vtx';
  }
  if (/^led_/.test(key)) {
    return 'led';
  }
  if (/^gps_/.test(key)) {
    return 'gps';
  }
  if (/^failsafe_/.test(key)) {
    return 'failsafe';
  }
  if (/^servo/.test(key)) {
    return 'servos';
  }
  if (/^blackbox_/.test(key)) {
    return 'blackbox';
  }
  if (/^(vbat_|ibat_|bat_|battery_|current_meter|cbat_|use_vbat|use_cbat|force_battery)/.test(key)) {
    return 'power';
  }
  if (/^(motor_|dshot_|mixer_|yaw_motors|min_throttle|max_throttle|min_command|crashflip)/.test(key)) {
    return 'motors';
  }
  if (/^(acc_|mag_|baro_|align_|board_|gyro_calib|gyro_offset|gyro_overflow|gyro_to_use)/.test(key)) {
    return 'setup';
  }
  if (/^(serial|telemetry_|msp_)/.test(key)) {
    return 'ports';
  }
  return 'configuration';
}

function pageFor(key, tab) {
  if (tab !== 'pid') {
    return '';
  }
  if (/^(gyro_|dterm_|dyn_notch|rpm_filter|yaw_lowpass|yaw_spin)/.test(key)) {
    return 'filters';
  }
  if (/^(roll_|pitch_|yaw_rc|yaw_srate|yaw_expo|yaw_rate_limit|rates_|thr_mid|thr_expo|throttle_limit|quickrates)/.test(key)) {
    return 'rates';
  }
  return 'pid';
}

function unitsFor(key) {
  if (key.endsWith('_hz')) {
    return 'Hz';
  }
  if (key.endsWith('_ms')) {
    return 'ms';
  }
  if (key.includes('percent')) {
    return '%';
  }
  if (key.endsWith('_q') || key === 'dyn_notch_q' || key === 'rpm_filter_q') {
    return 'Q';
  }
  return '';
}

function classify(row) {
  if (Object.prototype.hasOwnProperty.call(GATED, row.key)) {
    return { status: STATUS.GATED, reason: GATED[row.key] };
  }
  if (Object.prototype.hasOwnProperty.call(APPLIED_INERT, row.key)) {
    return { status: STATUS.APPLIED_INERT, reason: APPLIED_INERT[row.key] };
  }
  if (row.live) {
    return { status: STATUS.LIVE, reason: '' };
  }
  return { status: STATUS.INERT, reason: inertReason(row.key) };
}

function decorate(row) {
  const tab = tabFor(row);
  const { status, reason } = classify(row);
  return {
    key: row.key,
    type: row.type,
    lookup: row.lookup,
    pg: row.pg,
    min: row.min,
    max: row.max,
    array: row.array,
    live: row.live,
    tab,
    page: pageFor(row.key, tab),
    units: unitsFor(row.key),
    status,
    reason,
  };
}

export const TABS = [
  { id: 'setup', label: 'Setup', grey: false, reason: '' },
  { id: 'ports', label: 'Ports', grey: true, reason: 'No UART grid. The sim is not a radio link' },
  { id: 'configuration', label: 'Configuration', grey: false, reason: '' },
  { id: 'pid', label: 'PID Tuning', grey: false, reason: '' },
  { id: 'receiver', label: 'Receiver', grey: false, reason: '' },
  { id: 'modes', label: 'Modes', grey: false, reason: '' },
  { id: 'adjustments', label: 'Adjustments', grey: true, reason: 'No AUX channels, so in-flight PID adj is not compiled' },
  { id: 'servos', label: 'Servos', grey: true, reason: 'No servos on this airframe' },
  { id: 'motors', label: 'Motors', grey: false, reason: '' },
  { id: 'osd', label: 'OSD', grey: true, reason: 'No OSD pixels in the FPV view yet' },
  { id: 'vtx', label: 'VTX', grey: true, reason: 'No VTX in the sim' },
  { id: 'led', label: 'LED Strip', grey: true, reason: 'No LED strip in the plant' },
  { id: 'gps', label: 'GPS', grey: true, reason: 'No GPS sensor in the plant' },
  { id: 'failsafe', label: 'Failsafe', grey: true, reason: 'Would need flight/failsafe.c compiled' },
  { id: 'blackbox', label: 'Blackbox', grey: true, reason: 'No blackbox device in this build' },
  { id: 'blackbox-viewer', label: 'Blackbox viewer', grey: true, reason: 'No blackbox device in this build' },
  { id: 'power', label: 'Power', grey: true, reason: 'Plant owns pack voltage; use Pack charge in Settings' },
  { id: 'presets', label: 'Presets', grey: false, reason: '' },
  { id: 'cli', label: 'CLI', grey: false, reason: '' },
  { id: 'flasher', label: 'Firmware flasher', grey: true, reason: 'Configurator chrome. Not a CLI key here' },
  { id: 'autotune', label: 'Autotune', grey: true, reason: 'Configurator chrome. Not a CLI key here' },
  { id: 'flight-plan', label: 'Flight plan', grey: true, reason: 'Configurator chrome. Not a CLI key here' },
  { id: 'cloud-profile', label: 'User cloud profile', grey: true, reason: 'Configurator chrome. Not a CLI key here' },
  { id: 'cloud-backups', label: 'Backups to cloud', grey: true, reason: 'Configurator chrome. Not a CLI key here' },
];

export const ABSENT_FIELDS = [
  { key: '#flasher', tab: 'flasher', status: STATUS.ABSENT, reason: 'Configurator chrome. Not a CLI key here' },
  { key: '#ports_uart', tab: 'ports', status: STATUS.ABSENT, reason: 'No UART grid. The sim is not a radio link' },
  { key: '#msp_rx', tab: 'receiver', status: STATUS.ABSENT, reason: 'No MSP receiver. Sticks come from the Gamepad path' },
  { key: '#autotune', tab: 'autotune', status: STATUS.ABSENT, reason: 'Configurator chrome. Not a CLI key here' },
  { key: '#led_painter', tab: 'led', status: STATUS.ABSENT, reason: 'No LED strip in the plant' },
  { key: '#blackbox_viewer', tab: 'blackbox-viewer', status: STATUS.ABSENT, reason: 'No blackbox device in this build' },
  { key: '#flight_plan', tab: 'flight-plan', status: STATUS.ABSENT, reason: 'Configurator chrome. Not a CLI key here' },
  { key: '#cloud_profile', tab: 'cloud-profile', status: STATUS.ABSENT, reason: 'Configurator chrome. Not a CLI key here' },
  { key: '#cloud_backups', tab: 'cloud-backups', status: STATUS.ABSENT, reason: 'Configurator chrome. Not a CLI key here' },
  { key: '#aux_ranges', tab: 'modes', status: STATUS.ABSENT, reason: 'No AUX channels until they are fed from the gamepad' },
];

export const FIELDS = VALUE_TABLE.map(decorate).concat(
  ABSENT_FIELDS.map((f) => ({
    key: f.key,
    type: null,
    lookup: null,
    pg: null,
    min: null,
    max: null,
    array: false,
    live: false,
    tab: f.tab,
    page: '',
    units: '',
    status: f.status,
    reason: f.reason,
  })),
);

const BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

export function field(key) {
  return BY_KEY.get(key) ?? null;
}

export function status(key) {
  const f = BY_KEY.get(key);
  return f ? f.status : STATUS.INERT;
}

/*
 * The FC screen asks status(key) here. Do not treat sim_bf_key_status as
 * enablement: native 0 means "in the write table", which includes GATED
 * and APPLIED_INERT. Grey-out is this catalog, not the C int.
 */

export function tabFields(tabId) {
  return FIELDS.filter((f) => f.tab === tabId);
}

export function catalogCounts() {
  const counts = {
    LIVE: 0,
    GATED: 0,
    APPLIED_INERT: 0,
    INERT: 0,
    ABSENT: 0,
    SHELL: 0,
    PLANT: 0,
  };
  for (const f of FIELDS) {
    counts[f.status] += 1;
  }
  return counts;
}

export const GATED_KEYS = Object.keys(GATED);
export const APPLIED_INERT_KEYS = Object.keys(APPLIED_INERT);
