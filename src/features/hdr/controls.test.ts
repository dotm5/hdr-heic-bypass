import { describe, expect, it } from 'vitest'
import { normalizeHdrGainMapControls } from './controls'
import { migrateLegacyControls } from './migrateControls'
import { defaultBypassOptions, hdrPresets } from './presets'
import { hdrControlRanges } from './ranges'
import type { HdrGainMapControls } from './types'

describe('HDR controls', () => {
  it('keeps default controls valid', () => {
    expectControlInRanges(defaultBypassOptions)
  })

  it('keeps preset values inside declared ranges', () => {
    for (const preset of Object.values(hdrPresets)) {
      expectControlInRanges(preset)
    }
  })

  it('migrates legacy controls without throwing', () => {
    const migrated = migrateLegacyControls({
      strength: 0.5,
      headroom: 4,
      highlightStart: 0.25,
      highlightEnd: 0.9,
      shadows: 1,
      whites: 1,
      edgeSmoothRadius: 12,
    })
    expect(migrated.hdrStrengthStops).toBeCloseTo(0.925)
    expect(migrated.headroomStops).toBeCloseTo(2)
  })

  it('clamps controls before they reach the pipeline', () => {
    const normalized = normalizeHdrGainMapControls({
      ...defaultBypassOptions,
      hdrStrengthStops: 99,
      highlightStartPct: 0,
      highlightRolloffPct: 0,
      edgeAwareRadius: 99,
      edgeAwareEps: 1,
    })

    expect(normalized.hdrStrengthStops).toBe(hdrControlRanges.hdrStrengthStops.max)
    expect(normalized.highlightStartPct).toBe(hdrControlRanges.highlightStartPct.min)
    expect(normalized.highlightRolloffPct).toBeCloseTo(normalized.highlightStartPct + 0.1)
    expect(normalized.edgeAwareRadius).toBe(hdrControlRanges.edgeAwareRadius.max)
    expect(normalized.edgeAwareEps).toBe(hdrControlRanges.edgeAwareEps.max)
  })
})

function expectControlInRanges(control: HdrGainMapControls) {
  expect(control.hdrStrengthStops).toBeGreaterThanOrEqual(hdrControlRanges.hdrStrengthStops.min)
  expect(control.hdrStrengthStops).toBeLessThanOrEqual(hdrControlRanges.hdrStrengthStops.max)
  expect(control.highlightStartPct).toBeGreaterThanOrEqual(hdrControlRanges.highlightStartPct.min)
  expect(control.highlightStartPct).toBeLessThanOrEqual(hdrControlRanges.highlightStartPct.max)
  expect(control.highlightRolloffPct).toBeGreaterThan(control.highlightStartPct)
  expect(control.highlightRolloffPct).toBeLessThanOrEqual(hdrControlRanges.highlightRolloffPct.max)
  expect(control.shadowLift).toBeGreaterThanOrEqual(hdrControlRanges.shadowLift.min)
  expect(control.shadowLift).toBeLessThanOrEqual(hdrControlRanges.shadowLift.max)
  expect(control.colorProtect).toBeGreaterThanOrEqual(hdrControlRanges.colorProtect.min)
  expect(control.colorProtect).toBeLessThanOrEqual(hdrControlRanges.colorProtect.max)
  expect(control.detail).toBeGreaterThanOrEqual(hdrControlRanges.detail.min)
  expect(control.detail).toBeLessThanOrEqual(hdrControlRanges.detail.max)
  expect(control.headroomStops).toBeGreaterThanOrEqual(hdrControlRanges.headroomStops.min)
  expect(control.headroomStops).toBeLessThanOrEqual(hdrControlRanges.headroomStops.max)
  expect(control.midtoneLock).toBeGreaterThanOrEqual(hdrControlRanges.midtoneLock.min)
  expect(control.midtoneLock).toBeLessThanOrEqual(hdrControlRanges.midtoneLock.max)
  expect(control.whitePointGuardPct).toBeGreaterThanOrEqual(hdrControlRanges.whitePointGuardPct.min)
  expect(control.whitePointGuardPct).toBeLessThanOrEqual(hdrControlRanges.whitePointGuardPct.max)
  expect(control.blackPointGuardPct).toBeGreaterThanOrEqual(hdrControlRanges.blackPointGuardPct.min)
  expect(control.blackPointGuardPct).toBeLessThanOrEqual(hdrControlRanges.blackPointGuardPct.max)
  expect(control.edgeAwareRadius).toBeGreaterThanOrEqual(hdrControlRanges.edgeAwareRadius.min)
  expect(control.edgeAwareRadius).toBeLessThanOrEqual(hdrControlRanges.edgeAwareRadius.max)
  expect(control.edgeAwareEps).toBeGreaterThanOrEqual(hdrControlRanges.edgeAwareEps.min)
  expect(control.edgeAwareEps).toBeLessThanOrEqual(hdrControlRanges.edgeAwareEps.max)
  expect(control.clipGuard).toBeGreaterThanOrEqual(hdrControlRanges.clipGuard.min)
  expect(control.clipGuard).toBeLessThanOrEqual(hdrControlRanges.clipGuard.max)
  expect(control.gainMapGamma).toBeGreaterThanOrEqual(hdrControlRanges.gainMapGamma.min)
  expect(control.gainMapGamma).toBeLessThanOrEqual(hdrControlRanges.gainMapGamma.max)
}
