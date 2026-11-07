import TileWMS from 'ol/source/TileWMS'
import XYZ from 'ol/source/XYZ'
import type TileSource from 'ol/source/Tile'

export type ImageId = 'sentinel2016' | 'modis2024' | 'modis2025'
export interface ImageEntry {
  id: ImageId
  name: string
  provider: string
  resolution: string
}

export const imageCatalog: ImageEntry[] = [
  { id: 'sentinel2016', name: 'Sentinel-2 · 2016 年合成影像', provider: 'EOxCloudless', resolution: '约 10 m' },
  { id: 'modis2024', name: 'MODIS · 2024-06-15', provider: 'NASA GIBS', resolution: '约 250 m' },
  { id: 'modis2025', name: 'MODIS · 2025-06-15', provider: 'NASA GIBS', resolution: '约 250 m' },
]

const eoxAttribution = 'EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017) - CC BY 4.0'
const nasaAttribution = 'NASA GIBS / Terra MODIS, NASA Earthdata'

export function makeImagerySource(id: ImageId): TileSource {
  if (id === 'sentinel2016') {
    return new TileWMS({
      url: 'https://tiles.maps.eox.at/map',
      params: { LAYERS: 's2cloudless_3857', FORMAT: 'image/jpeg', TILED: true, VERSION: '1.1.1' },
      crossOrigin: 'anonymous',
      attributions: eoxAttribution,
      transition: 150,
    })
  }
  const date = id === 'modis2024' ? '2024-06-15' : '2025-06-15'
  return new XYZ({
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/' + date + '/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
    maxZoom: 8,
    crossOrigin: 'anonymous',
    attributions: nasaAttribution,
    transition: 150,
  })
}
