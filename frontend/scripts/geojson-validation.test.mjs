import test from 'node:test'
import assert from 'node:assert/strict'
import { validateImportPayload } from '../src/lib/geojsonValidation.ts'

function point(x = 105, y = 31) {
  return { type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: {} }
}
function featureCollection(features) {
  return { type: 'FeatureCollection', features }
}
test('accepts valid WGS84 point, line and polygon', () => {
  validateImportPayload(featureCollection([
    point(),
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[105,31],[105.1,31.1]] }, properties: null },
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[105,31],[105.1,31],[105.1,31.1],[105,31]]] }, properties: {} },
  ]), 0)
})
test('rejects malformed collections and geometry', () => {
  for (const data of [null, [], {}, featureCollection([]), featureCollection([{type:'Feature',geometry:null,properties:{}}]),featureCollection([{type:'Feature',geometry:{type:'GeometryCollection',geometries:[]},properties:{}}])]) {
    assert.throws(() => validateImportPayload(data, 0))
  }
})
test('rejects foreign CRS, out-of-range, nonfinite and nested invalid positions', () => {
  assert.throws(() => validateImportPayload({ ...featureCollection([point()]), crs:{ type:'name', properties:{ name:'EPSG:3857' }} }, 0))
  for (const bad of [[1000,30],[105,200],[NaN,30],[Infinity,31],['105',31],[105],[105,31,0,1]]) {
    const f=point(); f.geometry.coordinates=bad
    assert.throws(() => validateImportPayload(featureCollection([f]), 0))
  }
  assert.throws(() => validateImportPayload(featureCollection([{type:'Feature',geometry:{type:'LineString',coordinates:[[105,31],[]]},properties:{}}]),0))
})
test('enforces total feature and coordinate budget', () => {
  assert.throws(() => validateImportPayload(featureCollection([point()]), 5000))
  assert.throws(() => validateImportPayload(featureCollection(Array.from({length:5001},()=>point())),0))
  const line = Array.from({length:30001},()=>[105,31])
  assert.throws(() => validateImportPayload(featureCollection([{type:'Feature',geometry:{type:'LineString',coordinates:line},properties:{}}]),0))
})
test('rejects invalid attribute shapes', () => {
  const f=point(); f.properties=[]
  assert.throws(() => validateImportPayload(featureCollection([f]),0))
})
