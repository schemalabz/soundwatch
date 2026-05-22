# Soundwatch Firmware Fork — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fork the Smart Citizen Kit 2.x firmware and add Soundwatch-specific features to the ESP8266: dual MQTT publish, SD card config provisioning, remote configuration, OTA updates, and offline buffering.

**Architecture:** Minimal ESP8266-only modifications. All new code lives in `esp/src/soundwatch/` for clean separation from upstream. A `SoundwatchManager` orchestrates the new modules and hooks into the existing `SckESP::update()` main loop. The SAMD21 firmware is untouched. Device identity comes from a `soundwatch.json` file on SD card, so one firmware binary serves all 50 sensors.

**Tech Stack:** C++ (Arduino framework), PlatformIO, ESP8266 (esp12e), PubSubClient (MQTT), ArduinoJson v6, ESP8266httpUpdate (OTA), Unity (testing)

**Spec:** `docs/superpowers/specs/2026-05-22-soundwatch-firmware-design.md`

**Repo:** `schema-labs/soundwatch-firmware` — fork of `fablabbcn/smartcitizen-kit-2x`

---

## Upstream Codebase Reference

Key files in the upstream SCK repo that we'll interact with:

| File | Purpose |
|------|---------|
| `esp/src/esp.ino` | Arduino entry point — calls `esp.setup()` and `esp.update()` in loop |
| `esp/src/SckESP.h` | Main ESP8266 class — handles WiFi, MQTT, serial, web UI |
| `esp/src/SckESP.cpp` | Implementation (~27KB) — `pubReadings()` publishes sensor data to Smart Citizen |
| `esp/platformio.ini` | Build config — platform espressif8266@^2.6.2, board esp12e, Arduino framework |

**Existing dependencies we'll reuse:** ArduinoJson v6.16.1, PubSubClient v2.8

**How sensor data flows:** SAMD21 reads sensors, computes dBA, sends readings to ESP8266 over serial (115200 baud, `SCKMessage` protocol). The `SckESP` class receives them and publishes via MQTT to `mqtt.smartcitizen.me`. We hook in at the same point to also publish to our broker.

---

## File Map

### Firmware repo (`soundwatch-firmware`)

```
esp/
├── platformio.ini                         # MODIFY: add native test env
├── src/
│   ├── esp.ino                            # MODIFY: add SoundwatchManager init/update calls
│   ├── SckESP.h                           # MODIFY: add SoundwatchManager member, friend declaration
│   ├── SckESP.cpp                         # MODIFY: call SoundwatchManager when readings are available
│   └── soundwatch/
│       ├── SoundwatchConfig.h             # CREATE: config struct + parser
│       ├── SoundwatchConfig.cpp           # CREATE: JSON parsing from SD card
│       ├── SoundwatchMQTT.h               # CREATE: second MQTT connection class
│       ├── SoundwatchMQTT.cpp             # CREATE: connect, publish, subscribe, reconnect
│       ├── SoundwatchPayload.h            # CREATE: reading payload formatter
│       ├── SoundwatchPayload.cpp          # CREATE: builds JSON from sensor data
│       ├── SoundwatchBuffer.h             # CREATE: SD card JSONL buffer class
│       ├── SoundwatchBuffer.cpp           # CREATE: write, replay, throttle
│       ├── SoundwatchOTA.h                # CREATE: OTA update checker
│       ├── SoundwatchOTA.cpp              # CREATE: HTTP check + ESP flash
│       ├── SoundwatchManager.h            # CREATE: orchestrator class
│       └── SoundwatchManager.cpp          # CREATE: init, update loop, wire modules together
├── test/
│   ├── test_config/
│   │   └── test_config.cpp                # CREATE: config parsing unit tests
│   ├── test_payload/
│   │   └── test_payload.cpp               # CREATE: payload formatting unit tests
│   └── test_buffer/
│       └── test_buffer.cpp                # CREATE: buffer logic unit tests
.github/
└── workflows/
    └── firmware.yml                       # CREATE: CI build + test
```

**Note:** Platform-side changes (ingester `firmware_version` support, `/api/firmware/latest` OTA endpoint) are handled separately by the infra agent working in the `soundwatch` repo.

---

## Task 1: Fork Repo and Verify Stock Build

**Repo:** `soundwatch-firmware`

**Files:**
- Fork: `fablabbcn/smartcitizen-kit-2x` → `schema-labs/soundwatch-firmware`

- [ ] **Step 1: Fork the upstream repo on GitHub**

```bash
gh repo fork fablabbcn/smartcitizen-kit-2x --org schema-labs --fork-name soundwatch-firmware --clone
cd soundwatch-firmware
```

- [ ] **Step 2: Set up upstream remote for future syncing**

```bash
git remote add upstream https://github.com/fablabbcn/smartcitizen-kit-2x.git
git fetch upstream
```

- [ ] **Step 3: Install PlatformIO CLI**

```bash
pip install platformio
# or via nix: nix-shell -p platformio
```

- [ ] **Step 4: Verify the stock ESP8266 firmware compiles**

```bash
cd esp
pio run
```

Expected: Build succeeds, produces firmware binary in `.pio/build/esp8266/firmware.bin`.

- [ ] **Step 5: Read the existing codebase to understand integration points**

