/*
 * catalog-data.js: generated from vendor/betaflight 4.5.1 valueTable and
 * src/native/bf/bf_settings.c. Do not edit. Run:
 *   node scripts/fc-catalog-gen.js
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

export const VALUE_TABLE = [
  {
    "key": "gyro_hardware_lpf",
    "type": "UINT8",
    "lookup": "GYRO_HARDWARE_LPF",
    "pg": "GYRO_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "gyro_high_range",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "GYRO_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "gyro_lpf1_type",
    "type": "UINT8",
    "lookup": "GYRO_LPF_TYPE",
    "pg": "GYRO_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "gyro_lpf1_static_hz",
    "type": "UINT16",
    "lookup": null,
    "pg": "GYRO_CONFIG",
    "min": "0",
    "max": "LPF_MAX_HZ",
    "array": false,
    "live": true
  },
  {
    "key": "gyro_lpf2_type",
    "type": "UINT8",
    "lookup": "GYRO_LPF_TYPE",
    "pg": "GYRO_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "gyro_lpf2_static_hz",
    "type": "UINT16",
    "lookup": null,
    "pg": "GYRO_CONFIG",
    "min": "0",
    "max": "LPF_MAX_HZ",
    "array": false,
    "live": true
  },
  {
    "key": "gyro_notch1_hz",
    "type": "UINT16",
    "lookup": null,
    "pg": "GYRO_CONFIG",
    "min": "0",
    "max": "LPF_MAX_HZ",
    "array": false,
    "live": true
  },
  {
    "key": "gyro_notch1_cutoff",
    "type": "UINT16",
    "lookup": null,
    "pg": "GYRO_CONFIG",
    "min": "0",
    "max": "LPF_MAX_HZ",
    "array": false,
    "live": true
  },
  {
    "key": "gyro_notch2_hz",
    "type": "UINT16",
    "lookup": null,
    "pg": "GYRO_CONFIG",
    "min": "0",
    "max": "LPF_MAX_HZ",
    "array": false,
    "live": true
  },
  {
    "key": "gyro_notch2_cutoff",
    "type": "UINT16",
    "lookup": null,
    "pg": "GYRO_CONFIG",
    "min": "0",
    "max": "LPF_MAX_HZ",
    "array": false,
    "live": true
  },
  {
    "key": "gyro_calib_duration",
    "type": "UINT16",
    "lookup": null,
    "pg": "GYRO_CONFIG",
    "min": "50",
    "max": "3000",
    "array": false,
    "live": false
  },
  {
    "key": "gyro_calib_noise_limit",
    "type": "UINT8",
    "lookup": null,
    "pg": "GYRO_CONFIG",
    "min": "0",
    "max": "200",
    "array": false,
    "live": false
  },
  {
    "key": "gyro_offset_yaw",
    "type": "INT16",
    "lookup": null,
    "pg": "GYRO_CONFIG",
    "min": "-1000",
    "max": "1000",
    "array": false,
    "live": false
  },
  {
    "key": "gyro_overflow_detect",
    "type": "UINT8",
    "lookup": "GYRO_OVERFLOW_CHECK",
    "pg": "GYRO_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "yaw_spin_recovery",
    "type": "UINT8",
    "lookup": "OFF_ON_AUTO",
    "pg": "GYRO_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "yaw_spin_threshold",
    "type": "UINT16",
    "lookup": null,
    "pg": "GYRO_CONFIG",
    "min": "YAW_SPIN_RECOVERY_THRESHOLD_MIN",
    "max": "YAW_SPIN_RECOVERY_THRESHOLD_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "gyro_to_use",
    "type": "UINT8",
    "lookup": "GYRO",
    "pg": "GYRO_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "dyn_notch_count",
    "type": "UINT8",
    "lookup": null,
    "pg": "DYN_NOTCH_CONFIG",
    "min": "0",
    "max": "DYN_NOTCH_COUNT_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "dyn_notch_q",
    "type": "UINT16",
    "lookup": null,
    "pg": "DYN_NOTCH_CONFIG",
    "min": "1",
    "max": "1000",
    "array": false,
    "live": true
  },
  {
    "key": "dyn_notch_min_hz",
    "type": "UINT16",
    "lookup": null,
    "pg": "DYN_NOTCH_CONFIG",
    "min": "20",
    "max": "250",
    "array": false,
    "live": true
  },
  {
    "key": "dyn_notch_max_hz",
    "type": "UINT16",
    "lookup": null,
    "pg": "DYN_NOTCH_CONFIG",
    "min": "200",
    "max": "1000",
    "array": false,
    "live": true
  },
  {
    "key": "gyro_lpf1_dyn_min_hz",
    "type": "UINT16",
    "lookup": null,
    "pg": "GYRO_CONFIG",
    "min": "0",
    "max": "DYN_LPF_MAX_HZ",
    "array": false,
    "live": true
  },
  {
    "key": "gyro_lpf1_dyn_max_hz",
    "type": "UINT16",
    "lookup": null,
    "pg": "GYRO_CONFIG",
    "min": "0",
    "max": "DYN_LPF_MAX_HZ",
    "array": false,
    "live": true
  },
  {
    "key": "gyro_lpf1_dyn_expo",
    "type": "UINT8",
    "lookup": null,
    "pg": "GYRO_CONFIG",
    "min": "0",
    "max": "10",
    "array": false,
    "live": true
  },
  {
    "key": "gyro_filter_debug_axis",
    "type": "UINT8",
    "lookup": "GYRO_FILTER_DEBUG",
    "pg": "GYRO_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "acc_hardware",
    "type": "UINT8",
    "lookup": "ACC_HARDWARE",
    "pg": "ACCELEROMETER_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "acc_high_range",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "ACCELEROMETER_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "acc_lpf_hz",
    "type": "UINT16",
    "lookup": null,
    "pg": "ACCELEROMETER_CONFIG",
    "min": "0",
    "max": "500",
    "array": false,
    "live": false
  },
  {
    "key": "acc_trim_pitch",
    "type": "INT16",
    "lookup": null,
    "pg": "ACCELEROMETER_CONFIG",
    "min": "-300",
    "max": "300",
    "array": false,
    "live": false
  },
  {
    "key": "acc_trim_roll",
    "type": "INT16",
    "lookup": null,
    "pg": "ACCELEROMETER_CONFIG",
    "min": "-300",
    "max": "300",
    "array": false,
    "live": false
  },
  {
    "key": "acc_calibration",
    "type": "INT16",
    "lookup": null,
    "pg": "ACCELEROMETER_CONFIG",
    "min": null,
    "max": null,
    "array": true,
    "live": false
  },
  {
    "key": "align_mag",
    "type": "UINT8",
    "lookup": "ALIGNMENT",
    "pg": "COMPASS_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "mag_align_roll",
    "type": "INT16",
    "lookup": null,
    "pg": "COMPASS_CONFIG",
    "min": "-3600",
    "max": "3600",
    "array": false,
    "live": false
  },
  {
    "key": "mag_align_pitch",
    "type": "INT16",
    "lookup": null,
    "pg": "COMPASS_CONFIG",
    "min": "-3600",
    "max": "3600",
    "array": false,
    "live": false
  },
  {
    "key": "mag_align_yaw",
    "type": "INT16",
    "lookup": null,
    "pg": "COMPASS_CONFIG",
    "min": "-3600",
    "max": "3600",
    "array": false,
    "live": false
  },
  {
    "key": "mag_bustype",
    "type": "UINT8",
    "lookup": "BUS_TYPE",
    "pg": "COMPASS_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "mag_i2c_device",
    "type": "UINT8",
    "lookup": null,
    "pg": "COMPASS_CONFIG",
    "min": "0",
    "max": "I2CDEV_COUNT",
    "array": false,
    "live": false
  },
  {
    "key": "mag_i2c_address",
    "type": "UINT8",
    "lookup": null,
    "pg": "COMPASS_CONFIG",
    "min": "0",
    "max": "I2C_ADDR7_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "mag_spi_device",
    "type": "UINT8",
    "lookup": null,
    "pg": "COMPASS_CONFIG",
    "min": "0",
    "max": "SPIDEV_COUNT",
    "array": false,
    "live": false
  },
  {
    "key": "mag_hardware",
    "type": "UINT8",
    "lookup": "MAG_HARDWARE",
    "pg": "COMPASS_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "mag_calibration",
    "type": "INT16",
    "lookup": null,
    "pg": "COMPASS_CONFIG",
    "min": null,
    "max": null,
    "array": true,
    "live": false
  },
  {
    "key": "baro_bustype",
    "type": "UINT8",
    "lookup": "BUS_TYPE",
    "pg": "BAROMETER_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "baro_spi_device",
    "type": "UINT8",
    "lookup": null,
    "pg": "BAROMETER_CONFIG",
    "min": "0",
    "max": "5",
    "array": false,
    "live": false
  },
  {
    "key": "baro_i2c_device",
    "type": "UINT8",
    "lookup": null,
    "pg": "BAROMETER_CONFIG",
    "min": "0",
    "max": "5",
    "array": false,
    "live": false
  },
  {
    "key": "baro_i2c_address",
    "type": "UINT8",
    "lookup": null,
    "pg": "BAROMETER_CONFIG",
    "min": "0",
    "max": "I2C_ADDR7_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "baro_hardware",
    "type": "UINT8",
    "lookup": "BARO_HARDWARE",
    "pg": "BAROMETER_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "mid_rc",
    "type": "UINT16",
    "lookup": null,
    "pg": "RX_CONFIG",
    "min": "1200",
    "max": "1700",
    "array": false,
    "live": true
  },
  {
    "key": "min_check",
    "type": "UINT16",
    "lookup": null,
    "pg": "RX_CONFIG",
    "min": "PWM_PULSE_MIN",
    "max": "PWM_PULSE_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "max_check",
    "type": "UINT16",
    "lookup": null,
    "pg": "RX_CONFIG",
    "min": "PWM_PULSE_MIN",
    "max": "PWM_PULSE_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "rssi_channel",
    "type": "INT8",
    "lookup": null,
    "pg": "RX_CONFIG",
    "min": "0",
    "max": "MAX_SUPPORTED_RC_CHANNEL_COUNT",
    "array": false,
    "live": false
  },
  {
    "key": "rssi_src_frame_errors",
    "type": "INT8",
    "lookup": "OFF_ON",
    "pg": "RX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "rssi_scale",
    "type": "UINT8",
    "lookup": null,
    "pg": "RX_CONFIG",
    "min": "RSSI_SCALE_MIN",
    "max": "RSSI_SCALE_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "rssi_offset",
    "type": "INT8",
    "lookup": null,
    "pg": "RX_CONFIG",
    "min": "-100",
    "max": "100",
    "array": false,
    "live": false
  },
  {
    "key": "rssi_invert",
    "type": "INT8",
    "lookup": "OFF_ON",
    "pg": "RX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "rssi_src_frame_lpf_period",
    "type": "UINT8",
    "lookup": null,
    "pg": "RX_CONFIG",
    "min": "0",
    "max": "UINT8_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "rssi_smoothing",
    "type": "UINT8",
    "lookup": null,
    "pg": "RX_CONFIG",
    "min": "0",
    "max": "UINT8_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "rc_smoothing",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "RX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "rc_smoothing_auto_factor",
    "type": "UINT8",
    "lookup": null,
    "pg": "RX_CONFIG",
    "min": "RC_SMOOTHING_AUTO_FACTOR_MIN",
    "max": "RC_SMOOTHING_AUTO_FACTOR_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "rc_smoothing_auto_factor_throttle",
    "type": "UINT8",
    "lookup": null,
    "pg": "RX_CONFIG",
    "min": "RC_SMOOTHING_AUTO_FACTOR_MIN",
    "max": "RC_SMOOTHING_AUTO_FACTOR_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "rc_smoothing_setpoint_cutoff",
    "type": "UINT8",
    "lookup": null,
    "pg": "RX_CONFIG",
    "min": "0",
    "max": "UINT8_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "rc_smoothing_feedforward_cutoff",
    "type": "UINT8",
    "lookup": null,
    "pg": "RX_CONFIG",
    "min": "0",
    "max": "UINT8_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "rc_smoothing_throttle_cutoff",
    "type": "UINT8",
    "lookup": null,
    "pg": "RX_CONFIG",
    "min": "0",
    "max": "UINT8_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "rc_smoothing_debug_axis",
    "type": "UINT8",
    "lookup": "RC_SMOOTHING_DEBUG",
    "pg": "RX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "fpv_mix_degrees",
    "type": "UINT8",
    "lookup": null,
    "pg": "RX_CONFIG",
    "min": "0",
    "max": "90",
    "array": false,
    "live": true
  },
  {
    "key": "max_aux_channels",
    "type": "UINT8",
    "lookup": null,
    "pg": "RX_CONFIG",
    "min": "0",
    "max": "MAX_AUX_CHANNEL_COUNT",
    "array": false,
    "live": false
  },
  {
    "key": "serialrx_provider",
    "type": "UINT8",
    "lookup": "SERIAL_RX",
    "pg": "RX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "serialrx_inverted",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "RX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "spektrum_sat_bind",
    "type": "UINT8",
    "lookup": null,
    "pg": "RX_CONFIG",
    "min": "SPEKTRUM_SAT_BIND_DISABLED",
    "max": "SPEKTRUM_SAT_BIND_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "spektrum_sat_bind_autoreset",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "RX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "srxl2_unit_id",
    "type": "UINT8",
    "lookup": null,
    "pg": "RX_CONFIG",
    "min": "0",
    "max": "0xf",
    "array": false,
    "live": false
  },
  {
    "key": "srxl2_baud_fast",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "RX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "sbus_baud_fast",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "RX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "crsf_use_negotiated_baud",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "RX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "airmode_start_throttle_percent",
    "type": "UINT8",
    "lookup": null,
    "pg": "RX_CONFIG",
    "min": "0",
    "max": "100",
    "array": false,
    "live": true
  },
  {
    "key": "rx_min_usec",
    "type": "UINT16",
    "lookup": null,
    "pg": "RX_CONFIG",
    "min": "PWM_PULSE_MIN",
    "max": "PWM_PULSE_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "rx_max_usec",
    "type": "UINT16",
    "lookup": null,
    "pg": "RX_CONFIG",
    "min": "PWM_PULSE_MIN",
    "max": "PWM_PULSE_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "serialrx_halfduplex",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "RX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "msp_override_channels_mask",
    "type": "UINT32",
    "lookup": null,
    "pg": "RX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "msp_override_failsafe",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "RX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "rx_spi_protocol",
    "type": "UINT8",
    "lookup": "RX_SPI",
    "pg": "RX_SPI_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "rx_spi_bus",
    "type": "UINT8",
    "lookup": null,
    "pg": "RX_SPI_CONFIG",
    "min": "0",
    "max": "SPIDEV_COUNT",
    "array": false,
    "live": false
  },
  {
    "key": "rx_spi_led_inversion",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "RX_SPI_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "adc_device",
    "type": "INT8",
    "lookup": null,
    "pg": "ADC_CONFIG",
    "min": "0",
    "max": "ADCDEV_COUNT",
    "array": false,
    "live": false
  },
  {
    "key": "adc_vrefint_calibration",
    "type": "UINT16",
    "lookup": null,
    "pg": "ADC_CONFIG",
    "min": "0",
    "max": "2000",
    "array": false,
    "live": false
  },
  {
    "key": "adc_tempsensor_calibration30",
    "type": "UINT16",
    "lookup": null,
    "pg": "ADC_CONFIG",
    "min": "0",
    "max": "2000",
    "array": false,
    "live": false
  },
  {
    "key": "adc_tempsensor_calibration110",
    "type": "UINT16",
    "lookup": null,
    "pg": "ADC_CONFIG",
    "min": "0",
    "max": "2000",
    "array": false,
    "live": false
  },
  {
    "key": "input_filtering_mode",
    "type": "INT8",
    "lookup": "OFF_ON",
    "pg": "PWM_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "blackbox_sample_rate",
    "type": "UINT8",
    "lookup": "BLACKBOX_SAMPLE_RATE",
    "pg": "BLACKBOX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "blackbox_device",
    "type": "UINT8",
    "lookup": "BLACKBOX_DEVICE",
    "pg": "BLACKBOX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "blackbox_disable_pids",
    "type": "UINT32",
    "lookup": null,
    "pg": "BLACKBOX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "blackbox_disable_rc",
    "type": "UINT32",
    "lookup": null,
    "pg": "BLACKBOX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "blackbox_disable_setpoint",
    "type": "UINT32",
    "lookup": null,
    "pg": "BLACKBOX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "blackbox_disable_bat",
    "type": "UINT32",
    "lookup": null,
    "pg": "BLACKBOX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "blackbox_disable_mag",
    "type": "UINT32",
    "lookup": null,
    "pg": "BLACKBOX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "blackbox_disable_alt",
    "type": "UINT32",
    "lookup": null,
    "pg": "BLACKBOX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "blackbox_disable_rssi",
    "type": "UINT32",
    "lookup": null,
    "pg": "BLACKBOX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "blackbox_disable_gyro",
    "type": "UINT32",
    "lookup": null,
    "pg": "BLACKBOX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "blackbox_disable_gyrounfilt",
    "type": "UINT32",
    "lookup": null,
    "pg": "BLACKBOX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "blackbox_disable_acc",
    "type": "UINT32",
    "lookup": null,
    "pg": "BLACKBOX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "blackbox_disable_debug",
    "type": "UINT32",
    "lookup": null,
    "pg": "BLACKBOX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "blackbox_disable_motors",
    "type": "UINT32",
    "lookup": null,
    "pg": "BLACKBOX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "blackbox_disable_rpm",
    "type": "UINT32",
    "lookup": null,
    "pg": "BLACKBOX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "blackbox_disable_gps",
    "type": "UINT32",
    "lookup": null,
    "pg": "BLACKBOX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "blackbox_mode",
    "type": "UINT8",
    "lookup": "BLACKBOX_MODE",
    "pg": "BLACKBOX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "blackbox_high_resolution",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "BLACKBOX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "min_throttle",
    "type": "UINT16",
    "lookup": null,
    "pg": "MOTOR_CONFIG",
    "min": "PWM_PULSE_MIN",
    "max": "PWM_PULSE_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "max_throttle",
    "type": "UINT16",
    "lookup": null,
    "pg": "MOTOR_CONFIG",
    "min": "PWM_PULSE_MIN",
    "max": "PWM_PULSE_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "min_command",
    "type": "UINT16",
    "lookup": null,
    "pg": "MOTOR_CONFIG",
    "min": "PWM_PULSE_MIN",
    "max": "PWM_PULSE_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "motor_kv",
    "type": "UINT16",
    "lookup": null,
    "pg": "MOTOR_CONFIG",
    "min": "1",
    "max": "40000",
    "array": false,
    "live": true
  },
  {
    "key": "dshot_idle_value",
    "type": "UINT16",
    "lookup": null,
    "pg": "MOTOR_CONFIG",
    "min": "0",
    "max": "2000",
    "array": false,
    "live": true
  },
  {
    "key": "dshot_burst",
    "type": "UINT8",
    "lookup": "OFF_ON_AUTO",
    "pg": "MOTOR_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "dshot_bidir",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "MOTOR_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "dshot_edt",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "MOTOR_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "dshot_bitbang",
    "type": "UINT8",
    "lookup": "OFF_ON_AUTO",
    "pg": "MOTOR_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "dshot_bitbang_timer",
    "type": "UINT8",
    "lookup": "DSHOT_BITBANGED_TIMER",
    "pg": "MOTOR_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "use_unsynced_pwm",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "MOTOR_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "motor_pwm_protocol",
    "type": "UINT8",
    "lookup": "MOTOR_PWM_PROTOCOL",
    "pg": "MOTOR_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "motor_pwm_rate",
    "type": "UINT16",
    "lookup": null,
    "pg": "MOTOR_CONFIG",
    "min": "200",
    "max": "32000",
    "array": false,
    "live": false
  },
  {
    "key": "motor_pwm_inversion",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "MOTOR_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "motor_poles",
    "type": "UINT8",
    "lookup": null,
    "pg": "MOTOR_CONFIG",
    "min": "4",
    "max": "UINT8_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "motor_output_reordering",
    "type": "UINT8",
    "lookup": null,
    "pg": "MOTOR_CONFIG",
    "min": null,
    "max": null,
    "array": true,
    "live": false
  },
  {
    "key": "thr_corr_value",
    "type": "UINT8",
    "lookup": null,
    "pg": "THROTTLE_CORRECTION_CONFIG",
    "min": "0",
    "max": "150",
    "array": false,
    "live": false
  },
  {
    "key": "thr_corr_angle",
    "type": "UINT16",
    "lookup": null,
    "pg": "THROTTLE_CORRECTION_CONFIG",
    "min": "1",
    "max": "900",
    "array": false,
    "live": false
  },
  {
    "key": "failsafe_delay",
    "type": "UINT8",
    "lookup": null,
    "pg": "FAILSAFE_CONFIG",
    "min": "PERIOD_RXDATA_RECOVERY / MILLIS_PER_TENTH_SECOND",
    "max": "200",
    "array": false,
    "live": false
  },
  {
    "key": "failsafe_off_delay",
    "type": "UINT8",
    "lookup": null,
    "pg": "FAILSAFE_CONFIG",
    "min": "0",
    "max": "200",
    "array": false,
    "live": false
  },
  {
    "key": "failsafe_throttle",
    "type": "UINT16",
    "lookup": null,
    "pg": "FAILSAFE_CONFIG",
    "min": "PWM_PULSE_MIN",
    "max": "PWM_PULSE_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "failsafe_switch_mode",
    "type": "UINT8",
    "lookup": "FAILSAFE_SWITCH_MODE",
    "pg": "FAILSAFE_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "failsafe_throttle_low_delay",
    "type": "UINT16",
    "lookup": null,
    "pg": "FAILSAFE_CONFIG",
    "min": "0",
    "max": "300",
    "array": false,
    "live": false
  },
  {
    "key": "failsafe_procedure",
    "type": "UINT8",
    "lookup": "FAILSAFE",
    "pg": "FAILSAFE_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "failsafe_recovery_delay",
    "type": "UINT16",
    "lookup": null,
    "pg": "FAILSAFE_CONFIG",
    "min": "1",
    "max": "200",
    "array": false,
    "live": false
  },
  {
    "key": "failsafe_stick_threshold",
    "type": "UINT8",
    "lookup": null,
    "pg": "FAILSAFE_CONFIG",
    "min": "0",
    "max": "50",
    "array": false,
    "live": false
  },
  {
    "key": "align_board_roll",
    "type": "INT16",
    "lookup": null,
    "pg": "BOARD_ALIGNMENT",
    "min": "-180",
    "max": "360",
    "array": false,
    "live": false
  },
  {
    "key": "align_board_pitch",
    "type": "INT16",
    "lookup": null,
    "pg": "BOARD_ALIGNMENT",
    "min": "-180",
    "max": "360",
    "array": false,
    "live": false
  },
  {
    "key": "align_board_yaw",
    "type": "INT16",
    "lookup": null,
    "pg": "BOARD_ALIGNMENT",
    "min": "-180",
    "max": "360",
    "array": false,
    "live": false
  },
  {
    "key": "gimbal_mode",
    "type": "UINT8",
    "lookup": "GIMBAL_MODE",
    "pg": "GIMBAL_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "bat_capacity",
    "type": "UINT16",
    "lookup": null,
    "pg": "BATTERY_CONFIG",
    "min": "0",
    "max": "20000",
    "array": false,
    "live": false
  },
  {
    "key": "vbat_max_cell_voltage",
    "type": "UINT16",
    "lookup": null,
    "pg": "BATTERY_CONFIG",
    "min": "VBAT_CELL_VOTAGE_RANGE_MIN",
    "max": "VBAT_CELL_VOTAGE_RANGE_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "vbat_full_cell_voltage",
    "type": "UINT16",
    "lookup": null,
    "pg": "BATTERY_CONFIG",
    "min": "VBAT_CELL_VOTAGE_RANGE_MIN",
    "max": "VBAT_CELL_VOTAGE_RANGE_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "vbat_min_cell_voltage",
    "type": "UINT16",
    "lookup": null,
    "pg": "BATTERY_CONFIG",
    "min": "VBAT_CELL_VOTAGE_RANGE_MIN",
    "max": "VBAT_CELL_VOTAGE_RANGE_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "vbat_warning_cell_voltage",
    "type": "UINT16",
    "lookup": null,
    "pg": "BATTERY_CONFIG",
    "min": "VBAT_CELL_VOTAGE_RANGE_MIN",
    "max": "VBAT_CELL_VOTAGE_RANGE_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "vbat_hysteresis",
    "type": "UINT8",
    "lookup": null,
    "pg": "BATTERY_CONFIG",
    "min": "0",
    "max": "250",
    "array": false,
    "live": false
  },
  {
    "key": "current_meter",
    "type": "UINT8",
    "lookup": "CURRENT_METER",
    "pg": "BATTERY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "battery_meter",
    "type": "UINT8",
    "lookup": "VOLTAGE_METER",
    "pg": "BATTERY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "vbat_detect_cell_voltage",
    "type": "UINT16",
    "lookup": null,
    "pg": "BATTERY_CONFIG",
    "min": "0",
    "max": "2000",
    "array": false,
    "live": false
  },
  {
    "key": "use_vbat_alerts",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "BATTERY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "use_cbat_alerts",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "BATTERY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "cbat_alert_percent",
    "type": "UINT8",
    "lookup": null,
    "pg": "BATTERY_CONFIG",
    "min": "0",
    "max": "100",
    "array": false,
    "live": false
  },
  {
    "key": "vbat_cutoff_percent",
    "type": "UINT8",
    "lookup": null,
    "pg": "BATTERY_CONFIG",
    "min": "0",
    "max": "100",
    "array": false,
    "live": false
  },
  {
    "key": "force_battery_cell_count",
    "type": "UINT8",
    "lookup": null,
    "pg": "BATTERY_CONFIG",
    "min": "0",
    "max": "24",
    "array": false,
    "live": false
  },
  {
    "key": "vbat_display_lpf_period",
    "type": "UINT8",
    "lookup": null,
    "pg": "BATTERY_CONFIG",
    "min": "1",
    "max": "UINT8_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "vbat_sag_lpf_period",
    "type": "UINT8",
    "lookup": null,
    "pg": "BATTERY_CONFIG",
    "min": "1",
    "max": "UINT8_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "ibat_lpf_period",
    "type": "UINT8",
    "lookup": null,
    "pg": "BATTERY_CONFIG",
    "min": "0",
    "max": "UINT8_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "vbat_duration_for_warning",
    "type": "UINT8",
    "lookup": null,
    "pg": "BATTERY_CONFIG",
    "min": "0",
    "max": "150",
    "array": false,
    "live": false
  },
  {
    "key": "vbat_duration_for_critical",
    "type": "UINT8",
    "lookup": null,
    "pg": "BATTERY_CONFIG",
    "min": "0",
    "max": "150",
    "array": false,
    "live": false
  },
  {
    "key": "vbat_scale",
    "type": "UINT8",
    "lookup": null,
    "pg": "VOLTAGE_SENSOR_ADC_CONFIG",
    "min": "VBAT_SCALE_MIN",
    "max": "VBAT_SCALE_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "vbat_divider",
    "type": "UINT8",
    "lookup": null,
    "pg": "VOLTAGE_SENSOR_ADC_CONFIG",
    "min": "VBAT_DIVIDER_MIN",
    "max": "VBAT_DIVIDER_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "vbat_multiplier",
    "type": "UINT8",
    "lookup": null,
    "pg": "VOLTAGE_SENSOR_ADC_CONFIG",
    "min": "VBAT_MULTIPLIER_MIN",
    "max": "VBAT_MULTIPLIER_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "ibata_scale",
    "type": "INT16",
    "lookup": null,
    "pg": "CURRENT_SENSOR_ADC_CONFIG",
    "min": "-16000",
    "max": "16000",
    "array": false,
    "live": false
  },
  {
    "key": "ibata_offset",
    "type": "INT16",
    "lookup": null,
    "pg": "CURRENT_SENSOR_ADC_CONFIG",
    "min": "-32000",
    "max": "32000",
    "array": false,
    "live": false
  },
  {
    "key": "ibatv_scale",
    "type": "INT16",
    "lookup": null,
    "pg": "CURRENT_SENSOR_VIRTUAL_CONFIG",
    "min": "-16000",
    "max": "16000",
    "array": false,
    "live": false
  },
  {
    "key": "ibatv_offset",
    "type": "UINT16",
    "lookup": null,
    "pg": "CURRENT_SENSOR_VIRTUAL_CONFIG",
    "min": "0",
    "max": "16000",
    "array": false,
    "live": false
  },
  {
    "key": "battery_continue",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "BATTERY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "beeper_inversion",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "BEEPER_DEV_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "beeper_od",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "BEEPER_DEV_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "beeper_frequency",
    "type": "INT16",
    "lookup": null,
    "pg": "BEEPER_DEV_CONFIG",
    "min": "0",
    "max": "16000",
    "array": false,
    "live": false
  },
  {
    "key": "beeper_dshot_beacon_tone",
    "type": "UINT8",
    "lookup": null,
    "pg": "BEEPER_CONFIG",
    "min": "1",
    "max": "DSHOT_CMD_BEACON5",
    "array": false,
    "live": false
  },
  {
    "key": "yaw_motors_reversed",
    "type": "INT8",
    "lookup": "OFF_ON",
    "pg": "MIXER_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "mixer_type",
    "type": "UINT8",
    "lookup": "MIXER_TYPE",
    "pg": "MIXER_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "crashflip_motor_percent",
    "type": "UINT8",
    "lookup": null,
    "pg": "MIXER_CONFIG",
    "min": "0",
    "max": "100",
    "array": false,
    "live": true
  },
  {
    "key": "crashflip_expo",
    "type": "UINT8",
    "lookup": null,
    "pg": "MIXER_CONFIG",
    "min": "0",
    "max": "100",
    "array": false,
    "live": true
  },
  {
    "key": "rpm_limit",
    "type": "INT8",
    "lookup": "OFF_ON",
    "pg": "MIXER_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "rpm_limit_p",
    "type": "UINT16",
    "lookup": null,
    "pg": "MIXER_CONFIG",
    "min": "0",
    "max": "100",
    "array": false,
    "live": false
  },
  {
    "key": "rpm_limit_i",
    "type": "UINT16",
    "lookup": null,
    "pg": "MIXER_CONFIG",
    "min": "0",
    "max": "1000",
    "array": false,
    "live": false
  },
  {
    "key": "rpm_limit_d",
    "type": "UINT16",
    "lookup": null,
    "pg": "MIXER_CONFIG",
    "min": "0",
    "max": "100",
    "array": false,
    "live": false
  },
  {
    "key": "rpm_limit_value",
    "type": "UINT16",
    "lookup": null,
    "pg": "MIXER_CONFIG",
    "min": "1",
    "max": "UINT16_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "3d_deadband_low",
    "type": "UINT16",
    "lookup": null,
    "pg": "MOTOR_3D_CONFIG",
    "min": "PWM_PULSE_MIN",
    "max": "PWM_RANGE_MIDDLE",
    "array": false,
    "live": false
  },
  {
    "key": "3d_deadband_high",
    "type": "UINT16",
    "lookup": null,
    "pg": "MOTOR_3D_CONFIG",
    "min": "PWM_RANGE_MIDDLE",
    "max": "PWM_PULSE_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "3d_neutral",
    "type": "UINT16",
    "lookup": null,
    "pg": "MOTOR_3D_CONFIG",
    "min": "PWM_PULSE_MIN",
    "max": "PWM_PULSE_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "3d_deadband_throttle",
    "type": "UINT16",
    "lookup": null,
    "pg": "MOTOR_3D_CONFIG",
    "min": "1",
    "max": "100",
    "array": false,
    "live": false
  },
  {
    "key": "3d_limit_low",
    "type": "UINT16",
    "lookup": null,
    "pg": "MOTOR_3D_CONFIG",
    "min": "PWM_PULSE_MIN",
    "max": "PWM_RANGE_MIDDLE",
    "array": false,
    "live": false
  },
  {
    "key": "3d_limit_high",
    "type": "UINT16",
    "lookup": null,
    "pg": "MOTOR_3D_CONFIG",
    "min": "PWM_RANGE_MIDDLE",
    "max": "PWM_PULSE_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "3d_switched_mode",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "MOTOR_3D_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "servo_center_pulse",
    "type": "UINT16",
    "lookup": null,
    "pg": "SERVO_CONFIG",
    "min": "PWM_PULSE_MIN",
    "max": "PWM_PULSE_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "servo_pwm_rate",
    "type": "UINT16",
    "lookup": null,
    "pg": "SERVO_CONFIG",
    "min": "50",
    "max": "498",
    "array": false,
    "live": false
  },
  {
    "key": "servo_lowpass_hz",
    "type": "UINT16",
    "lookup": null,
    "pg": "SERVO_CONFIG",
    "min": "0",
    "max": "400",
    "array": false,
    "live": false
  },
  {
    "key": "tri_unarmed_servo",
    "type": "INT8",
    "lookup": "OFF_ON",
    "pg": "SERVO_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "channel_forwarding_start",
    "type": "UINT8",
    "lookup": null,
    "pg": "SERVO_CONFIG",
    "min": "AUX1",
    "max": "MAX_SUPPORTED_RC_CHANNEL_COUNT",
    "array": false,
    "live": false
  },
  {
    "key": "rateprofile_name",
    "type": "UINT8",
    "lookup": null,
    "pg": "CONTROL_RATE_PROFILES",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "thr_mid",
    "type": "UINT8",
    "lookup": null,
    "pg": "CONTROL_RATE_PROFILES",
    "min": "0",
    "max": "100",
    "array": false,
    "live": true
  },
  {
    "key": "thr_expo",
    "type": "UINT8",
    "lookup": null,
    "pg": "CONTROL_RATE_PROFILES",
    "min": "0",
    "max": "100",
    "array": false,
    "live": true
  },
  {
    "key": "rates_type",
    "type": "UINT8",
    "lookup": "RATES_TYPE",
    "pg": "CONTROL_RATE_PROFILES",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "quickrates_rc_expo",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "CONTROL_RATE_PROFILES",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "roll_rc_rate",
    "type": "UINT8",
    "lookup": null,
    "pg": "CONTROL_RATE_PROFILES",
    "min": "1",
    "max": "CONTROL_RATE_CONFIG_RC_RATES_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "pitch_rc_rate",
    "type": "UINT8",
    "lookup": null,
    "pg": "CONTROL_RATE_PROFILES",
    "min": "1",
    "max": "CONTROL_RATE_CONFIG_RC_RATES_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "yaw_rc_rate",
    "type": "UINT8",
    "lookup": null,
    "pg": "CONTROL_RATE_PROFILES",
    "min": "1",
    "max": "CONTROL_RATE_CONFIG_RC_RATES_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "roll_expo",
    "type": "UINT8",
    "lookup": null,
    "pg": "CONTROL_RATE_PROFILES",
    "min": "0",
    "max": "CONTROL_RATE_CONFIG_RC_EXPO_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "pitch_expo",
    "type": "UINT8",
    "lookup": null,
    "pg": "CONTROL_RATE_PROFILES",
    "min": "0",
    "max": "CONTROL_RATE_CONFIG_RC_EXPO_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "yaw_expo",
    "type": "UINT8",
    "lookup": null,
    "pg": "CONTROL_RATE_PROFILES",
    "min": "0",
    "max": "CONTROL_RATE_CONFIG_RC_EXPO_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "roll_srate",
    "type": "UINT8",
    "lookup": null,
    "pg": "CONTROL_RATE_PROFILES",
    "min": "0",
    "max": "CONTROL_RATE_CONFIG_RATE_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "pitch_srate",
    "type": "UINT8",
    "lookup": null,
    "pg": "CONTROL_RATE_PROFILES",
    "min": "0",
    "max": "CONTROL_RATE_CONFIG_RATE_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "yaw_srate",
    "type": "UINT8",
    "lookup": null,
    "pg": "CONTROL_RATE_PROFILES",
    "min": "0",
    "max": "CONTROL_RATE_CONFIG_RATE_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "throttle_limit_type",
    "type": "UINT8",
    "lookup": "THROTTLE_LIMIT_TYPE",
    "pg": "CONTROL_RATE_PROFILES",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "throttle_limit_percent",
    "type": "UINT8",
    "lookup": null,
    "pg": "CONTROL_RATE_PROFILES",
    "min": "25",
    "max": "100",
    "array": false,
    "live": true
  },
  {
    "key": "roll_rate_limit",
    "type": "UINT16",
    "lookup": null,
    "pg": "CONTROL_RATE_PROFILES",
    "min": "CONTROL_RATE_CONFIG_RATE_LIMIT_MIN",
    "max": "CONTROL_RATE_CONFIG_RATE_LIMIT_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "pitch_rate_limit",
    "type": "UINT16",
    "lookup": null,
    "pg": "CONTROL_RATE_PROFILES",
    "min": "CONTROL_RATE_CONFIG_RATE_LIMIT_MIN",
    "max": "CONTROL_RATE_CONFIG_RATE_LIMIT_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "yaw_rate_limit",
    "type": "UINT16",
    "lookup": null,
    "pg": "CONTROL_RATE_PROFILES",
    "min": "CONTROL_RATE_CONFIG_RATE_LIMIT_MIN",
    "max": "CONTROL_RATE_CONFIG_RATE_LIMIT_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "reboot_character",
    "type": "UINT8",
    "lookup": null,
    "pg": "SERIAL_CONFIG",
    "min": "48",
    "max": "126",
    "array": false,
    "live": false
  },
  {
    "key": "serial_update_rate_hz",
    "type": "UINT16",
    "lookup": null,
    "pg": "SERIAL_CONFIG",
    "min": "100",
    "max": "2000",
    "array": false,
    "live": false
  },
  {
    "key": "imu_dcm_kp",
    "type": "UINT16",
    "lookup": null,
    "pg": "IMU_CONFIG",
    "min": "0",
    "max": "32000",
    "array": false,
    "live": false
  },
  {
    "key": "imu_dcm_ki",
    "type": "UINT16",
    "lookup": null,
    "pg": "IMU_CONFIG",
    "min": "0",
    "max": "32000",
    "array": false,
    "live": false
  },
  {
    "key": "small_angle",
    "type": "UINT8",
    "lookup": null,
    "pg": "IMU_CONFIG",
    "min": "0",
    "max": "180",
    "array": false,
    "live": false
  },
  {
    "key": "imu_process_denom",
    "type": "UINT8",
    "lookup": null,
    "pg": "IMU_CONFIG",
    "min": "1",
    "max": "4",
    "array": false,
    "live": false
  },
  {
    "key": "mag_declination",
    "type": "UINT16",
    "lookup": null,
    "pg": "IMU_CONFIG",
    "min": "0",
    "max": "3599",
    "array": false,
    "live": false
  },
  {
    "key": "auto_disarm_delay",
    "type": "UINT8",
    "lookup": null,
    "pg": "ARMING_CONFIG",
    "min": "0",
    "max": "60",
    "array": false,
    "live": false
  },
  {
    "key": "gyro_cal_on_first_arm",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "ARMING_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "gps_provider",
    "type": "UINT8",
    "lookup": "GPS_PROVIDER",
    "pg": "GPS_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "gps_sbas_mode",
    "type": "UINT8",
    "lookup": "GPS_SBAS_MODE",
    "pg": "GPS_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "gps_auto_config",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "GPS_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "gps_auto_baud",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "GPS_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "gps_ublox_acquire_model",
    "type": "UINT8",
    "lookup": "GPS_UBLOX_MODELS",
    "pg": "GPS_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "gps_ublox_flight_model",
    "type": "UINT8",
    "lookup": "GPS_UBLOX_MODELS",
    "pg": "GPS_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "gps_update_rate_hz",
    "type": "UINT8",
    "lookup": null,
    "pg": "GPS_CONFIG",
    "min": "1",
    "max": "20",
    "array": false,
    "live": false
  },
  {
    "key": "gps_ublox_utc_standard",
    "type": "UINT8",
    "lookup": "GPS_UBLOX_UTC_STANDARD",
    "pg": "GPS_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "gps_ublox_use_galileo",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "GPS_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "gps_set_home_point_once",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "GPS_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "gps_use_3d_speed",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "GPS_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "gps_sbas_integrity",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "GPS_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "gps_nmea_custom_commands",
    "type": "UINT8",
    "lookup": null,
    "pg": "GPS_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_min_start_dist",
    "type": "UINT16",
    "lookup": null,
    "pg": "GPS_RESCUE",
    "min": "10",
    "max": "30",
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_alt_mode",
    "type": "UINT8",
    "lookup": "GPS_RESCUE_ALT_MODE",
    "pg": "GPS_RESCUE",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_initial_climb",
    "type": "UINT16",
    "lookup": null,
    "pg": "GPS_RESCUE",
    "min": "0",
    "max": "100",
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_ascend_rate",
    "type": "UINT16",
    "lookup": null,
    "pg": "GPS_RESCUE",
    "min": "50",
    "max": "2500",
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_return_alt",
    "type": "UINT16",
    "lookup": null,
    "pg": "GPS_RESCUE",
    "min": "5",
    "max": "1000",
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_ground_speed",
    "type": "UINT16",
    "lookup": null,
    "pg": "GPS_RESCUE",
    "min": "0",
    "max": "3000",
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_max_angle",
    "type": "UINT8",
    "lookup": null,
    "pg": "GPS_RESCUE",
    "min": "30",
    "max": "60",
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_roll_mix",
    "type": "UINT8",
    "lookup": null,
    "pg": "GPS_RESCUE",
    "min": "0",
    "max": "250",
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_pitch_cutoff",
    "type": "UINT8",
    "lookup": null,
    "pg": "GPS_RESCUE",
    "min": "10",
    "max": "255",
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_imu_yaw_gain",
    "type": "UINT8",
    "lookup": null,
    "pg": "GPS_RESCUE",
    "min": "5",
    "max": "20",
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_descent_dist",
    "type": "UINT16",
    "lookup": null,
    "pg": "GPS_RESCUE",
    "min": "10",
    "max": "500",
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_descend_rate",
    "type": "UINT16",
    "lookup": null,
    "pg": "GPS_RESCUE",
    "min": "25",
    "max": "500",
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_landing_alt",
    "type": "UINT8",
    "lookup": null,
    "pg": "GPS_RESCUE",
    "min": "1",
    "max": "15",
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_disarm_threshold",
    "type": "UINT8",
    "lookup": null,
    "pg": "GPS_RESCUE",
    "min": "1",
    "max": "250",
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_throttle_min",
    "type": "UINT16",
    "lookup": null,
    "pg": "GPS_RESCUE",
    "min": "1000",
    "max": "2000",
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_throttle_max",
    "type": "UINT16",
    "lookup": null,
    "pg": "GPS_RESCUE",
    "min": "1000",
    "max": "2000",
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_throttle_hover",
    "type": "UINT16",
    "lookup": null,
    "pg": "GPS_RESCUE",
    "min": "1000",
    "max": "2000",
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_sanity_checks",
    "type": "UINT8",
    "lookup": "GPS_RESCUE_SANITY_CHECK",
    "pg": "GPS_RESCUE",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_min_sats",
    "type": "UINT8",
    "lookup": null,
    "pg": "GPS_RESCUE",
    "min": "5",
    "max": "50",
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_allow_arming_without_fix",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "GPS_RESCUE",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_throttle_p",
    "type": "UINT8",
    "lookup": null,
    "pg": "GPS_RESCUE",
    "min": "0",
    "max": "255",
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_throttle_i",
    "type": "UINT8",
    "lookup": null,
    "pg": "GPS_RESCUE",
    "min": "0",
    "max": "255",
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_throttle_d",
    "type": "UINT8",
    "lookup": null,
    "pg": "GPS_RESCUE",
    "min": "0",
    "max": "255",
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_velocity_p",
    "type": "UINT8",
    "lookup": null,
    "pg": "GPS_RESCUE",
    "min": "0",
    "max": "255",
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_velocity_i",
    "type": "UINT8",
    "lookup": null,
    "pg": "GPS_RESCUE",
    "min": "0",
    "max": "255",
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_velocity_d",
    "type": "UINT8",
    "lookup": null,
    "pg": "GPS_RESCUE",
    "min": "0",
    "max": "255",
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_yaw_p",
    "type": "UINT8",
    "lookup": null,
    "pg": "GPS_RESCUE",
    "min": "0",
    "max": "255",
    "array": false,
    "live": false
  },
  {
    "key": "gps_rescue_use_mag",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "GPS_RESCUE",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "gps_lap_timer_gate_lat",
    "type": "UINT8",
    "lookup": null,
    "pg": "GPS_LAP_TIMER",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "gps_lap_timer_gate_lon",
    "type": "UINT8",
    "lookup": null,
    "pg": "GPS_LAP_TIMER",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "gps_lap_timer_min_lap_time_s",
    "type": "UINT16",
    "lookup": null,
    "pg": "GPS_LAP_TIMER",
    "min": "0",
    "max": "3000",
    "array": false,
    "live": false
  },
  {
    "key": "gps_lap_timer_gate_tolerance_m",
    "type": "UINT8",
    "lookup": null,
    "pg": "GPS_LAP_TIMER",
    "min": "1",
    "max": "100",
    "array": false,
    "live": false
  },
  {
    "key": "deadband",
    "type": "UINT8",
    "lookup": null,
    "pg": "RC_CONTROLS_CONFIG",
    "min": "0",
    "max": "32",
    "array": false,
    "live": false
  },
  {
    "key": "yaw_deadband",
    "type": "UINT8",
    "lookup": null,
    "pg": "RC_CONTROLS_CONFIG",
    "min": "0",
    "max": "100",
    "array": false,
    "live": false
  },
  {
    "key": "yaw_control_reversed",
    "type": "INT8",
    "lookup": "OFF_ON",
    "pg": "RC_CONTROLS_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "pid_process_denom",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_CONFIG",
    "min": "1",
    "max": "MAX_PID_PROCESS_DENOM",
    "array": false,
    "live": true
  },
  {
    "key": "runaway_takeoff_prevention",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "PID_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "runaway_takeoff_deactivate_delay",
    "type": "UINT16",
    "lookup": null,
    "pg": "PID_CONFIG",
    "min": "100",
    "max": "1000",
    "array": false,
    "live": false
  },
  {
    "key": "runaway_takeoff_deactivate_throttle_percent",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_CONFIG",
    "min": "0",
    "max": "100",
    "array": false,
    "live": false
  },
  {
    "key": "profile_name",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "dterm_lpf1_dyn_min_hz",
    "type": "UINT16",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "DYN_LPF_MAX_HZ",
    "array": false,
    "live": true
  },
  {
    "key": "dterm_lpf1_dyn_max_hz",
    "type": "UINT16",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "DYN_LPF_MAX_HZ",
    "array": false,
    "live": true
  },
  {
    "key": "dterm_lpf1_dyn_expo",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "10",
    "array": false,
    "live": true
  },
  {
    "key": "dterm_lpf1_type",
    "type": "UINT8",
    "lookup": "DTERM_LPF_TYPE",
    "pg": "PID_PROFILE",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "dterm_lpf1_static_hz",
    "type": "INT16",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "LPF_MAX_HZ",
    "array": false,
    "live": true
  },
  {
    "key": "dterm_lpf2_type",
    "type": "UINT8",
    "lookup": "DTERM_LPF_TYPE",
    "pg": "PID_PROFILE",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "dterm_lpf2_static_hz",
    "type": "INT16",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "LPF_MAX_HZ",
    "array": false,
    "live": true
  },
  {
    "key": "dterm_notch_hz",
    "type": "UINT16",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "LPF_MAX_HZ",
    "array": false,
    "live": true
  },
  {
    "key": "dterm_notch_cutoff",
    "type": "UINT16",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "LPF_MAX_HZ",
    "array": false,
    "live": true
  },
  {
    "key": "vbat_sag_compensation",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "150",
    "array": false,
    "live": true
  },
  {
    "key": "pid_at_min_throttle",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "PID_PROFILE",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "anti_gravity_gain",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "ITERM_ACCELERATOR_GAIN_OFF",
    "max": "ITERM_ACCELERATOR_GAIN_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "anti_gravity_cutoff_hz",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "2",
    "max": "50",
    "array": false,
    "live": true
  },
  {
    "key": "anti_gravity_p_gain",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "250",
    "array": false,
    "live": true
  },
  {
    "key": "acc_limit_yaw",
    "type": "UINT16",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "500",
    "array": false,
    "live": true
  },
  {
    "key": "acc_limit",
    "type": "UINT16",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "500",
    "array": false,
    "live": true
  },
  {
    "key": "crash_dthreshold",
    "type": "UINT16",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "10",
    "max": "2000",
    "array": false,
    "live": true
  },
  {
    "key": "crash_gthreshold",
    "type": "UINT16",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "100",
    "max": "2000",
    "array": false,
    "live": true
  },
  {
    "key": "crash_setpoint_threshold",
    "type": "UINT16",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "50",
    "max": "2000",
    "array": false,
    "live": true
  },
  {
    "key": "crash_time",
    "type": "UINT16",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "100",
    "max": "5000",
    "array": false,
    "live": true
  },
  {
    "key": "crash_delay",
    "type": "UINT16",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "500",
    "array": false,
    "live": true
  },
  {
    "key": "crash_recovery_angle",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "5",
    "max": "30",
    "array": false,
    "live": true
  },
  {
    "key": "crash_recovery_rate",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "50",
    "max": "255",
    "array": false,
    "live": true
  },
  {
    "key": "crash_limit_yaw",
    "type": "UINT16",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "1000",
    "array": false,
    "live": true
  },
  {
    "key": "crash_recovery",
    "type": "UINT8",
    "lookup": "CRASH_RECOVERY",
    "pg": "PID_PROFILE",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "iterm_rotation",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "PID_PROFILE",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "iterm_relax",
    "type": "UINT8",
    "lookup": "ITERM_RELAX",
    "pg": "PID_PROFILE",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "iterm_relax_type",
    "type": "UINT8",
    "lookup": "ITERM_RELAX_TYPE",
    "pg": "PID_PROFILE",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "iterm_relax_cutoff",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "1",
    "max": "50",
    "array": false,
    "live": true
  },
  {
    "key": "iterm_windup",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "30",
    "max": "100",
    "array": false,
    "live": true
  },
  {
    "key": "iterm_limit",
    "type": "UINT16",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "500",
    "array": false,
    "live": true
  },
  {
    "key": "pidsum_limit",
    "type": "UINT16",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "PIDSUM_LIMIT_MIN",
    "max": "PIDSUM_LIMIT_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "pidsum_limit_yaw",
    "type": "UINT16",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "PIDSUM_LIMIT_MIN",
    "max": "PIDSUM_LIMIT_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "yaw_lowpass_hz",
    "type": "UINT16",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "500",
    "array": false,
    "live": true
  },
  {
    "key": "throttle_boost",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "100",
    "array": false,
    "live": true
  },
  {
    "key": "throttle_boost_cutoff",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "5",
    "max": "50",
    "array": false,
    "live": true
  },
  {
    "key": "acro_trainer_angle_limit",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "10",
    "max": "80",
    "array": false,
    "live": false
  },
  {
    "key": "acro_trainer_lookahead_ms",
    "type": "UINT16",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "10",
    "max": "200",
    "array": false,
    "live": false
  },
  {
    "key": "acro_trainer_debug_axis",
    "type": "UINT8",
    "lookup": "ACRO_TRAINER_DEBUG",
    "pg": "PID_PROFILE",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "acro_trainer_gain",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "25",
    "max": "255",
    "array": false,
    "live": false
  },
  {
    "key": "p_pitch",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "PID_GAIN_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "i_pitch",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "PID_GAIN_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "d_pitch",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "PID_GAIN_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "f_pitch",
    "type": "UINT16",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "F_GAIN_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "p_roll",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "PID_GAIN_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "i_roll",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "PID_GAIN_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "d_roll",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "PID_GAIN_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "f_roll",
    "type": "UINT16",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "F_GAIN_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "p_yaw",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "PID_GAIN_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "i_yaw",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "PID_GAIN_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "d_yaw",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "PID_GAIN_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "f_yaw",
    "type": "UINT16",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "F_GAIN_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "angle_p_gain",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "200",
    "array": false,
    "live": true
  },
  {
    "key": "angle_feedforward",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "200",
    "array": false,
    "live": true
  },
  {
    "key": "angle_feedforward_smoothing_ms",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "10",
    "max": "250",
    "array": false,
    "live": true
  },
  {
    "key": "angle_limit",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "10",
    "max": "85",
    "array": false,
    "live": true
  },
  {
    "key": "angle_earth_ref",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "100",
    "array": false,
    "live": true
  },
  {
    "key": "horizon_level_strength",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "100",
    "array": false,
    "live": true
  },
  {
    "key": "horizon_limit_sticks",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "10",
    "max": "200",
    "array": false,
    "live": true
  },
  {
    "key": "horizon_limit_degrees",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "10",
    "max": "250",
    "array": false,
    "live": true
  },
  {
    "key": "horizon_ignore_sticks",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "PID_PROFILE",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "horizon_delay_ms",
    "type": "UINT16",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "10",
    "max": "5000",
    "array": false,
    "live": true
  },
  {
    "key": "abs_control_gain",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "20",
    "array": false,
    "live": true
  },
  {
    "key": "abs_control_limit",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "10",
    "max": "255",
    "array": false,
    "live": true
  },
  {
    "key": "abs_control_error_limit",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "1",
    "max": "45",
    "array": false,
    "live": true
  },
  {
    "key": "abs_control_cutoff",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "1",
    "max": "45",
    "array": false,
    "live": true
  },
  {
    "key": "use_integrated_yaw",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "PID_PROFILE",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "integrated_yaw_relax",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "255",
    "array": false,
    "live": true
  },
  {
    "key": "d_min_roll",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "D_MIN_GAIN_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "d_min_pitch",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "D_MIN_GAIN_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "d_min_yaw",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "D_MIN_GAIN_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "d_max_gain",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "100",
    "array": false,
    "live": true
  },
  {
    "key": "d_max_advance",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "200",
    "array": false,
    "live": true
  },
  {
    "key": "motor_output_limit",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "MOTOR_OUTPUT_LIMIT_PERCENT_MIN",
    "max": "MOTOR_OUTPUT_LIMIT_PERCENT_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "auto_profile_cell_count",
    "type": "INT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "AUTO_PROFILE_CELL_COUNT_CHANGE",
    "max": "MAX_AUTO_DETECT_CELL_COUNT",
    "array": false,
    "live": false
  },
  {
    "key": "launch_control_mode",
    "type": "UINT8",
    "lookup": "LAUNCH_CONTROL_MODE",
    "pg": "PID_PROFILE",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "launch_trigger_allow_reset",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "PID_PROFILE",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "launch_trigger_throttle_percent",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "LAUNCH_CONTROL_THROTTLE_TRIGGER_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "launch_angle_limit",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "80",
    "array": false,
    "live": false
  },
  {
    "key": "launch_control_gain",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "200",
    "array": false,
    "live": false
  },
  {
    "key": "thrust_linear",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "150",
    "array": false,
    "live": true
  },
  {
    "key": "transient_throttle_limit",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "30",
    "array": false,
    "live": true
  },
  {
    "key": "feedforward_transition",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "100",
    "array": false,
    "live": true
  },
  {
    "key": "feedforward_averaging",
    "type": "UINT8",
    "lookup": "FEEDFORWARD_AVERAGING",
    "pg": "PID_PROFILE",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "feedforward_smooth_factor",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "95",
    "array": false,
    "live": true
  },
  {
    "key": "feedforward_jitter_factor",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "20",
    "array": false,
    "live": true
  },
  {
    "key": "feedforward_boost",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "50",
    "array": false,
    "live": true
  },
  {
    "key": "feedforward_max_rate_limit",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "200",
    "array": false,
    "live": true
  },
  {
    "key": "dyn_idle_min_rpm",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "200",
    "array": false,
    "live": true
  },
  {
    "key": "dyn_idle_p_gain",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "1",
    "max": "250",
    "array": false,
    "live": true
  },
  {
    "key": "dyn_idle_i_gain",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "1",
    "max": "250",
    "array": false,
    "live": true
  },
  {
    "key": "dyn_idle_d_gain",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "250",
    "array": false,
    "live": true
  },
  {
    "key": "dyn_idle_max_increase",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "10",
    "max": "255",
    "array": false,
    "live": true
  },
  {
    "key": "dyn_idle_start_increase",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "10",
    "max": "255",
    "array": false,
    "live": true
  },
  {
    "key": "level_race_mode",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "PID_PROFILE",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "simplified_pids_mode",
    "type": "UINT8",
    "lookup": "SIMPLIFIED_TUNING_PIDS_MODE",
    "pg": "PID_PROFILE",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "simplified_master_multiplier",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "SIMPLIFIED_TUNING_PIDS_MIN",
    "max": "SIMPLIFIED_TUNING_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "simplified_i_gain",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "SIMPLIFIED_TUNING_PIDS_MIN",
    "max": "SIMPLIFIED_TUNING_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "simplified_d_gain",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "SIMPLIFIED_TUNING_PIDS_MIN",
    "max": "SIMPLIFIED_TUNING_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "simplified_pi_gain",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "SIMPLIFIED_TUNING_PIDS_MIN",
    "max": "SIMPLIFIED_TUNING_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "simplified_dmax_gain",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "SIMPLIFIED_TUNING_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "simplified_feedforward_gain",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "SIMPLIFIED_TUNING_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "simplified_pitch_d_gain",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "SIMPLIFIED_TUNING_PIDS_MIN",
    "max": "SIMPLIFIED_TUNING_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "simplified_pitch_pi_gain",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "SIMPLIFIED_TUNING_PIDS_MIN",
    "max": "SIMPLIFIED_TUNING_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "simplified_dterm_filter",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "PID_PROFILE",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "simplified_dterm_filter_multiplier",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "SIMPLIFIED_TUNING_FILTERS_MIN",
    "max": "SIMPLIFIED_TUNING_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "simplified_gyro_filter",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "GYRO_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "simplified_gyro_filter_multiplier",
    "type": "UINT8",
    "lookup": null,
    "pg": "GYRO_CONFIG",
    "min": "SIMPLIFIED_TUNING_FILTERS_MIN",
    "max": "SIMPLIFIED_TUNING_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "tpa_mode",
    "type": "UINT8",
    "lookup": "TPA_MODE",
    "pg": "PID_PROFILE",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "tpa_rate",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "TPA_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "tpa_breakpoint",
    "type": "UINT16",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "PWM_RANGE_MIN",
    "max": "PWM_RANGE_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "tpa_low_rate",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "TPA_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "tpa_low_breakpoint",
    "type": "UINT16",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "PWM_RANGE_MIN",
    "max": "PWM_RANGE_MAX",
    "array": false,
    "live": true
  },
  {
    "key": "tpa_low_always",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "PID_PROFILE",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "ez_landing_threshold",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "200",
    "array": false,
    "live": true
  },
  {
    "key": "ez_landing_limit",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "75",
    "array": false,
    "live": true
  },
  {
    "key": "ez_landing_speed",
    "type": "UINT8",
    "lookup": null,
    "pg": "PID_PROFILE",
    "min": "0",
    "max": "250",
    "array": false,
    "live": true
  },
  {
    "key": "tlm_inverted",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "tlm_halfduplex",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "frsky_default_lat",
    "type": "INT16",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": "-9000",
    "max": "9000",
    "array": false,
    "live": false
  },
  {
    "key": "frsky_default_long",
    "type": "INT16",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": "-18000",
    "max": "18000",
    "array": false,
    "live": false
  },
  {
    "key": "frsky_gps_format",
    "type": "UINT8",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": "0",
    "max": "FRSKY_FORMAT_NMEA",
    "array": false,
    "live": false
  },
  {
    "key": "frsky_unit",
    "type": "UINT8",
    "lookup": "UNIT",
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "frsky_vfas_precision",
    "type": "UINT8",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": "FRSKY_VFAS_PRECISION_LOW",
    "max": "FRSKY_VFAS_PRECISION_HIGH",
    "array": false,
    "live": false
  },
  {
    "key": "hott_alarm_int",
    "type": "UINT8",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": "0",
    "max": "120",
    "array": false,
    "live": false
  },
  {
    "key": "pid_in_tlm",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "report_cell_voltage",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "ibus_sensor",
    "type": "UINT8",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": true,
    "live": false
  },
  {
    "key": "mavlink_mah_as_heading_divisor",
    "type": "UINT16",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": "0",
    "max": "30000",
    "array": false,
    "live": false
  },
  {
    "key": "telemetry_disabled_voltage",
    "type": "UINT32",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "telemetry_disabled_current",
    "type": "UINT32",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "telemetry_disabled_fuel",
    "type": "UINT32",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "telemetry_disabled_mode",
    "type": "UINT32",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "telemetry_disabled_acc_x",
    "type": "UINT32",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "telemetry_disabled_acc_y",
    "type": "UINT32",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "telemetry_disabled_acc_z",
    "type": "UINT32",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "telemetry_disabled_pitch",
    "type": "UINT32",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "telemetry_disabled_roll",
    "type": "UINT32",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "telemetry_disabled_heading",
    "type": "UINT32",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "telemetry_disabled_altitude",
    "type": "UINT32",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "telemetry_disabled_vario",
    "type": "UINT32",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "telemetry_disabled_lat_long",
    "type": "UINT32",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "telemetry_disabled_ground_speed",
    "type": "UINT32",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "telemetry_disabled_distance",
    "type": "UINT32",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "telemetry_disabled_esc_current",
    "type": "UINT32",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "telemetry_disabled_esc_voltage",
    "type": "UINT32",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "telemetry_disabled_esc_rpm",
    "type": "UINT32",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "telemetry_disabled_esc_temperature",
    "type": "UINT32",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "telemetry_disabled_temperature",
    "type": "UINT32",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "telemetry_disabled_cap_used",
    "type": "UINT32",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "telemetry_disabled_sensors",
    "type": "UINT32",
    "lookup": null,
    "pg": "TELEMETRY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "ledstrip_visual_beeper",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "LED_STRIP_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "ledstrip_visual_beeper_color",
    "type": "UINT8",
    "lookup": "LEDSTRIP_COLOR",
    "pg": "LED_STRIP_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "ledstrip_grb_rgb",
    "type": "UINT8",
    "lookup": "RGB_GRB",
    "pg": "LED_STRIP_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "ledstrip_profile",
    "type": "UINT8",
    "lookup": "LED_PROFILE",
    "pg": "LED_STRIP_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "ledstrip_race_color",
    "type": "UINT8",
    "lookup": "LEDSTRIP_COLOR",
    "pg": "LED_STRIP_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "ledstrip_beacon_color",
    "type": "UINT8",
    "lookup": "LEDSTRIP_COLOR",
    "pg": "LED_STRIP_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "ledstrip_beacon_period_ms",
    "type": "UINT16",
    "lookup": null,
    "pg": "LED_STRIP_CONFIG",
    "min": "50",
    "max": "10000",
    "array": false,
    "live": false
  },
  {
    "key": "ledstrip_beacon_percent",
    "type": "UINT8",
    "lookup": null,
    "pg": "LED_STRIP_CONFIG",
    "min": "0",
    "max": "100",
    "array": false,
    "live": false
  },
  {
    "key": "ledstrip_beacon_armed_only",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "LED_STRIP_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "ledstrip_brightness",
    "type": "UINT8",
    "lookup": null,
    "pg": "LED_STRIP_CONFIG",
    "min": "5",
    "max": "100",
    "array": false,
    "live": false
  },
  {
    "key": "ledstrip_rainbow_delta",
    "type": "UINT16",
    "lookup": null,
    "pg": "LED_STRIP_CONFIG",
    "min": "0",
    "max": "HSV_HUE_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "ledstrip_rainbow_freq",
    "type": "UINT16",
    "lookup": null,
    "pg": "LED_STRIP_CONFIG",
    "min": "1",
    "max": "2000",
    "array": false,
    "live": false
  },
  {
    "key": "sdcard_detect_inverted",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "SDCARD_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "sdcard_mode",
    "type": "UINT8",
    "lookup": "SDCARD_MODE",
    "pg": "SDCARD_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "sdcard_spi_bus",
    "type": "UINT8",
    "lookup": null,
    "pg": "SDCARD_CONFIG",
    "min": "0",
    "max": "SPIDEV_COUNT",
    "array": false,
    "live": false
  },
  {
    "key": "sdio_clk_bypass",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "SDIO_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "sdio_use_cache",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "SDIO_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "sdio_use_4bit_width",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "SDIO_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "sdio_device",
    "type": "UINT8",
    "lookup": null,
    "pg": "SDIO_CONFIG",
    "min": "0",
    "max": "SDIODEV_COUNT",
    "array": false,
    "live": false
  },
  {
    "key": "osd_units",
    "type": "UINT8",
    "lookup": "UNIT",
    "pg": "OSD_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "osd_warn_bitmask",
    "type": "UINT32",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "osd_rssi_alarm",
    "type": "UINT8",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "0",
    "max": "100",
    "array": false,
    "live": false
  },
  {
    "key": "osd_link_quality_alarm",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "0",
    "max": "100",
    "array": false,
    "live": false
  },
  {
    "key": "osd_rssi_dbm_alarm",
    "type": "INT16",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "CRSF_RSSI_MIN",
    "max": "CRSF_RSSI_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_rsnr_alarm",
    "type": "INT16",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "CRSF_SNR_MIN",
    "max": "CRSF_SNR_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_cap_alarm",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "0",
    "max": "20000",
    "array": false,
    "live": false
  },
  {
    "key": "osd_alt_alarm",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "0",
    "max": "10000",
    "array": false,
    "live": false
  },
  {
    "key": "osd_distance_alarm",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "0",
    "max": "UINT16_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_esc_temp_alarm",
    "type": "UINT8",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "0",
    "max": "UINT8_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_esc_rpm_alarm",
    "type": "INT16",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "ESC_RPM_ALARM_OFF",
    "max": "INT16_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_esc_current_alarm",
    "type": "INT16",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "ESC_CURRENT_ALARM_OFF",
    "max": "INT16_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_core_temp_alarm",
    "type": "UINT8",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "0",
    "max": "UINT8_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_ah_max_pit",
    "type": "UINT8",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "0",
    "max": "90",
    "array": false,
    "live": false
  },
  {
    "key": "osd_ah_max_rol",
    "type": "UINT8",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "0",
    "max": "90",
    "array": false,
    "live": false
  },
  {
    "key": "osd_ah_invert",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "OSD_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "osd_logo_on_arming",
    "type": "UINT8",
    "lookup": "OSD_LOGO_ON_ARMING",
    "pg": "OSD_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "osd_logo_on_arming_duration",
    "type": "UINT8",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "5",
    "max": "50",
    "array": false,
    "live": false
  },
  {
    "key": "osd_use_quick_menu",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "OSD_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "osd_show_spec_prearm",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "OSD_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "osd_tim1",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "0",
    "max": "INT16_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_tim2",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "0",
    "max": "INT16_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_vbat_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_rssi_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_link_quality_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_link_tx_power_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_rssi_dbm_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_rsnr_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_tim_1_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_tim_2_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_remaining_time_estimate_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_flymode_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_anti_gravity_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_g_force_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_throttle_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_vtx_channel_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_crosshairs_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_ah_sbar_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_ah_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_current_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_mah_drawn_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_wh_drawn_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_motor_diag_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_craft_name_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_pilot_name_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_gps_speed_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_gps_lon_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_gps_lat_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_gps_lap_curr_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_gps_lap_prev_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_gps_lap_best3_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_gps_sats_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_home_dir_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_home_dist_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_flight_dist_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_compass_bar_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_altitude_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_pid_roll_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_pid_pitch_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_pid_yaw_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_debug_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_power_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_pidrate_profile_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_warnings_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_avg_cell_voltage_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_pit_ang_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_rol_ang_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_battery_usage_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_disarmed_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_nheading_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_up_down_reference_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_ready_mode_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_nvario_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_esc_tmp_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_esc_rpm_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_esc_rpm_freq_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_rtc_date_time_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_adjustment_range_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_flip_arrow_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_core_temp_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_log_status_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_stick_overlay_left_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_stick_overlay_right_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_stick_overlay_radio_mode",
    "type": "UINT8",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "1",
    "max": "4",
    "array": false,
    "live": false
  },
  {
    "key": "osd_rate_profile_name_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_pid_profile_name_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_profile_name_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_rcchannels_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_camera_frame_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_efficiency_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_total_flights_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_aux_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_sys_goggle_voltage_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_sys_vtx_voltage_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_sys_bitrate_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_sys_delay_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_sys_distance_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_sys_lq_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_sys_goggle_dvr_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_sys_vtx_dvr_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_sys_warnings_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_sys_vtx_temp_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_sys_fan_speed_pos",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_ELEMENT_CONFIG",
    "min": "0",
    "max": "OSD_POSCFG_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "osd_stat_bitmask",
    "type": "UINT32",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "osd_profile",
    "type": "UINT8",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "1",
    "max": "OSD_PROFILE_COUNT",
    "array": false,
    "live": false
  },
  {
    "key": "osd_profile_1_name",
    "type": "UINT8",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "osd_profile_2_name",
    "type": "UINT8",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "osd_profile_3_name",
    "type": "UINT8",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "osd_gps_sats_show_pdop",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "OSD_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "osd_displayport_device",
    "type": "UINT8",
    "lookup": "OSD_DISPLAYPORT_DEVICE",
    "pg": "OSD_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "osd_rcchannels",
    "type": "INT8",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": null,
    "max": null,
    "array": true,
    "live": false
  },
  {
    "key": "osd_camera_frame_width",
    "type": "UINT8",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "OSD_CAMERA_FRAME_MIN_WIDTH",
    "max": "OSD_CAMERA_FRAME_MAX_WIDTH",
    "array": false,
    "live": false
  },
  {
    "key": "osd_camera_frame_height",
    "type": "UINT8",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "OSD_CAMERA_FRAME_MIN_HEIGHT",
    "max": "OSD_CAMERA_FRAME_MAX_HEIGHT",
    "array": false,
    "live": false
  },
  {
    "key": "osd_stat_avg_cell_value",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "OSD_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "osd_framerate_hz",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "OSD_FRAMERATE_MIN_HZ",
    "max": "OSD_FRAMERATE_MAX_HZ",
    "array": false,
    "live": false
  },
  {
    "key": "osd_menu_background",
    "type": "UINT8",
    "lookup": "CMS_BACKGROUND",
    "pg": "OSD_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "osd_aux_channel",
    "type": "UINT8",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "1",
    "max": "MAX_SUPPORTED_RC_CHANNEL_COUNT",
    "array": false,
    "live": false
  },
  {
    "key": "osd_aux_scale",
    "type": "UINT16",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "1",
    "max": "1000",
    "array": false,
    "live": false
  },
  {
    "key": "osd_aux_symbol",
    "type": "UINT8",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "0",
    "max": "255",
    "array": false,
    "live": false
  },
  {
    "key": "osd_canvas_width",
    "type": "UINT8",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "0",
    "max": "63",
    "array": false,
    "live": false
  },
  {
    "key": "osd_canvas_height",
    "type": "UINT8",
    "lookup": null,
    "pg": "OSD_CONFIG",
    "min": "0",
    "max": "31",
    "array": false,
    "live": false
  },
  {
    "key": "osd_craftname_msgs",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "OSD_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "system_hse_mhz",
    "type": "UINT8",
    "lookup": null,
    "pg": "SYSTEM_CONFIG",
    "min": "0",
    "max": "30",
    "array": false,
    "live": false
  },
  {
    "key": "task_statistics",
    "type": "INT8",
    "lookup": "OFF_ON",
    "pg": "SYSTEM_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "debug_mode",
    "type": "UINT8",
    "lookup": "DEBUG",
    "pg": "SYSTEM_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "rate_6pos_switch",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "SYSTEM_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "cpu_overclock",
    "type": "UINT8",
    "lookup": "OVERCLOCK",
    "pg": "SYSTEM_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "pwr_on_arm_grace",
    "type": "UINT8",
    "lookup": null,
    "pg": "SYSTEM_CONFIG",
    "min": "0",
    "max": "30",
    "array": false,
    "live": false
  },
  {
    "key": "enable_stick_arming",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "SYSTEM_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "vtx_band",
    "type": "UINT8",
    "lookup": "MAX_BANDS",
    "pg": "VTX_SETTINGS_CONFIG",
    "min": "0",
    "max": "VTX_TABLE_MAX_BANDS",
    "array": false,
    "live": false
  },
  {
    "key": "vtx_channel",
    "type": "UINT8",
    "lookup": "MAX_CHANNELS",
    "pg": "VTX_SETTINGS_CONFIG",
    "min": "0",
    "max": "VTX_TABLE_MAX_CHANNELS",
    "array": false,
    "live": false
  },
  {
    "key": "vtx_power",
    "type": "UINT8",
    "lookup": "MAX_POWER_LEVELS",
    "pg": "VTX_SETTINGS_CONFIG",
    "min": "0",
    "max": "VTX_TABLE_MAX_POWER_LEVELS - 1",
    "array": false,
    "live": false
  },
  {
    "key": "vtx_low_power_disarm",
    "type": "UINT8",
    "lookup": "VTX_LOW_POWER_DISARM",
    "pg": "VTX_SETTINGS_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "vtx_softserial_alt",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "VTX_SETTINGS_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "vtx_freq",
    "type": "UINT16",
    "lookup": null,
    "pg": "VTX_SETTINGS_CONFIG",
    "min": "0",
    "max": "VTX_SETTINGS_MAX_FREQUENCY_MHZ",
    "array": false,
    "live": false
  },
  {
    "key": "vtx_pit_mode_freq",
    "type": "UINT16",
    "lookup": null,
    "pg": "VTX_SETTINGS_CONFIG",
    "min": "0",
    "max": "VTX_SETTINGS_MAX_FREQUENCY_MHZ",
    "array": false,
    "live": false
  },
  {
    "key": "vtx_halfduplex",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "VTX_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "vtx_spi_bus",
    "type": "UINT8",
    "lookup": null,
    "pg": "VTX_IO_CONFIG",
    "min": "0",
    "max": "SPIDEV_COUNT",
    "array": false,
    "live": false
  },
  {
    "key": "vcd_video_system",
    "type": "UINT8",
    "lookup": "VIDEO_SYSTEM",
    "pg": "VCD_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "vcd_h_offset",
    "type": "INT8",
    "lookup": null,
    "pg": "VCD_CONFIG",
    "min": "-32",
    "max": "31",
    "array": false,
    "live": false
  },
  {
    "key": "vcd_v_offset",
    "type": "INT8",
    "lookup": null,
    "pg": "VCD_CONFIG",
    "min": "-15",
    "max": "16",
    "array": false,
    "live": false
  },
  {
    "key": "max7456_clock",
    "type": "UINT8",
    "lookup": "MAX7456_CLOCK",
    "pg": "MAX7456_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "max7456_spi_bus",
    "type": "UINT8",
    "lookup": null,
    "pg": "MAX7456_CONFIG",
    "min": "0",
    "max": "SPIDEV_COUNT",
    "array": false,
    "live": false
  },
  {
    "key": "max7456_preinit_opu",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "MAX7456_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "displayport_msp_col_adjust",
    "type": "INT8",
    "lookup": null,
    "pg": "DISPLAY_PORT_MSP_CONFIG",
    "min": "-6",
    "max": "0",
    "array": false,
    "live": false
  },
  {
    "key": "displayport_msp_row_adjust",
    "type": "INT8",
    "lookup": null,
    "pg": "DISPLAY_PORT_MSP_CONFIG",
    "min": "-3",
    "max": "0",
    "array": false,
    "live": false
  },
  {
    "key": "displayport_msp_fonts",
    "type": "UINT8",
    "lookup": null,
    "pg": "DISPLAY_PORT_MSP_CONFIG",
    "min": null,
    "max": null,
    "array": true,
    "live": false
  },
  {
    "key": "displayport_msp_use_device_blink",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "DISPLAY_PORT_MSP_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "displayport_max7456_col_adjust",
    "type": "INT8",
    "lookup": null,
    "pg": "DISPLAY_PORT_MAX7456_CONFIG",
    "min": "-6",
    "max": "0",
    "array": false,
    "live": false
  },
  {
    "key": "displayport_max7456_row_adjust",
    "type": "INT8",
    "lookup": null,
    "pg": "DISPLAY_PORT_MAX7456_CONFIG",
    "min": "-3",
    "max": "0",
    "array": false,
    "live": false
  },
  {
    "key": "displayport_max7456_inv",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "DISPLAY_PORT_MAX7456_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "displayport_max7456_blk",
    "type": "UINT8",
    "lookup": null,
    "pg": "DISPLAY_PORT_MAX7456_CONFIG",
    "min": "0",
    "max": "3",
    "array": false,
    "live": false
  },
  {
    "key": "displayport_max7456_wht",
    "type": "UINT8",
    "lookup": null,
    "pg": "DISPLAY_PORT_MAX7456_CONFIG",
    "min": "0",
    "max": "3",
    "array": false,
    "live": false
  },
  {
    "key": "esc_sensor_halfduplex",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "ESC_SENSOR_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "esc_sensor_current_offset",
    "type": "UINT16",
    "lookup": null,
    "pg": "ESC_SENSOR_CONFIG",
    "min": "0",
    "max": "16000",
    "array": false,
    "live": false
  },
  {
    "key": "frsky_spi_autobind",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "RX_CC2500_SPI_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "frsky_spi_tx_id",
    "type": "UINT8",
    "lookup": null,
    "pg": "RX_CC2500_SPI_CONFIG",
    "min": null,
    "max": null,
    "array": true,
    "live": false
  },
  {
    "key": "frsky_spi_offset",
    "type": "INT8",
    "lookup": null,
    "pg": "RX_CC2500_SPI_CONFIG",
    "min": "-127",
    "max": "127",
    "array": false,
    "live": false
  },
  {
    "key": "frsky_spi_bind_hop_data",
    "type": "UINT8",
    "lookup": null,
    "pg": "RX_CC2500_SPI_CONFIG",
    "min": null,
    "max": null,
    "array": true,
    "live": false
  },
  {
    "key": "frsky_x_rx_num",
    "type": "UINT8",
    "lookup": null,
    "pg": "RX_CC2500_SPI_CONFIG",
    "min": "0",
    "max": "UINT8_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "frsky_spi_a1_source",
    "type": "UINT8",
    "lookup": "RX_FRSKY_SPI_A1_SOURCE",
    "pg": "RX_CC2500_SPI_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "cc2500_spi_chip_detect",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "RX_CC2500_SPI_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "led_inversion",
    "type": "UINT8",
    "lookup": null,
    "pg": "STATUS_LED_CONFIG",
    "min": "0",
    "max": "((1 << STATUS_LED_NUMBER) - 1)",
    "array": false,
    "live": false
  },
  {
    "key": "dashboard_i2c_bus",
    "type": "UINT8",
    "lookup": null,
    "pg": "DASHBOARD_CONFIG",
    "min": "0",
    "max": "I2CDEV_COUNT",
    "array": false,
    "live": false
  },
  {
    "key": "dashboard_i2c_addr",
    "type": "UINT8",
    "lookup": null,
    "pg": "DASHBOARD_CONFIG",
    "min": "I2C_ADDR7_MIN",
    "max": "I2C_ADDR7_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "camera_control_mode",
    "type": "UINT8",
    "lookup": "CAMERA_CONTROL_MODE",
    "pg": "CAMERA_CONTROL_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "camera_control_ref_voltage",
    "type": "UINT16",
    "lookup": null,
    "pg": "CAMERA_CONTROL_CONFIG",
    "min": "200",
    "max": "400",
    "array": false,
    "live": false
  },
  {
    "key": "camera_control_key_delay",
    "type": "UINT16",
    "lookup": null,
    "pg": "CAMERA_CONTROL_CONFIG",
    "min": "100",
    "max": "500",
    "array": false,
    "live": false
  },
  {
    "key": "camera_control_internal_resistance",
    "type": "UINT16",
    "lookup": null,
    "pg": "CAMERA_CONTROL_CONFIG",
    "min": "10",
    "max": "1000",
    "array": false,
    "live": false
  },
  {
    "key": "camera_control_button_resistance",
    "type": "UINT16",
    "lookup": null,
    "pg": "CAMERA_CONTROL_CONFIG",
    "min": null,
    "max": null,
    "array": true,
    "live": false
  },
  {
    "key": "camera_control_inverted",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "CAMERA_CONTROL_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "rangefinder_hardware",
    "type": "UINT8",
    "lookup": "RANGEFINDER_HARDWARE",
    "pg": "RANGEFINDER_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "pinio_config",
    "type": "UINT8",
    "lookup": null,
    "pg": "PINIO_CONFIG",
    "min": null,
    "max": null,
    "array": true,
    "live": false
  },
  {
    "key": "pinio_box",
    "type": "UINT8",
    "lookup": null,
    "pg": "PINIOBOX_CONFIG",
    "min": null,
    "max": null,
    "array": true,
    "live": false
  },
  {
    "key": "usb_hid_cdc",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "USB_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "usb_msc_pin_pullup",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "USB_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "flash_spi_bus",
    "type": "UINT8",
    "lookup": null,
    "pg": "FLASH_CONFIG",
    "min": "0",
    "max": "SPIDEV_COUNT",
    "array": false,
    "live": false
  },
  {
    "key": "rcdevice_init_dev_attempts",
    "type": "UINT8",
    "lookup": null,
    "pg": "RCDEVICE_CONFIG",
    "min": "0",
    "max": "10",
    "array": false,
    "live": false
  },
  {
    "key": "rcdevice_init_dev_attempt_interval",
    "type": "UINT32",
    "lookup": null,
    "pg": "RCDEVICE_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "rcdevice_protocol_version",
    "type": "UINT8",
    "lookup": null,
    "pg": "RCDEVICE_CONFIG",
    "min": "0",
    "max": "1",
    "array": false,
    "live": false
  },
  {
    "key": "rcdevice_feature",
    "type": "UINT16",
    "lookup": null,
    "pg": "RCDEVICE_CONFIG",
    "min": "0",
    "max": "65535",
    "array": false,
    "live": false
  },
  {
    "key": "gyro_1_bustype",
    "type": "UINT8",
    "lookup": "BUS_TYPE",
    "pg": "GYRO_DEVICE_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "gyro_1_spibus",
    "type": "UINT8",
    "lookup": null,
    "pg": "GYRO_DEVICE_CONFIG",
    "min": "0",
    "max": "SPIDEV_COUNT",
    "array": false,
    "live": false
  },
  {
    "key": "gyro_1_i2cBus",
    "type": "UINT8",
    "lookup": null,
    "pg": "GYRO_DEVICE_CONFIG",
    "min": "0",
    "max": "I2CDEV_COUNT",
    "array": false,
    "live": false
  },
  {
    "key": "gyro_1_i2c_address",
    "type": "UINT8",
    "lookup": null,
    "pg": "GYRO_DEVICE_CONFIG",
    "min": "0",
    "max": "I2C_ADDR7_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "gyro_1_sensor_align",
    "type": "UINT8",
    "lookup": "ALIGNMENT",
    "pg": "GYRO_DEVICE_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "gyro_1_align_roll",
    "type": "INT16",
    "lookup": null,
    "pg": "GYRO_DEVICE_CONFIG",
    "min": "-3600",
    "max": "3600",
    "array": false,
    "live": false
  },
  {
    "key": "gyro_1_align_pitch",
    "type": "INT16",
    "lookup": null,
    "pg": "GYRO_DEVICE_CONFIG",
    "min": "-3600",
    "max": "3600",
    "array": false,
    "live": false
  },
  {
    "key": "gyro_1_align_yaw",
    "type": "INT16",
    "lookup": null,
    "pg": "GYRO_DEVICE_CONFIG",
    "min": "-3600",
    "max": "3600",
    "array": false,
    "live": false
  },
  {
    "key": "gyro_2_bustype",
    "type": "UINT8",
    "lookup": "BUS_TYPE",
    "pg": "GYRO_DEVICE_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "gyro_2_spibus",
    "type": "UINT8",
    "lookup": null,
    "pg": "GYRO_DEVICE_CONFIG",
    "min": "0",
    "max": "SPIDEV_COUNT",
    "array": false,
    "live": false
  },
  {
    "key": "gyro_2_i2cBus",
    "type": "UINT8",
    "lookup": null,
    "pg": "GYRO_DEVICE_CONFIG",
    "min": "0",
    "max": "I2CDEV_COUNT",
    "array": false,
    "live": false
  },
  {
    "key": "gyro_2_i2c_address",
    "type": "UINT8",
    "lookup": null,
    "pg": "GYRO_DEVICE_CONFIG",
    "min": "0",
    "max": "I2C_ADDR7_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "gyro_2_sensor_align",
    "type": "UINT8",
    "lookup": "ALIGNMENT",
    "pg": "GYRO_DEVICE_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "gyro_2_align_roll",
    "type": "INT16",
    "lookup": null,
    "pg": "GYRO_DEVICE_CONFIG",
    "min": "-3600",
    "max": "3600",
    "array": false,
    "live": false
  },
  {
    "key": "gyro_2_align_pitch",
    "type": "INT16",
    "lookup": null,
    "pg": "GYRO_DEVICE_CONFIG",
    "min": "-3600",
    "max": "3600",
    "array": false,
    "live": false
  },
  {
    "key": "gyro_2_align_yaw",
    "type": "INT16",
    "lookup": null,
    "pg": "GYRO_DEVICE_CONFIG",
    "min": "-3600",
    "max": "3600",
    "array": false,
    "live": false
  },
  {
    "key": "i2c1_pullup",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "I2C_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "i2c1_clockspeed_khz",
    "type": "UINT16",
    "lookup": null,
    "pg": "I2C_CONFIG",
    "min": "I2C_CLOCKSPEED_MIN_KHZ",
    "max": "I2C_CLOCKSPEED_MAX_KHZ",
    "array": false,
    "live": false
  },
  {
    "key": "i2c2_pullup",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "I2C_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "i2c2_clockspeed_khz",
    "type": "UINT16",
    "lookup": null,
    "pg": "I2C_CONFIG",
    "min": "I2C_CLOCKSPEED_MIN_KHZ",
    "max": "I2C_CLOCKSPEED_MAX_KHZ",
    "array": false,
    "live": false
  },
  {
    "key": "i2c3_pullup",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "I2C_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "i2c3_clockspeed_khz",
    "type": "UINT16",
    "lookup": null,
    "pg": "I2C_CONFIG",
    "min": "I2C_CLOCKSPEED_MIN_KHZ",
    "max": "I2C_CLOCKSPEED_MAX_KHZ",
    "array": false,
    "live": false
  },
  {
    "key": "i2c4_pullup",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "I2C_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "i2c4_clockspeed_khz",
    "type": "UINT16",
    "lookup": null,
    "pg": "I2C_CONFIG",
    "min": "I2C_CLOCKSPEED_MIN_KHZ",
    "max": "I2C_CLOCKSPEED_MAX_KHZ",
    "array": false,
    "live": false
  },
  {
    "key": "mco_on_pa8",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "MCO_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "mco_source",
    "type": "UINT8",
    "lookup": null,
    "pg": "MCO_CONFIG",
    "min": "0",
    "max": "MCO_SOURCE_COUNT - 1",
    "array": false,
    "live": false
  },
  {
    "key": "mco_divider",
    "type": "UINT8",
    "lookup": null,
    "pg": "MCO_CONFIG",
    "min": "0",
    "max": "MCO_DIVIDER_COUNT - 1",
    "array": false,
    "live": false
  },
  {
    "key": "mco2_on_pc9",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "MCO_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "spektrum_spi_protocol",
    "type": "UINT8",
    "lookup": null,
    "pg": "RX_SPEKTRUM_SPI_CONFIG",
    "min": "0",
    "max": "UINT8_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "spektrum_spi_mfg_id",
    "type": "UINT8",
    "lookup": null,
    "pg": "RX_SPEKTRUM_SPI_CONFIG",
    "min": null,
    "max": null,
    "array": true,
    "live": false
  },
  {
    "key": "spektrum_spi_num_channels",
    "type": "UINT8",
    "lookup": null,
    "pg": "RX_SPEKTRUM_SPI_CONFIG",
    "min": "0",
    "max": "DSM_MAX_CHANNEL_COUNT",
    "array": false,
    "live": false
  },
  {
    "key": "expresslrs_uid",
    "type": "UINT8",
    "lookup": null,
    "pg": "RX_EXPRESSLRS_SPI_CONFIG",
    "min": null,
    "max": null,
    "array": true,
    "live": false
  },
  {
    "key": "expresslrs_domain",
    "type": "UINT8",
    "lookup": "FREQ_DOMAIN",
    "pg": "RX_EXPRESSLRS_SPI_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "expresslrs_rate_index",
    "type": "UINT8",
    "lookup": null,
    "pg": "RX_EXPRESSLRS_SPI_CONFIG",
    "min": "0",
    "max": "3",
    "array": false,
    "live": false
  },
  {
    "key": "expresslrs_switch_mode",
    "type": "UINT8",
    "lookup": "SWITCH_MODE",
    "pg": "RX_EXPRESSLRS_SPI_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "expresslrs_model_id",
    "type": "UINT8",
    "lookup": null,
    "pg": "RX_EXPRESSLRS_SPI_CONFIG",
    "min": "0",
    "max": "UINT8_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "scheduler_relax_rx",
    "type": "UINT16",
    "lookup": null,
    "pg": "SCHEDULER_CONFIG",
    "min": "0",
    "max": "500",
    "array": false,
    "live": false
  },
  {
    "key": "scheduler_relax_osd",
    "type": "UINT16",
    "lookup": null,
    "pg": "SCHEDULER_CONFIG",
    "min": "0",
    "max": "500",
    "array": false,
    "live": false
  },
  {
    "key": "cpu_late_limit_permille",
    "type": "UINT8",
    "lookup": null,
    "pg": "SCHEDULER_CONFIG",
    "min": "0",
    "max": "100",
    "array": false,
    "live": false
  },
  {
    "key": "serialmsp_halfduplex",
    "type": "UINT8",
    "lookup": "OFF_ON",
    "pg": "MSP_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "timezone_offset_minutes",
    "type": "INT16",
    "lookup": null,
    "pg": "TIME_CONFIG",
    "min": "TIMEZONE_OFFSET_MINUTES_MIN",
    "max": "TIMEZONE_OFFSET_MINUTES_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "rpm_filter_harmonics",
    "type": "UINT8",
    "lookup": null,
    "pg": "RPM_FILTER_CONFIG",
    "min": "0",
    "max": "3",
    "array": false,
    "live": true
  },
  {
    "key": "rpm_filter_weights",
    "type": "UINT8",
    "lookup": null,
    "pg": "RPM_FILTER_CONFIG",
    "min": null,
    "max": null,
    "array": true,
    "live": false
  },
  {
    "key": "rpm_filter_q",
    "type": "UINT16",
    "lookup": null,
    "pg": "RPM_FILTER_CONFIG",
    "min": "250",
    "max": "3000",
    "array": false,
    "live": true
  },
  {
    "key": "rpm_filter_min_hz",
    "type": "UINT8",
    "lookup": null,
    "pg": "RPM_FILTER_CONFIG",
    "min": "30",
    "max": "200",
    "array": false,
    "live": true
  },
  {
    "key": "rpm_filter_fade_range_hz",
    "type": "UINT16",
    "lookup": null,
    "pg": "RPM_FILTER_CONFIG",
    "min": "0",
    "max": "1000",
    "array": false,
    "live": true
  },
  {
    "key": "rpm_filter_lpf_hz",
    "type": "UINT16",
    "lookup": null,
    "pg": "RPM_FILTER_CONFIG",
    "min": "100",
    "max": "500",
    "array": false,
    "live": true
  },
  {
    "key": "flysky_spi_tx_id",
    "type": "UINT32",
    "lookup": null,
    "pg": "FLYSKY_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "flysky_spi_rf_channels",
    "type": "UINT8",
    "lookup": null,
    "pg": "FLYSKY_CONFIG",
    "min": null,
    "max": null,
    "array": true,
    "live": false
  },
  {
    "key": "stats_min_armed_time_s",
    "type": "INT8",
    "lookup": null,
    "pg": "STATS_CONFIG",
    "min": "STATS_OFF",
    "max": "INT8_MAX",
    "array": false,
    "live": false
  },
  {
    "key": "stats_total_flights",
    "type": "UINT32",
    "lookup": null,
    "pg": "STATS_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "stats_total_time_s",
    "type": "UINT32",
    "lookup": null,
    "pg": "STATS_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "stats_total_dist_m",
    "type": "UINT32",
    "lookup": null,
    "pg": "STATS_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "stats_mah_used",
    "type": "UINT32",
    "lookup": null,
    "pg": "STATS_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "craft_name",
    "type": "UINT8",
    "lookup": null,
    "pg": "PILOT_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "pilot_name",
    "type": "UINT8",
    "lookup": null,
    "pg": "PILOT_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "altitude_source",
    "type": "INT8",
    "lookup": "POSITION_ALT_SOURCE",
    "pg": "POSITION",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "altitude_prefer_baro",
    "type": "INT8",
    "lookup": null,
    "pg": "POSITION",
    "min": "0",
    "max": "100",
    "array": false,
    "live": false
  },
  {
    "key": "altitude_lpf",
    "type": "UINT16",
    "lookup": null,
    "pg": "POSITION",
    "min": "10",
    "max": "1000",
    "array": false,
    "live": false
  },
  {
    "key": "altitude_d_lpf",
    "type": "UINT16",
    "lookup": null,
    "pg": "POSITION",
    "min": "10",
    "max": "1000",
    "array": false,
    "live": false
  },
  {
    "key": "box_user_1_name",
    "type": "UINT8",
    "lookup": null,
    "pg": "MODE_ACTIVATION_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "box_user_2_name",
    "type": "UINT8",
    "lookup": null,
    "pg": "MODE_ACTIVATION_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "box_user_3_name",
    "type": "UINT8",
    "lookup": null,
    "pg": "MODE_ACTIVATION_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "box_user_4_name",
    "type": "UINT8",
    "lookup": null,
    "pg": "MODE_ACTIVATION_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": false
  },
  {
    "key": "rpm_filter_weights_1",
    "type": "UINT8",
    "lookup": null,
    "pg": "RPM_FILTER_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "rpm_filter_weights_2",
    "type": "UINT8",
    "lookup": null,
    "pg": "RPM_FILTER_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  },
  {
    "key": "rpm_filter_weights_3",
    "type": "UINT8",
    "lookup": null,
    "pg": "RPM_FILTER_CONFIG",
    "min": null,
    "max": null,
    "array": false,
    "live": true
  }
];
