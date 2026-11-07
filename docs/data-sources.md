# GISTable 公共影像数据源及许可

此文件属于工程资料，供开发和交付人员评估外部依赖；内容不用于代替影像采购合同。

## EOxCloudless 2016
- 图层：`s2cloudless_3857`
- 服务端点：`https://tiles.maps.eox.at/map`（WMS）
- 产品：Sentinel-2 2016 云少合成影像（EOX 发布）
- 许可：CC BY 4.0；需署名，不包含生产 SLA。
- 必须显示：EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017)
- 厂商规定 2018 年及以后公共图层为非商业许可；**不得**在未获取商业授权时接入商业版 GISTable。

官方资料：
- https://cloudless.eox.at/license-non-commercial
- https://cloudless.eox.at/documentation/faq

## NASA GIBS 日影像
- 图层：`MODIS_Terra_CorrectedReflectance_TrueColor`
- 日期：2024-06-15 / 2025-06-15
- WMTS/XYZ：`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/`
- 网页最大原生缩放层级约 8，对应约 250m 分辨率；高倍缩放只是重采样，不会增加细节。
- 需保留 NASA GIBS / Terra MODIS 数据来源署名。
- 数据并非实时交通监管证据；云层和季节差异会影响判读。

官方资料：
- https://nasa-gibs.github.io/gibs-api-docs/access-basics/
- https://nasa-gibs.github.io/gibs-api-docs/access-advanced-topics/

## 自有卫星数据接入路线
在取得有授权的真实 GeoTIFF、采集时间、坐标参考系与允许发布范围后，通过私有存储、COG 转换与授权瓦片服务进行接入，禁止将未获公开许可的原始影像提交到 GitHub Pages。

数据版权、发布地域和测绘合规应由项目实施主体核实。