Read these files and note:
- `esp/src/esp.ino` — where `setup()` and `loop()` call `esp.setup()` / `esp.update()`
- `esp/src/SckESP.h` — the `SckESP` class definition, its members and methods
- `esp/src/SckESP.cpp` — find `pubReadings()` to see how sensor data is formatted and published, and where it's called from

The key integration point: wherever `pubReadings()` is invoked, that's where we'll also call `soundwatchManager.onReadingAvailable()` to dual-publish.

- [ ] **Step 6: Create a working branch and commit**

```bash
git checkout -b soundwatch/dual-mqtt
git commit --allow-empty -m "Start Soundwatch firmware fork"
```

---

## Task 2: SoundwatchConfig — SD Card Configuration

**Repo:** `soundwatch-firmware`

**Files:**
- Create: `esp/src/soundwatch/SoundwatchConfig.h`
- Create: `esp/src/soundwatch/SoundwatchConfig.cpp`
- Create: `esp/test/test_config/test_config.cpp`
- Modify: `esp/platformio.ini`

- [ ] **Step 1: Add native test environment to platformio.ini**

Add this section to `esp/platformio.ini`:

```ini
[env:native]
platform = native
build_flags = -DUNIT_TEST
lib_deps =
    bblanchon/ArduinoJson@^6.16.1
test_framework = unity
```

- [ ] **Step 2: Write the failing test for config parsing**

Create `esp/test/test_config/test_config.cpp`:

```cpp
#include <unity.h>
#include <ArduinoJson.h>

// We test the parsing logic directly, without SD card dependencies
#include "soundwatch/SoundwatchConfig.h"

void test_parse_valid_config() {
    const char* json = R"({
        "device_id": "sck-store-042",
        "mqtt": {
            "broker": "mqtt.soundwatch.gr",
            "port": 8883,
            "username": "sck-store-042",
            "password": "secret123"
        },
        "reading_interval_s": 60,
        "ota": {
            "url": "https://soundwatch.gr/api/firmware/latest",
            "check_interval_s": 86400
        }
    })";

    SoundwatchConfig config;
    bool result = parseSoundwatchConfig(json, config);

    TEST_ASSERT_TRUE(result);
    TEST_ASSERT_EQUAL_STRING("sck-store-042", config.device_id);
    TEST_ASSERT_EQUAL_STRING("mqtt.soundwatch.gr", config.mqtt_broker);
    TEST_ASSERT_EQUAL_UINT16(8883, config.mqtt_port);
    TEST_ASSERT_EQUAL_STRING("sck-store-042", config.mqtt_username);
    TEST_ASSERT_EQUAL_STRING("secret123", config.mqtt_password);
    TEST_ASSERT_EQUAL_UINT16(60, config.reading_interval_s);
    TEST_ASSERT_EQUAL_STRING("https://soundwatch.gr/api/firmware/latest", config.ota_url);
    TEST_ASSERT_EQUAL_UINT32(86400, config.ota_check_interval_s);
}

void test_parse_missing_file_returns_invalid() {
    SoundwatchConfig config;
    bool result = parseSoundwatchConfig("", config);

    TEST_ASSERT_FALSE(result);
}

void test_parse_malformed_json_returns_invalid() {
    SoundwatchConfig config;
    bool result = parseSoundwatchConfig("{not json", config);

    TEST_ASSERT_FALSE(result);
}

void test_parse_missing_required_field_returns_invalid() {
    // Missing device_id
    const char* json = R"({
        "mqtt": {
            "broker": "mqtt.soundwatch.gr",
            "port": 8883,
            "username": "user",
            "password": "pass"
        },
        "reading_interval_s": 60,
        "ota": {
            "url": "https://example.com/firmware",
            "check_interval_s": 86400
        }
    })";

    SoundwatchConfig config;
    bool result = parseSoundwatchConfig(json, config);

    TEST_ASSERT_FALSE(result);
}

void test_defaults_when_optional_fields_missing() {
    // reading_interval_s and ota.check_interval_s have defaults
    const char* json = R"({
        "device_id": "sck-test",
        "mqtt": {
            "broker": "mqtt.soundwatch.gr",
            "port": 8883,
            "username": "user",
            "password": "pass"
        },
        "ota": {
            "url": "https://example.com/firmware"
        }
    })";

    SoundwatchConfig config;
    bool result = parseSoundwatchConfig(json, config);

    TEST_ASSERT_TRUE(result);
    TEST_ASSERT_EQUAL_UINT16(60, config.reading_interval_s);
    TEST_ASSERT_EQUAL_UINT32(86400, config.ota_check_interval_s);
}

int main(int argc, char **argv) {
    UNITY_BEGIN();
    RUN_TEST(test_parse_valid_config);
    RUN_TEST(test_parse_missing_file_returns_invalid);
    RUN_TEST(test_parse_malformed_json_returns_invalid);
    RUN_TEST(test_parse_missing_required_field_returns_invalid);
    RUN_TEST(test_defaults_when_optional_fields_missing);
    return UNITY_END();
}
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd esp
pio test -e native -f test_config
```

Expected: Compilation error — `SoundwatchConfig.h` not found.

- [ ] **Step 4: Implement SoundwatchConfig**

Create `esp/src/soundwatch/SoundwatchConfig.h`:

