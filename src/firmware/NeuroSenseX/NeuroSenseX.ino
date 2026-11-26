// Replacement streaming sketch, NOT the user's original FFT firmware.
// ESP32 Arduino core only; confirm pins, addresses and TCA channels before flashing.
#include <Wire.h>
#include <esp_timer.h>

constexpr int SDA_PIN = 21, SCL_PIN = 22;
constexpr uint8_t TCA_ADDRESS = 0x70, MPU_ADDRESS = 0x68;
constexpr uint8_t CHANNELS[3] = {0, 1, 2}; // Channel 0 -> Sensor 1, etc.
constexpr uint32_t PERIOD_US = 20000; // Nominal 50 Hz/sensor; fits 115200 baud.
bool ready[3] = {false, false, false};
int64_t nextFrame = 0;

bool selectChannel(uint8_t channel) {
  Wire.beginTransmission(TCA_ADDRESS);
  Wire.write(uint8_t(1u << channel));
  return Wire.endTransmission() == 0;
}
bool writeRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MPU_ADDRESS);
  Wire.write(reg);
  Wire.write(value);
  return Wire.endTransmission() == 0;
}
bool readRegisters(uint8_t reg, uint8_t *out, uint8_t count) {
  Wire.beginTransmission(MPU_ADDRESS);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(MPU_ADDRESS, count) != count) {
    while (Wire.available()) Wire.read();
    return false;
  }
  for (uint8_t i = 0; i < count; ++i) out[i] = Wire.read();
  return true;
}
int16_t signedWord(uint8_t hi, uint8_t lo) {
  return int16_t((uint16_t(hi) << 8) | lo);
}
void reportStatus() {
  Serial.printf("STATUS,S1=%s,S2=%s,S3=%s\n",
    ready[0] ? "OK" : "FAIL", ready[1] ? "OK" : "FAIL", ready[2] ? "OK" : "FAIL");
}
void setup() {
  Serial.begin(115200);
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);
  Wire.setTimeOut(20);
  delay(200);
  Serial.println("FW,NSX-raw-1.0");
  for (uint8_t i = 0; i < 3; ++i) {
    uint8_t who = 0;
    if (!selectChannel(CHANNELS[i]) || !readRegisters(0x75, &who, 1) || (who & 0x7e) != 0x68) continue;
    if (!writeRegister(0x6b, 0x80)) continue; // Reset.
    delay(100);
    // Wake, PLL clock; DLPF 21 Hz; 1 kHz/(19+1) = 50 Hz; ±2 g.
    ready[i] = writeRegister(0x6b, 0x01) && writeRegister(0x1a, 0x04)
      && writeRegister(0x19, 19) && writeRegister(0x1c, 0x00);
    delay(20);
  }
  reportStatus();
  Serial.println("RATE,50");
  Serial.println("timestamp_us,sensor_id,ax_g,ay_g,az_g");
  nextFrame = esp_timer_get_time();
}
void loop() {
  const int64_t now = esp_timer_get_time();
  if (now < nextFrame) { delay(1); return; }
  nextFrame += PERIOD_US;
  if (nextFrame <= now) nextFrame = now + PERIOD_US; // No fabricated catch-up records.
  for (uint8_t i = 0; i < 3; ++i) {
    if (!ready[i]) continue;
    uint8_t bytes[6];
    if (!selectChannel(CHANNELS[i])) {
      ready[i] = false; reportStatus(); continue;
    }
    const int64_t timestampUs = esp_timer_get_time(); // Device read time, not host time.
    if (!readRegisters(0x3b, bytes, 6)) {
      ready[i] = false; reportStatus(); continue;
    }
    Serial.printf("%lld,%u,%.6f,%.6f,%.6f\n", (long long)timestampUs, unsigned(i + 1),
      signedWord(bytes[0], bytes[1]) / 16384.0,
      signedWord(bytes[2], bytes[3]) / 16384.0,
      signedWord(bytes[4], bytes[5]) / 16384.0);
  }
  // Sensors are sequential, not synchronized; timestamps describe register reads.
  // No FFT summaries, excitation commands, fabricated samples or host-generated time.
}