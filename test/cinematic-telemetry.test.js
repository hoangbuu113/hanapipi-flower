import test from 'node:test'
import assert from 'node:assert/strict'
import { createTelemetryBuffer, startCinematicTelemetry, cinematicTelemetry } from '../src/components/cinematic/cinematicTelemetry.js'
test('normal/server route installs no telemetry or browser APIs', () => { assert.equal(startCinematicTelemetry(), undefined); assert.equal(cinematicTelemetry, null) })
test('bounded ring preserves chronological records, overflow and timestamp', () => { let at = 10; const b = createTelemetryBuffer({ capacity: 3, now: () => at }); b.record('sample', 9); assert.equal(b.export().records.length, 0); b.start(); for(let i=0;i<5;i++){ at++;b.record('draw',i) } b.stop(); at=500; b.record('draw',99); const r=b.export();assert.equal(r.dropped,2);assert.deepEqual(r.records,[[3,'draw',2],[4,'draw',3],[5,'draw',4]]);assert.equal(r.durationMs,5);assert.equal(r.startPerformanceMs,10) })
test('disabled query leaves DOM, RAF and observers untouched', () => { globalThis.window={location:{search:'?cinematicTelemetry=0'}}; try { assert.equal(startCinematicTelemetry(),undefined);assert.equal(cinematicTelemetry,null) } finally { delete globalThis.window } })