```cpp
#pragma once

#include <stdint.h>

struct SoundwatchConfig {
    char device_id[32];
    char mqtt_broker[128];
    uint16_t mqtt_port;
    char mqtt_username[64];
    char mqtt_password[64];
    uint16_t reading_interval_s;
    char ota_url[256];
    uint32_t ota_check_interval_s;
};

// Parse JSON string into config struct. Returns true if all required fields present.
bool parseSoundwatchConfig(const char* json, SoundwatchConfig& config);
```

Create `esp/src/soundwatch/SoundwatchConfig.cpp`:

```cpp
#include "SoundwatchConfig.h"
#include <ArduinoJson.h>
#include <string.h>

bool parseSoundwatchConfig(const char* json, SoundwatchConfig& config) {
    if (json == nullptr || json[0] == '\0') return false;

    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, json);
    if (err) return false;

    // Required fields
    if (!doc.containsKey("device_id")) return false;
    if (!doc.containsKey("mqtt")) return false;

    JsonObject mqtt = doc["mqtt"];
    if (!mqtt.containsKey("broker")) return false;
    if (!mqtt.containsKey("port")) return false;
    if (!mqtt.containsKey("username")) return false;
    if (!mqtt.containsKey("password")) return false;

    if (!doc.containsKey("ota")) return false;
    JsonObject ota = doc["ota"];
    if (!ota.containsKey("url")) return false;

    // Copy values
    strlcpy(config.device_id, doc["device_id"], sizeof(config.device_id));
    strlcpy(config.mqtt_broker, mqtt["broker"], sizeof(config.mqtt_broker));
    config.mqtt_port = mqtt["port"];
    strlcpy(config.mqtt_username, mqtt["username"], sizeof(config.mqtt_username));
    strlcpy(config.mqtt_password, mqtt["password"], sizeof(config.mqtt_password));

    // Defaults
    config.reading_interval_s = doc["reading_interval_s"] | 60;

    strlcpy(config.ota_url, ota["url"], sizeof(config.ota_url));
    config.ota_check_interval_s = ota["check_interval_s"] | (uint32_t)86400;

    return true;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd esp
pio test -e native -f test_config
```

Expected: All 5 tests pass.

- [ ] **Step 6: Add SD card loading function**

This function wraps the parser with actual SD card file I/O. It can't be unit-tested natively (requires hardware) but uses the tested parser internally.

Add to `esp/src/soundwatch/SoundwatchConfig.h`:

```cpp
#ifndef UNIT_TEST
#include <SD.h>

// Load config from /soundwatch.json on SD card. Returns true if file exists and parses.
bool loadSoundwatchConfig(SoundwatchConfig& config);
#endif
```

Add to `esp/src/soundwatch/SoundwatchConfig.cpp`:

```cpp
#ifndef UNIT_TEST
bool loadSoundwatchConfig(SoundwatchConfig& config) {
    if (!SD.exists("/soundwatch.json")) return false;

    File file = SD.open("/soundwatch.json", FILE_READ);
    if (!file) return false;

    char buffer[512];
    size_t len = file.readBytes(buffer, sizeof(buffer) - 1);
    buffer[len] = '\0';
    file.close();

    return parseSoundwatchConfig(buffer, config);
}
#endif
```

- [ ] **Step 7: Commit**

```bash
git add esp/src/soundwatch/SoundwatchConfig.h esp/src/soundwatch/SoundwatchConfig.cpp
git add esp/test/test_config/test_config.cpp esp/platformio.ini
git commit -m "feat: add SoundwatchConfig — SD card JSON config parser"
```

---

## Task 3: SoundwatchPayload — Reading Payload Formatter

**Repo:** `soundwatch-firmware`

**Files:**
- Create: `esp/src/soundwatch/SoundwatchPayload.h`
- Create: `esp/src/soundwatch/SoundwatchPayload.cpp`
- Create: `esp/test/test_payload/test_payload.cpp`

- [ ] **Step 1: Write the failing test**

Create `esp/test/test_payload/test_payload.cpp`:

```cpp
#include <unity.h>
#include <ArduinoJson.h>

#include "soundwatch/SoundwatchPayload.h"

void test_format_reading_payload() {
    SensorReading reading;
    reading.noise_dba = 68.3;
    reading.temperature = 27.1;
    reading.humidity = 54.2;
    reading.light_lux = 340.0;
    reading.pressure_pa = 101325.0;
    reading.uv_index = 3.2;
    reading.pm1 = 8.1;
    reading.pm25 = 12.4;
    reading.pm4 = 15.0;
    reading.pm10 = 18.7;

    char output[512];
    bool result = formatReadingPayload(
        "sck-store-042", "1.0.0", "2026-06-15T14:30:00Z",
        reading, output, sizeof(output)
    );

    TEST_ASSERT_TRUE(result);

    // Parse it back to verify structure
    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, output);
    TEST_ASSERT_FALSE(err);

    TEST_ASSERT_EQUAL_STRING("sck-store-042", doc["device_id"]);
    TEST_ASSERT_EQUAL_STRING("1.0.0", doc["firmware_version"]);
    TEST_ASSERT_EQUAL_STRING("2026-06-15T14:30:00Z", doc["recorded_at"]);

    JsonArray sensors = doc["sensors"];
    TEST_ASSERT_EQUAL(10, sensors.size());

    // Verify first sensor entry (noise_dba)
    TEST_ASSERT_EQUAL_STRING("noise_dba", sensors[0]["id"]);
    TEST_ASSERT_FLOAT_WITHIN(0.1, 68.3, sensors[0]["value"]);
}

void test_format_status_payload_online() {
    char output[128];
    formatStatusPayload("sck-store-042", true, output, sizeof(output));

    StaticJsonDocument<128> doc;
    deserializeJson(doc, output);

    TEST_ASSERT_EQUAL_STRING("online", doc["status"]);
    TEST_ASSERT_EQUAL_STRING("sck-store-042", doc["device_id"]);
}

void test_format_status_payload_offline() {
    char output[128];
    formatStatusPayload("sck-store-042", false, output, sizeof(output));

    StaticJsonDocument<128> doc;
    deserializeJson(doc, output);

    TEST_ASSERT_EQUAL_STRING("offline", doc["status"]);
}

int main(int argc, char **argv) {
    UNITY_BEGIN();
    RUN_TEST(test_format_reading_payload);
    RUN_TEST(test_format_status_payload_online);
    RUN_TEST(test_format_status_payload_offline);
    return UNITY_END();
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pio test -e native -f test_payload
```

