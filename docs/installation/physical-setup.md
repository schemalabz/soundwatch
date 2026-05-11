# Soundwatch Athens — Physical Installation Guide

## Overview

Each Skroutz store installation consists of two separate enclosures connected by a USB cable:

1. **Power Box** — inside the existing junction box (κουτί κλέμας) at the store
2. **Sensor Box** — separate enclosure housing the Smart Citizen Kit 2.3

This separation keeps 230V mains isolated from the sensor, simplifies installation, and allows sensor maintenance without touching the electrical side.

## Architecture

```
┌─────────────────────────────────────────┐
│  POWER BOX (existing junction box)      │
│                                         │
│  κλέμα 230V AC                          │
│    ├── L (φάση)                         │
│    │    └── ασφάλεια 1.6A ─┐             │
│    │                      ▼             │
│    │              ┌──────────────┐       │
│    │              │ MeanWell     │       │
│    │              │ IRM-10-5     │       │
│    │              │              │       │
│    │              │ AC/L    +V ──┼── Red ─────┐
│    └── N ────────►│ AC/N    -V ──┼── Blk ───┐ │
│                   └──────────────┘       │  │ │
│                                         │  │ │
│            cable gland ─────────────────┼──┼─┼──►
└─────────────────────────────────────────┘  │ │
                                             │ │
                    USB cable (1-2m)          │ │
                    ┌────────────────────────┘ │
                    │  ┌───────────────────────┘
                    │  │
┌───────────────────┼──┼──────────────────┐
│  SENSOR BOX       │  │                  │
│                   ▼  ▼                  │
│              micro USB connector        │
│                   │                     │
│           ┌───────┴───────┐             │
│           │  SCK 2.3      │             │
│           │  + LiPo       │             │
│           │    2000mAh    │             │
│           └───────────────┘             │
│                                         │
└─────────────────────────────────────────┘
```

## Components Per Installation

### Power Side (inside junction box)

| Component | Specs | Notes |
|-----------|-------|-------|
| AC-DC Converter | MeanWell IRM-10-5 (230V AC → 5V DC, 2A, 10W) | [Recommended by Smart Citizen project](https://docs.smartcitizen.me/hardware/addons/power-supply/) |
| Fuse + Holder | 1.6A glass fuse, 5x20mm, with inline holder | 1.6A per [Smart Citizen spec](https://enclosures.smartcitizen.me/Power%20Options/) — handles inrush current |
| Cable Gland | PG7 or M12 | For USB cable exit from junction box |
| Wire | 0.5mm² stranded, L+N | Short leads from κλέμα to converter |
| Heat Shrink | Assorted | For all solder joints |

### Connection (between boxes)

| Component | Specs | Notes |
|-----------|-------|-------|
| USB Cable | USB-A to Micro USB, 1-2m | Length depends on box placement at store |

Note: For the USB cable, we cut the USB-A end and solder the +5V (red) and GND (black) wires directly to the IRM-10-5 output pins (+V and -V). The micro USB end plugs into the SCK.

### Sensor Side

| Component | Specs | Notes |
|-----------|-------|-------|
| Smart Citizen Kit 2.3 | With Urban Board + SEN5X PM sensor | The sensor unit |
| LiPo Battery | 2000mAh (included with SCK) | Acts as UPS, always connected |
| Enclosure | TBD — needs ventilation for accurate readings | Must allow sound and air to reach sensors |

## Wiring Steps

### 1. Power Box Assembly

1. **Mount the fuse holder** near the κλέμα inside the junction box
2. **Mount the IRM-10-5** — can be secured with double-sided tape, hot glue, or a small bracket (the module is only 45.7 × 25.4 × 21.5mm)
3. **Wire AC side:**
   - Κλέμα L (φάση) → fuse holder (1.6A) → solder to **AC/L** pin on IRM-10-5
   - Κλέμα N (ουδέτερος) → solder to **AC/N** pin on IRM-10-5
4. **Wire DC side:**
   - Cut the USB-A end off the USB cable
   - Identify the red (+5V) and black (GND) wires
   - Solder red wire to **+V** pin on IRM-10-5
   - Solder black wire to **-V** pin on IRM-10-5
   - (Ignore white/green data wires — not needed for power only)
5. **Install cable gland** on junction box wall, pass USB cable through
6. **Apply heat shrink** on all solder joints
7. **Test**: measure DC output with multimeter before connecting sensor — should read ~5V

### 2. Sensor Box Assembly

1. Place SCK 2.3 in its enclosure with battery connected
2. Plug the micro USB cable from the power box
3. Verify SCK powers on (LED sequence)

### 3. Network Configuration

1. Connect SCK to store WiFi via the Smart Citizen onboarding process
2. Configure dual MQTT publish (Smart Citizen + Soundwatch broker)
3. Verify readings appear on the Soundwatch platform

## Safety Notes

- All 230V wiring should be done by a qualified electrician
- The IRM-10-5 must remain inside the enclosed junction box — never exposed
- Always disconnect mains before working inside the junction box
- The 1.6A fuse protects against short circuits (value per Smart Citizen spec, accommodates IRM-10-5 inrush current)
- The SCK battery provides backup power if mains is interrupted

## Sensor Placement Considerations

- Mount outdoors or near a window/opening for accurate noise readings
- Avoid placing directly next to HVAC units, fans, or other constant noise sources
- The MEMS microphone (ICS-43432) needs unobstructed exposure to ambient sound
- The PM sensor (SEN5X) needs airflow — don't seal the enclosure completely
- Ideal height: 2-4m from ground level

## IRM-10-5 Pin Layout (Bottom View)

```
     ┌──────────────────────────────────┐
     │                                  │
     │          BOTTOM VIEW             │
     │                                  │
     │  AC/L ●                  ● -V    │
     │                                  │
     │                                  │
     │  AC/N ●                  ● +V    │
     │                                  │
     └──────────────────────────────────┘

Left side:  AC input (230V from κλέμα)
Right side: DC output (5V to sensor)
```
