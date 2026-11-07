# GISTable

公路遥感监测与巡查执法管理平台。

项目采用 Vue 3、TypeScript、Vite、OpenLayers。地图、业务要素和数据访问分层组织；正式后端、空间数据库及私有影像服务按《系统架构与实施执行规范 v1.1》逐步接入。

## 在线工作台

已发布地址：https://ktimxfgit.github.io/GISTable/

## 本地运行

```bash
cd frontend
npm ci
npm run dev
```

构建：

```bash
cd frontend
npm run check:ui
npm run build
```

Node.js 推荐 22 LTS。GitHub Pages 使用 `/GISTable/` 子路径；本地及正式环境通过构建变量设置 `VITE_BASE_PATH`。

## 数据说明

`frontend/public/sample-data/objects.geojson` 包含用于软件界面及 GIS 操作验证的合成线路与点要素，不对应真实公路资产、巡查结论或执法证据，不能作为公路管理和执法依据。地图底图来自 OpenStreetMap，须保留数据来源署名并遵守瓦片使用政策。

静态站点的点线面标注与属性可编辑并自动存入当前浏览器的 localStorage（受浏览器容量及清理策略约束），同时支持导入、导出 GeoJSON；这些数据**并未同步至服务器**，无法跨浏览器或设备共享，正式业务及敏感地理信息不得依赖浏览器本地存储。正式业务数据、账号和私有影像不能提交到本公开仓库。

## 影像浏览

- EOxCloudless 2016 年 Sentinel-2 合成影像：CC BY 4.0，允许有署名的商业集成，受公共服务公平使用及无可用性保证限制。
- NASA GIBS Terra/MODIS 2024-06-15 与 2025-06-15 日影像：供真实历史时相对比，原始数据分辨率约 250m，不能替代高分辨率卫星影像用于违法建筑或精细公路识别。
- 卷帘比较在相同地图坐标下渲染两期栅格图层，数据源可能有不同空间精度、采集季节、云量、分辨率，不直接构成违法认定依据。
- 对自购 GeoTIFF 的服务端上传、转换和私有授权访问仍需后续后端集成。

详见 [公开影像数据源与许可说明](docs/data-sources.md)。

## 设计文档

[系统架构与实施执行规范 v1.1](docs/GISTable_系统架构与实施执行规范_v1.1.md)