Expected: Compilation error — `SoundwatchPayload.h` not found.

- [ ] **Step 3: Implement SoundwatchPayload**

Create `esp/src/soundwatch/SoundwatchPayload.h`:

```cpp
#pragma once

#include <stdint.h>
#include <stddef.h>

struct SensorReading {
    float noise_dba;
    float temperature;
    float humidity;
    float light_lux;
    float pressure_pa;
    float uv_index;
    float pm1;
    float pm25;
    float pm4;
    float pm10;
};

// Format a sensor reading as JSON matching the ingester's expected format.
// Returns true if output buffer was large enough.
bool formatReadingPayload(
    const char* device_id,
    const char* firmware_version,
    const char* recorded_at,
    const SensorReading& reading,
    char* output,
    size_t output_size
);

// Format a status message (online/offline).
void formatStatusPayload(
    const char* device_id,
    bool online,
    char* output,
    size_t output_size
);
```

Create `esp/src/soundwatch/SoundwatchPayload.cpp`:

```cpp
#include "SoundwatchPayload.h"
#include <ArduinoJson.h>

bool formatReadingPayload(
    const char* device_id,
    const char* firmware_version,
    const char* recorded_at,
    const SensorReading& reading,
    char* output,
    size_t output_size
) {
    StaticJsonDocument<512> doc;
    doc["device_id"] = device_id;
    doc["firmware_version"] = firmware_version;
    doc["recorded_at"] = recorded_at;

    JsonArray sensors = doc.createNestedArray("sensors");

    struct { const char* id; float value; } entries[] = {
        {"noise_dba",    reading.noise_dba},
        {"temperature",  reading.temperature},
        {"humidity",     reading.humidity},
        {"light_lux",    reading.light_lux},
        {"pressure_pa",  reading.pressure_pa},
        {"uv_index",    reading.uv_index},
        {"pm1",          reading.pm1},
        {"pm25",         reading.pm25},
        {"pm4",          reading.pm4},
        {"pm10",         reading.pm10},
    };

    for (auto& e : entries) {
        JsonObject sensor = sensors.createNestedObject();
        sensor["id"] = e.id;
        sensor["value"] = e.value;
    }

    size_t written = serializeJson(doc, output, output_size);
    return written > 0 && written < output_size;
}

void formatStatusPayload(
    const char* device_id,
    bool online,
    char* output,
    size_t output_size
) {
    StaticJsonDocument<128> doc;
    doc["status"] = online ? "online" : "offline";
    doc["device_id"] = device_id;
    serializeJson(doc, output, output_size);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pio test -e native -f test_payload
```

Expected: All 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add esp/src/soundwatch/SoundwatchPayload.h esp/src/soundwatch/SoundwatchPayload.cpp
git add esp/test/test_payload/test_payload.cpp
git commit -m "feat: add SoundwatchPayload — reading and status JSON formatters"
```

---

## Task 4: SoundwatchMQTT — Second MQTT Connection

**Repo:** `soundwatch-firmware`

**Files:**
- Create: `esp/src/soundwatch/SoundwatchMQTT.h`
- Create: `esp/src/soundwatch/SoundwatchMQTT.cpp`

This module depends on WiFi and PubSubClient hardware APIs — no native unit tests. Tested via integration on hardware.

- [ ] **Step 1: Implement SoundwatchMQTT**

Create `esp/src/soundwatch/SoundwatchMQTT.h`:

```cpp
#pragma once

#include <PubSubClient.h>
#include <WiFiClientSecure.h>
#include "SoundwatchConfig.h"
#include "SoundwatchPayload.h"

// Callback type for config commands received via MQTT
typedef void (*ConfigCallback)(const char* command, const char* payload);

class SoundwatchMQTT {
public:
    void begin(const SoundwatchConfig& config, ConfigCallback onConfig);
    void loop();

    bool isConnected();
    bool publishReading(const char* payload);
    bool publishStatus(bool online);

private:
    WiFiClientSecure _wifiClient;
    PubSubClient _mqttClient;
    const SoundwatchConfig* _config;
    ConfigCallback _onConfig;

    // Topics built from device_id
    char _topicReadings[96];
    char _topicStatus[96];
    char _topicConfig[96];

    // Reconnect backoff
    unsigned long _lastReconnectAttempt;
    unsigned long _reconnectDelay;
    static const unsigned long RECONNECT_DELAY_INITIAL = 1000;
    static const unsigned long RECONNECT_DELAY_MAX = 60000;

    bool _connect();
    void _buildTopics();
    void _onMessage(char* topic, byte* payload, unsigned int length);

    // Static trampoline for PubSubClient callback
    static SoundwatchMQTT* _instance;
    static void _messageTrampoline(char* topic, byte* payload, unsigned int length);
};
```

Create `esp/src/soundwatch/SoundwatchMQTT.cpp`:

```cpp
#include "SoundwatchMQTT.h"
#include <Arduino.h>

SoundwatchMQTT* SoundwatchMQTT::_instance = nullptr;

void SoundwatchMQTT::begin(const SoundwatchConfig& config, ConfigCallback onConfig) {
    _config = &config;
    _onConfig = onConfig;
    _instance = this;
    _reconnectDelay = RECONNECT_DELAY_INITIAL;
    _lastReconnectAttempt = 0;

    _buildTopics();

    _wifiClient.setInsecure(); // TODO: add CA cert for production
    _mqttClient.setClient(_wifiClient);
    _mqttClient.setServer(_config->mqtt_broker, _config->mqtt_port);
    _mqttClient.setCallback(_messageTrampoline);
    _mqttClient.setBufferSize(512);
}

void SoundwatchMQTT::_buildTopics() {
    snprintf(_topicReadings, sizeof(_topicReadings),
             "soundwatch/sensors/%s/readings", _config->device_id);
    snprintf(_topicStatus, sizeof(_topicStatus),
             "soundwatch/sensors/%s/status", _config->device_id);
    snprintf(_topicConfig, sizeof(_topicConfig),
             "soundwatch/sensors/%s/config", _config->device_id);
}

bool SoundwatchMQTT::_connect() {
    // Set LWT before connecting
    char lwtPayload[128];
    formatStatusPayload(_config->device_id, false, lwtPayload, sizeof(lwtPayload));

    bool connected = _mqttClient.connect(
        _config->device_id,
        _config->mqtt_username,
        _config->mqtt_password,
        _topicStatus,   // LWT topic
        1,              // LWT QoS
        true,           // LWT retain
        lwtPayload      // LWT message
    );

    if (connected) {
        _reconnectDelay = RECONNECT_DELAY_INITIAL;

        // Publish online status
        publishStatus(true);

        // Subscribe to config topic
        _mqttClient.subscribe(_topicConfig, 1);
    }

    return connected;
}

void SoundwatchMQTT::loop() {
    if (_mqttClient.connected()) {
        _mqttClient.loop();
        return;
    }

    // Exponential backoff reconnect
    unsigned long now = millis();
    if (now - _lastReconnectAttempt < _reconnectDelay) return;

    _lastReconnectAttempt = now;
    if (_connect()) return;

    // Increase delay on failure, cap at max
    _reconnectDelay = min(_reconnectDelay * 2, RECONNECT_DELAY_MAX);
}

bool SoundwatchMQTT::isConnected() {
    return _mqttClient.connected();
}

bool SoundwatchMQTT::publishReading(const char* payload) {
    if (!_mqttClient.connected()) return false;
    return _mqttClient.publish(_topicReadings, payload);
}

bool SoundwatchMQTT::publishStatus(bool online) {
    if (!_mqttClient.connected()) return false;
    char payload[128];
    formatStatusPayload(_config->device_id, online, payload, sizeof(payload));
    return _mqttClient.publish(_topicStatus, payload, true); // retained
}

void SoundwatchMQTT::_messageTrampoline(char* topic, byte* payload, unsigned int length) {
    if (_instance) _instance->_onMessage(topic, payload, length);
}

void SoundwatchMQTT::_onMessage(char* topic, byte* payload, unsigned int length) {
    if (!_onConfig) return;

    // Only handle config topic
    if (strcmp(topic, _topicConfig) != 0) return;

    // Null-terminate the payload
    char buf[256];
    size_t copyLen = min((size_t)length, sizeof(buf) - 1);
    memcpy(buf, payload, copyLen);
    buf[copyLen] = '\0';

    // Parse command
    StaticJsonDocument<256> doc;
    if (deserializeJson(doc, buf)) return; // malformed, ignore

    const char* command = doc["command"];
    if (!command) return; // no command field, ignore

    _onConfig(command, buf);
}
```

- [ ] **Step 2: Verify it compiles with the ESP8266 target**

```bash
cd esp
pio run
```

Expected: Build succeeds (the new files compile but aren't called yet).

- [ ] **Step 3: Commit**

```bash
git add esp/src/soundwatch/SoundwatchMQTT.h esp/src/soundwatch/SoundwatchMQTT.cpp
git commit -m "feat: add SoundwatchMQTT — second independent MQTT connection with LWT"
```

---

## Task 5: SoundwatchBuffer — SD Card JSONL Replay Buffer

**Repo:** `soundwatch-firmware`

**Files:**
- Create: `esp/src/soundwatch/SoundwatchBuffer.h`
- Create: `esp/src/soundwatch/SoundwatchBuffer.cpp`

Hardware-dependent (SD card). Tested via integration.

- [ ] **Step 1: Implement SoundwatchBuffer**

Create `esp/src/soundwatch/SoundwatchBuffer.h`:

```cpp
#pragma once

#include <SD.h>

class SoundwatchMQTT;

class SoundwatchBuffer {
public:
    // Store a reading to the buffer file
    void store(const char* payload);

    // Replay buffered readings through MQTT. Call repeatedly from loop().
    // Returns true when replay is complete (or nothing to replay).
    bool replay(SoundwatchMQTT& mqtt);

    // Check if there are buffered readings
    bool hasPending();

private:
    static const char* BUFFER_FILE;
    static const unsigned long REPLAY_INTERVAL_MS = 100; // 10 msg/sec

    // Replay state
    File _replayFile;
    bool _replaying;
    unsigned long _lastReplayTime;
};
```

Create `esp/src/soundwatch/SoundwatchBuffer.cpp`:

```cpp
#include "SoundwatchBuffer.h"
#include "SoundwatchMQTT.h"

const char* SoundwatchBuffer::BUFFER_FILE = "/soundwatch_buffer.jsonl";

void SoundwatchBuffer::store(const char* payload) {
    File file = SD.open(BUFFER_FILE, FILE_WRITE);
    if (!file) return;

    file.println(payload); // one JSON object per line
    file.close();
}

bool SoundwatchBuffer::hasPending() {
    return SD.exists(BUFFER_FILE);
}

bool SoundwatchBuffer::replay(SoundwatchMQTT& mqtt) {
    if (!mqtt.isConnected()) {
        // Connection dropped during replay — stop
        if (_replaying) {
            _replayFile.close();
            _replaying = false;
        }
        return false;
    }

    // Start replay if not already in progress
    if (!_replaying) {
        if (!hasPending()) return true; // nothing to replay

        _replayFile = SD.open(BUFFER_FILE, FILE_READ);
        if (!_replayFile) return true;

        _replaying = true;
        _lastReplayTime = 0;
    }

    // Throttle: 10 messages/second
    unsigned long now = millis();
    if (now - _lastReplayTime < REPLAY_INTERVAL_MS) return false;

    // Read next line
    if (_replayFile.available()) {
        char line[512];
        int len = _replayFile.readBytesUntil('\n', line, sizeof(line) - 1);
        if (len > 0) {
            line[len] = '\0';
            // Trim trailing \r if present
            if (len > 0 && line[len - 1] == '\r') line[len - 1] = '\0';

            mqtt.publishReading(line);
            _lastReplayTime = now;
        }
        return false; // more to replay
    }

    // Done replaying
    _replayFile.close();
    _replaying = false;
    SD.remove(BUFFER_FILE);
    return true;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
pio run
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add esp/src/soundwatch/SoundwatchBuffer.h esp/src/soundwatch/SoundwatchBuffer.cpp
git commit -m "feat: add SoundwatchBuffer — JSONL offline buffer with throttled replay"
```

---

## Task 6: SoundwatchOTA — HTTP OTA Updates

**Repo:** `soundwatch-firmware`

**Files:**
- Create: `esp/src/soundwatch/SoundwatchOTA.h`
- Create: `esp/src/soundwatch/SoundwatchOTA.cpp`

- [ ] **Step 1: Implement SoundwatchOTA**

Create `esp/src/soundwatch/SoundwatchOTA.h`:

```cpp
#pragma once

#include "SoundwatchConfig.h"

class SoundwatchOTA {
public:
    void begin(const SoundwatchConfig& config, const char* currentVersion);

    // Call from loop(). Checks if enough time has passed for a periodic check.
    void loop();

    // Trigger an immediate check (called from MQTT config command).
    void checkNow();

private:
    const SoundwatchConfig* _config;
    const char* _currentVersion;
    unsigned long _lastCheckTime;
    bool _checkRequested;

    void _doCheck();
};
```

Create `esp/src/soundwatch/SoundwatchOTA.cpp`:

```cpp
#include "SoundwatchOTA.h"
#include <ESP8266httpUpdate.h>
#include <ESP8266WiFi.h>

void SoundwatchOTA::begin(const SoundwatchConfig& config, const char* currentVersion) {
    _config = &config;
    _currentVersion = currentVersion;
    _lastCheckTime = millis();
    _checkRequested = false;
}

void SoundwatchOTA::loop() {
    // Check if MQTT-triggered
    if (_checkRequested) {
        _checkRequested = false;
        _doCheck();
        return;
    }

    // Periodic check
    unsigned long now = millis();
    unsigned long intervalMs = (unsigned long)_config->ota_check_interval_s * 1000;
    if (now - _lastCheckTime >= intervalMs) {
        _lastCheckTime = now;
        _doCheck();
    }
}

void SoundwatchOTA::checkNow() {
    _checkRequested = true;
}

void SoundwatchOTA::_doCheck() {
    WiFiClient client;
    ESPhttpUpdate.setLedPin(LED_BUILTIN, LOW);

    // Add headers so server can identify sensor and respond 304 if up to date
    ESPhttpUpdate.addHeader("X-Firmware-Version", _currentVersion);
    ESPhttpUpdate.addHeader("X-Device-Id", _config->device_id);

    t_httpUpdate_return result = ESPhttpUpdate.update(
        client,
        _config->ota_url
    );

    switch (result) {
        case HTTP_UPDATE_OK:
            // ESP reboots automatically after successful flash
            break;
        case HTTP_UPDATE_NO_UPDATES:
            // 304 — already on latest
            break;
        case HTTP_UPDATE_FAILED:
            // Log error, will retry at next interval
            Serial.printf("[SoundwatchOTA] Update failed: %s\n",
                          ESPhttpUpdate.getLastErrorString().c_str());
            break;
    }
}
```

**Note:** `ESP8266httpUpdate` handles SHA-256 verification natively when the server provides a `x-MD5` header. For our `X-Firmware-Checksum` header, the `/api/firmware/latest` endpoint should also set the standard `x-MD5` header that `ESP8266httpUpdate` expects. This avoids reimplementing checksum logic.

- [ ] **Step 2: Verify it compiles**

```bash
pio run
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add esp/src/soundwatch/SoundwatchOTA.h esp/src/soundwatch/SoundwatchOTA.cpp
git commit -m "feat: add SoundwatchOTA — periodic and MQTT-triggered HTTP OTA updates"
```

---

## Task 7: SoundwatchManager — Orchestrator + Main Loop Integration

**Repo:** `soundwatch-firmware`

**Files:**
- Create: `esp/src/soundwatch/SoundwatchManager.h`
- Create: `esp/src/soundwatch/SoundwatchManager.cpp`
- Modify: `esp/src/SckESP.h`
- Modify: `esp/src/SckESP.cpp`
- Modify: `esp/src/esp.ino`

- [ ] **Step 1: Implement SoundwatchManager**

Create `esp/src/soundwatch/SoundwatchManager.h`:

```cpp
#pragma once

#include "SoundwatchConfig.h"
#include "SoundwatchMQTT.h"
#include "SoundwatchPayload.h"
#include "SoundwatchBuffer.h"
#include "SoundwatchOTA.h"

#define SOUNDWATCH_FIRMWARE_VERSION "0.1.0"

class SoundwatchManager {
public:
    // Initialize all Soundwatch modules. Call once from setup().
    // Returns true if soundwatch.json was found and parsed.
    bool begin();

    // Run all Soundwatch modules. Call every iteration from loop().
    void update();

    // Called by SckESP when a new sensor reading is available.
    // The manager formats it and publishes/buffers as needed.
    void onReadingAvailable(const SensorReading& reading, const char* timestamp);

    // Whether Soundwatch features are active (config was loaded)
    bool isActive() const { return _active; }

private:
    bool _active;
    SoundwatchConfig _config;
    SoundwatchMQTT _mqtt;
    SoundwatchBuffer _buffer;
    SoundwatchOTA _ota;

    // Config command handler
    static void _onConfigCommand(const char* command, const char* payload);
    static SoundwatchManager* _instance;
};
```

Create `esp/src/soundwatch/SoundwatchManager.cpp`:

```cpp
#include "SoundwatchManager.h"
#include <ArduinoJson.h>

SoundwatchManager* SoundwatchManager::_instance = nullptr;

bool SoundwatchManager::begin() {
    _instance = this;
    _active = false;

    if (!loadSoundwatchConfig(_config)) {
        Serial.println("[Soundwatch] No config found — running as stock SCK");
        return false;
    }

    Serial.printf("[Soundwatch] Config loaded for device: %s\n", _config.device_id);

    _mqtt.begin(_config, _onConfigCommand);
    _ota.begin(_config, SOUNDWATCH_FIRMWARE_VERSION);

    _active = true;
    return true;
}

void SoundwatchManager::update() {
    if (!_active) return;

    _mqtt.loop();
    _ota.loop();

    // If connected and have buffered readings, replay them
    if (_mqtt.isConnected() && _buffer.hasPending()) {
        _buffer.replay(_mqtt);
    }
}

void SoundwatchManager::onReadingAvailable(const SensorReading& reading, const char* timestamp) {
    if (!_active) return;

    char payload[512];
    bool ok = formatReadingPayload(
        _config.device_id,
        SOUNDWATCH_FIRMWARE_VERSION,
        timestamp,
        reading,
        payload,
        sizeof(payload)
    );
    if (!ok) return;

    if (_mqtt.isConnected()) {
        _mqtt.publishReading(payload);
    } else {
        _buffer.store(payload);
    }
}

void SoundwatchManager::_onConfigCommand(const char* command, const char* payload) {
    if (!_instance) return;

    if (strcmp(command, "update_config") == 0) {
        StaticJsonDocument<256> doc;
        if (deserializeJson(doc, payload)) return;

        if (doc.containsKey("reading_interval_s")) {
            uint16_t interval = doc["reading_interval_s"];
            _instance->_config.reading_interval_s = interval;
            Serial.printf("[Soundwatch] Reading interval updated to %ds\n", interval);
            // Relay to SAMD21: look at SckESP.cpp for the serial command that sets
            // reading interval. The stock firmware uses SCKMessage over Serial1 at
            // 115200 baud. Find the existing command enum/handler for interval
            // changes and call it here with the new value.
        }
    } else if (strcmp(command, "check_update") == 0) {
        _instance->_ota.checkNow();
        Serial.println("[Soundwatch] OTA check triggered via MQTT");
    }
}
```

- [ ] **Step 2: Integrate into SckESP**

This step requires reading the actual upstream code to find the exact integration points. The changes are:

**In `esp/src/SckESP.h`**, add a member:

```cpp
// At the top of the file, add:
#include "soundwatch/SoundwatchManager.h"

// Inside the SckESP class, add as a public member:
SoundwatchManager soundwatchManager;
```

**In `esp/src/SckESP.cpp`**, find the `setup()` equivalent and add:

```cpp
// In SckESP::setup() or equivalent initialization method, add:
soundwatchManager.begin();
```

Find `pubReadings()` or wherever sensor data is published to Smart Citizen. After the existing publish call, add:

```cpp
// After the existing MQTT publish to Smart Citizen, add:
if (soundwatchManager.isActive()) {
    SensorReading reading;
    // Map from SCK's internal sensor data structure to our SensorReading struct.
    // The exact field mapping depends on how SckESP stores sensor values.
    // Look at the data structure used in pubReadings() and map accordingly:
    reading.noise_dba = /* SCK noise value */;
    reading.temperature = /* SCK temperature value */;
    reading.humidity = /* SCK humidity value */;
    reading.light_lux = /* SCK light value */;
    reading.pressure_pa = /* SCK pressure value */;
    reading.uv_index = /* SCK UV value */;
    reading.pm1 = /* SCK PM1 value */;
    reading.pm25 = /* SCK PM2.5 value */;
    reading.pm4 = /* SCK PM4 value */;
    reading.pm10 = /* SCK PM10 value */;

    soundwatchManager.onReadingAvailable(reading, /* ISO 8601 timestamp */);
}
```

**Important:** The exact field names for SCK's internal sensor data must be read from `SckESP.cpp`. Look at how `pubReadings()` constructs its MQTT payload — it reads from some internal data structure. Map those same values to our `SensorReading` struct.

**In `esp/src/SckESP.cpp`**, find the `update()` method and add:

```cpp
// Inside SckESP::update(), add:
soundwatchManager.update();
```

- [ ] **Step 3: Verify it compiles**

```bash
pio run
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add esp/src/soundwatch/SoundwatchManager.h esp/src/soundwatch/SoundwatchManager.cpp
git add esp/src/SckESP.h esp/src/SckESP.cpp
git commit -m "feat: add SoundwatchManager and integrate into SckESP main loop"
```

---

## Task 8: CI — GitHub Actions for PlatformIO

**Repo:** `soundwatch-firmware`

**Files:**
- Create: `.github/workflows/firmware.yml`

- [ ] **Step 1: Create the CI workflow**

Create `.github/workflows/firmware.yml`:

```yaml
name: Firmware CI

on:
  push:
    branches: [main, soundwatch/**]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install PlatformIO
        run: pip install platformio

      - name: Build ESP8266 firmware
        working-directory: esp
        run: pio run

      - name: Run native tests
        working-directory: esp
        run: pio test -e native

      - name: Upload firmware artifact
        if: github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/')
        uses: actions/upload-artifact@v4
        with:
          name: firmware
          path: esp/.pio/build/esp8266/firmware.bin

  release:
    needs: build
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/v')
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: firmware

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: firmware.bin
          generate_release_notes: true
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/firmware.yml
git commit -m "ci: add GitHub Actions workflow for PlatformIO build, test, and release"
```

---

## Task 9: Integration Testing on Hardware

**Repo:** `soundwatch-firmware`

No automated tests — this is manual hardware validation with an actual SCK 2.3.

- [ ] **Step 1: Prepare the SD card**

Create a `soundwatch.json` file on the SCK's SD card:

```json
{
  "device_id": "sck-dev-001",
  "mqtt": {
    "broker": "localhost",
    "port": 1883,
    "username": "sck-dev-001",
    "password": "devpass"
  },
  "reading_interval_s": 10,
  "ota": {
    "url": "http://localhost:3000/api/firmware/latest",
    "check_interval_s": 86400
  }
}
```

Note: Use `localhost`/port `1883` (no TLS) for local dev testing. The sensor connects to the dev machine's Mosquitto.

- [ ] **Step 2: Start local Mosquitto and subscribe to topics**

```bash
# Terminal 1: start Mosquitto (from the soundwatch repo)
docker compose -f docker-compose.dev.yml up mosquitto

# Terminal 2: subscribe to all Soundwatch topics
mosquitto_sub -h localhost -p 1883 -t 'soundwatch/sensors/#' -v
```

- [ ] **Step 3: Flash the firmware and boot the sensor**

```bash
cd esp
pio run --target upload
```

Insert the SD card, power on the sensor. Watch Terminal 2 for:
1. Status message on `soundwatch/sensors/sck-dev-001/status` → `{"status":"online","device_id":"sck-dev-001"}`
2. Reading messages on `soundwatch/sensors/sck-dev-001/readings` every 10 seconds

- [ ] **Step 4: Test remote config**

```bash
mosquitto_pub -h localhost -p 1883 \
  -t 'soundwatch/sensors/sck-dev-001/config' \
  -m '{"command":"update_config","reading_interval_s":5}'
```

Verify readings now arrive every 5 seconds.

- [ ] **Step 5: Test offline buffering**

1. Stop Mosquitto (`docker compose down`)
2. Wait for 2-3 reading intervals
3. Restart Mosquitto and re-subscribe
4. Verify buffered readings are replayed (should see a burst of messages)

- [ ] **Step 6: Verify Smart Citizen still publishes independently**

Check `mqtt.smartcitizen.me` or the Smart Citizen web dashboard to confirm the stock MQTT connection is still publishing normally alongside our Soundwatch connection.
